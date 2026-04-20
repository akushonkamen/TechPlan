---
version: "1.0.0"
display_name: "知识抽取"
description: |
  从文档中抽取结构化知识（实体、关系、主张、事件），
  存入 SQLite 和 Neo4j 图数据库。
category: extraction
timeout: 900
model: glm-4.7
params:
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
  - name: documentIds
    type: string
    required: false
    description: "文档 ID 列表（JSON 数组字符串，为空则处理全部）"
  - name: extractTypes
    type: string
    required: false
    default: "entities,relations,claims,events"
    description: "抽取类型"
steps:
  - "从 SQLite 获取待处理文档"
  - "逐文档抽取实体、关系、主张、事件"
  - "存入 SQLite 数据库"
  - "同步到 Neo4j（如可用）"
---

# NLP 知识抽取

你是一个知识图谱构建专家。请从文档中抽取结构化知识（实体、关系、主张、事件），并存入数据库和图数据库。

## 任务参数

- 主题 ID：{{topicId}}
- 文档 ID 列表（可选）：{{documentIds}}
- 抽取类型：{{extractTypes}}

## 执行步骤

### 1. 获取待处理文档

使用 Bash 工具从 SQLite 获取文档：

```bash
# 如果指定了 documentIds，获取指定文档
# 否则获取该主题下所有有内容的文档
sqlite3 -json database.sqlite "SELECT id, title, content FROM documents WHERE topic_id = '{{topicId}}' AND content IS NOT NULL AND content != '' LIMIT 20;"
```

### 2. 逐文档抽取

对每篇文档，进行以下抽取：

在执行 INSERT 前，先构造一个严格 JSON 结果对象用于校验，格式必须如下（不要包含额外字段）：

```json
{
  "topicId": "{{topicId}}",
  "documentsProcessed": 0,
  "extractionStats": { "entities": 0, "relations": 0, "claims": 0, "events": 0 },
  "entities": [],
  "relations": [],
  "claims": [],
  "events": [],
  "topEntities": []
}
```

字段要求：
- `confidence` 必须在 `0~1`。

#### 置信度校准标准

给 confidence 赋值时，严格遵循以下标准：

| 分值范围 | 含义 | 使用条件 |
|----------|------|----------|
| 0.90-1.00 | 明确事实 | 实体名/关系在文本中直接且无歧义地出现；多个独立段落佐证 |
| 0.75-0.89 | 高度确信 | 文本明确提及但需要一次推理（如"OpenAI 的 GPT-4" → develops 关系） |
| 0.55-0.74 | 中等确信 | 需要两步以上推理，或文本表述含糊（如"某大型科技公司"推断为 Organization） |
| 0.35-0.54 | 低确信 | 间接推断，信息来自上下文暗示而非直接陈述 |
| 0.00-0.34 | 猜测 | 基于常识或模糊线索的推测，仅用于关系推断 |

**关键原则**：
- 不要默认给 0.85-0.95。大多数抽取应在 0.55-0.85 范围。
- 实体名直接出现 → 0.85-0.95；需要消歧 → 0.65-0.80；推断的 → 0.40-0.65。
- 关系强度：直接陈述"A开发了B" → 0.85+；间接暗示 → 0.55-0.75。
- `entities[].type` 仅允许：`Technology|Organization|Person|Product|Location|TimePeriod|Other`。
- `relations[].relation` 仅允许：`develops|competes_with|published_by|uses|invests_in|partners_with|acquires|supports|contradicts|related_to`。
- `claims[].polarity` 仅允许：`positive|negative|neutral`。
- `events[].type` 仅允许：`breakthrough|partnership|product_launch|regulation|funding|acquisition|research|other`。
- 字段 `text/title/source_text/target_text` 不可为空。

#### 实体抽取
从文档中识别：
- **技术/方法** (Technology): 具体技术、算法、方法论
- **组织** (Organization): 公司、研究机构、大学
- **人物** (Person): 研究者、技术负责人
- **产品** (Product): 具体产品、项目名称
- **地点** (Location): 国家、城市、区域
- **时间** (TimePeriod): 时间段、时间点

每个实体包含：`text`（实体名）, `type`（类型）, `confidence`（0-1置信度）

#### 关系抽取
识别实体间的关系，如：
- `develops`（开发）: 组织→技术
- `competes_with`（竞争）: 组织→组织
- `published_by`（发布于）: 技术→组织
- `uses`（使用）: 技术→技术
- `invests_in`（投资）: 组织→技术/组织

每个关系包含：`source_text`, `target_text`, `relation`, `confidence`

#### 主张抽取
识别文档中的关键主张/论断：
- `claim`: 主张内容
- `polarity`: positive / negative / neutral
- `confidence`: 置信度
- `source_context`: 原文上下文

**重要**：主张必须与具体实体关联。分析 claim 文本中提到的实体，确保这些实体已在实体抽取步骤中被抽取。

#### 事件抽取
识别重要事件：
- `type`: breakthrough / partnership / product_launch / regulation / funding
- `title`: 事件标题
- `description`: 事件描述
- `event_time`: 时间
- `participants`: 参与者（JSON数组，**必须使用与已抽取实体完全一致的名称**）
- `confidence`: 置信度

**关键要求**：
- `participants` 中的名称必须与实体抽取步骤中产生的 `entities[].text` 完全一致
- 如果参与者是组织/人物/技术，确保先在实体抽取中包含它们，再在 participants 中引用
- 每个事件至少关联 1 个已抽取的实体作为 participant

### 3. 存入 SQLite

对每条抽取结果，使用 Bash 工具执行 INSERT：

```bash
# 实体
sqlite3 database.sqlite "INSERT INTO entities (id, document_id, text, type, confidence, metadata) VALUES ('$(uuidgen)', '文档ID', '实体名', 'Organization', 0.9, '{}');"

# 关系
sqlite3 database.sqlite "INSERT INTO relations (id, document_id, source_text, target_text, relation, confidence) VALUES ('$(uuidgen)', '文档ID', '源实体', '目标实体', 'develops', 0.85);"

# 主张
sqlite3 database.sqlite "INSERT INTO claims (id, document_id, text, type, polarity, confidence, source_context) VALUES ('$(uuidgen)', '文档ID', '主张内容', 'claim', 'positive', 0.8, '原文片段');"

# 事件
sqlite3 database.sqlite "INSERT INTO events (id, document_id, type, title, description, event_time, participants, confidence) VALUES ('$(uuidgen)', '文档ID', 'breakthrough', '事件标题', '描述', '2025-01', '[\"参与者\"]', 0.9);"
```

注意：对内容中的单引号进行转义（替换为 ''）

### 4. 同步到 Neo4j（可选）

如果 Neo4j 可用，使用 Bash 工具执行：

```bash
scripts/neo4j_helper.sh exec "CREATE (n:Entity {name: '实体名', type: 'Organization'})"
```

### 5. 返回结果

```json
{
  "topicId": "{{topicId}}",
  "documentsProcessed": 5,
  "extractionStats": {
    "entities": 25,
    "relations": 15,
    "claims": 10,
    "events": 8
  },
  "topEntities": [
    {"text": "实体名", "type": "Organization", "confidence": 0.95}
  ]
}
```
