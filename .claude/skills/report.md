---
version: "3.1.0"
display_name: "技术情报周报"
description: |
  六阶段生成标准化技术情报周报：数据收集→信号识别→分析框架→内容生成→质量检查→图谱关联。
  输出严格 JSON，符合 ReportContent v2 schema。
category: reporting
timeout: 1200
allowedTools:
  - Bash
params:
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
  - name: topicName
    type: string
    required: true
    description: "主题名称"
  - name: reportType
    type: string
    required: false
    default: "weekly"
    description: "报告类型"
  - name: timeRangeStart
    type: string
    required: false
    description: "时间范围起始日期（默认 7 天前）"
  - name: timeRangeEnd
    type: string
    required: false
    description: "时间范围结束日期（默认今天）"
steps:
  - "数据收集：查询文档/实体/关系/事件/主张 + 时间分布 + 组织活跃度"
  - "信号识别：从数据中提取突破/趋势/衰减信号"
  - "分析框架：竞争者画像、资本方向、交叉验证、差距评估"
  - "内容生成：按 6 章节生成严格 JSON，包含实体引用"
  - "质量检查：验证数据完整性、格式规范性、逻辑一致性"
  - "图谱关联：提取 entityRefs 用于后续图谱关联"
---

# 咨询级技术情报周报生成 v3.1

你是一个资深技术情报分析师，对标 Gartner/McKinsey 技术情报周报标准。
请严格按六阶段流程完成报告，最终输出 **纯 JSON**（无 markdown 包裹）。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 报告类型：{{reportType}}
- 时间范围：{{timeRangeStart}} ~ {{timeRangeEnd}}

---

## 第一阶段：数据收集

使用 Bash 工具执行以下 Node.js 脚本查询数据：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const topicId = '{{topicId}}';
const startDate = '{{timeRangeStart}}';
const endDate = '{{timeRangeEnd}}';
const hasDate = startDate && endDate;

// 1. 获取文档
const docs = hasDate
  ? db.prepare(\`SELECT id, title, source, published_date, substr(content, 1, 500) as excerpt FROM documents WHERE topic_id = ? AND published_date >= ? AND published_date <= ? ORDER BY published_date DESC LIMIT 30\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT id, title, source, published_date, substr(content, 1, 500) as excerpt FROM documents WHERE topic_id = ? ORDER BY published_date DESC LIMIT 30\`).all(topicId);

// 2. 获取实体
const entities = hasDate
  ? db.prepare(\`SELECT e.text, e.type, e.confidence, COUNT(*) as mentions FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? GROUP BY e.text ORDER BY mentions DESC LIMIT 30\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT e.text, e.type, e.confidence, COUNT(*) as mentions FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? GROUP BY e.text ORDER BY mentions DESC LIMIT 30\`).all(topicId);

// 3. 获取关系
const relations = hasDate
  ? db.prepare(\`SELECT r.source_text, r.relation, r.target_text, r.confidence FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? ORDER BY r.confidence DESC LIMIT 30\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT r.source_text, r.relation, r.target_text, r.confidence FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = ? ORDER BY r.confidence DESC LIMIT 30\`).all(topicId);

// 4. 获取事件
const events = hasDate
  ? db.prepare(\`SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? ORDER BY ev.event_time DESC LIMIT 20\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? ORDER BY ev.event_time DESC LIMIT 20\`).all(topicId);

// 5. 获取主张
const claims = hasDate
  ? db.prepare(\`SELECT c.text, c.polarity, c.confidence FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? ORDER BY c.confidence DESC LIMIT 20\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT c.text, c.polarity, c.confidence FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = ? ORDER BY c.confidence DESC LIMIT 20\`).all(topicId);

// 6. 时间分布
const timeDist = hasDate
  ? db.prepare(\`SELECT date(ev.event_time) as d, count(*) as cnt FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? GROUP BY d ORDER BY d\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT date(ev.event_time) as d, count(*) as cnt FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? AND ev.event_time >= date('now', '-30 days') GROUP BY d ORDER BY d\`).all(topicId);

// 7. 组织活跃度
const orgActivity = hasDate
  ? db.prepare(\`SELECT e.text, e.type, COUNT(*) as cnt FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? AND e.type = 'Organization' GROUP BY e.text ORDER BY cnt DESC LIMIT 15\`).all(topicId, startDate, endDate)
  : db.prepare(\`SELECT e.text, e.type, COUNT(*) as cnt FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND e.type = 'Organization' GROUP BY e.text ORDER BY cnt DESC LIMIT 15\`).all(topicId);

// 8. 统计
const docCount = hasDate
  ? db.prepare('SELECT COUNT(*) as count FROM documents WHERE topic_id = ? AND published_date >= ? AND published_date <= ?').get(topicId, startDate, endDate)
  : db.prepare('SELECT COUNT(*) as count FROM documents WHERE topic_id = ?').get(topicId);
const entityCount = hasDate
  ? db.prepare('SELECT COUNT(DISTINCT e.text) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ?').get(topicId, startDate, endDate)
  : db.prepare('SELECT COUNT(DISTINCT e.text) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?').get(topicId);

console.log(JSON.stringify({ docs, entities, relations, events, claims, timeDist, orgActivity, docCount, entityCount }, null, 2));
"
```

**重要**：如果 better-sqlite3 不可用，使用以下替代方案：

```bash
node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

const topicId = '{{topicId}}';
const startDate = '{{timeRangeStart}}';
const endDate = '{{timeRangeEnd}}';
const hasDate = startDate && endDate;
const results = {};

const docFilter = hasDate ? 'AND published_date >= ? AND published_date <= ?' : '';
const docParams = hasDate ? [topicId, startDate, endDate] : [topicId];

db.serialize(() => {
  db.all('SELECT id, title, source, published_date FROM documents WHERE topic_id = ? ' + docFilter + ' ORDER BY published_date DESC LIMIT 30', docParams, (err, rows) => {
    results.docs = rows || [];
    db.all('SELECT text, type, confidence FROM entities WHERE document_id IN (SELECT id FROM documents WHERE topic_id = ? ' + docFilter + ') LIMIT 30', docParams, (err, rows) => {
      results.entities = rows || [];
      db.all('SELECT source_text, relation, target_text FROM relations WHERE document_id IN (SELECT id FROM documents WHERE topic_id = ? ' + docFilter + ') LIMIT 30', docParams, (err, rows) => {
        results.relations = rows || [];
        db.all('SELECT type, title, description, event_time FROM events WHERE document_id IN (SELECT id FROM documents WHERE topic_id = ? ' + docFilter + ') ORDER BY event_time DESC LIMIT 20', docParams, (err, rows) => {
          results.events = rows || [];
          db.get('SELECT COUNT(*) as count FROM documents WHERE topic_id = ? ' + docFilter, docParams, (err, row) => {
            results.docCount = row?.count || 0;
            db.close();
            console.log(JSON.stringify(results, null, 2));
          });
        });
      });
    });
  });
});
"
```

---

## 第二阶段：信号识别

基于收集到的数据，进行以下分析：

### 2a. 信号分类标准

| 信号类型 | 定义 | 识别规则 | 示例 |
|----------|------|----------|------|
| breakthrough | 单次出现但影响重大 | 高影响事件 + 权威来源 + 独特性 | GPT-5 发布、量子纠错突破 |
| trend | 多次提及的同一主题 | 同一实体 3+ 次提及 | 某技术路线持续升温 |
| milestone | 技术发展的重要节点 | 进展节点 + 阶段性成果 | 量产时间表确定 |
| declining | 活跃度下降的方向 | 提及频率下降 > 50% | 某技术路线被放弃 |

### 2b. 竞争者画像

按组织实体聚合所有相关行动，推断策略意图：
- **技术押注方向**：从事件类型和内容推断
- **资本投入信号**：从 funding、investment 事件推断
- **合作/竞争关系变化**：从关系类型推断

### 2c. 资本方向

从 funding、partnership、investment 类事件中推断：
- 资本流向的技术方向
- 新兴投资热点
- 投资降温领域

### 2d. 交叉验证

检查 claims 中的正负面主张：
- 多源佐证的主张（2+ 来源）→ 高置信度 (> 0.8)
- 单一来源的主张 → 标注需验证 (0.5-0.8)
- 矛盾主张 → 标注争议点 (< 0.5)

### 2e. 差距评估

识别哪些关键词/主题未被充分覆盖，标注信息盲区。

---

## 第三阶段：分析框架

### 3a. 技术雷达扫描

```
技术成熟度评估模型：
├── 突破性进展
│   └── 标准：单次高影响 + 权威来源 + 独特性
├── 里程碑事件
│   └── 标准：进展节点 + 阶段性成果
├── 趋势性信号
│   └── 标准：3+ 次提及 + 一致性方向
└── 衰减信号
    └── 标准：频率下降 > 50% + 投资减少
```

### 3b. 竞争态势分析

```
组织动态矩阵：
| 组织名称 | 技术投入 | 资本动作 | 产品发布 | 合作关系 | 策略意图 |
|----------|----------|----------|----------|----------|----------|
| ...      | ...      | ...      | ...      | ...      | ...      |
```

### 3c. 投资与合作分析

```
资本流向分析：
├── 重点交易事件
├── 投资热点识别
└── 投资降温领域
```

### 3d. 风险与机遇识别

```
信号分类：
├── 威胁信号
│   └── 标准：负面影响 + 高可能性 + 高影响
├── 机会信号
│   └── 标准：正面影响 + 可操作性 + 时间窗口
└── 影响评估
    └── 标准：影响范围 + 影响程度 + 时间紧迫性
```

---

## 第四阶段：内容生成

严格按以下 JSON Schema 输出。**不要**输出任何 markdown 代码块标记。

### 输出格式 v2.0

```json
{
  "title": "{{topicName}} 技术情报周报 · {{timeRangeStart}} ~ {{timeRangeEnd}}",
  "summary": "执行摘要的 overview 内容（1-2 段核心判断）",
  "content": {
    "version": "2.0",
    "meta": {
      "reportId": "自动生成",
      "topicId": "{{topicId}}",
      "topicName": "{{topicName}}",
      "period": {
        "start": "{{timeRangeStart}}",
        "end": "{{timeRangeEnd}}"
      },
      "generatedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "dataCoverage": {
        "documents": 数字,
        "entities": 数字,
        "events": 数字,
        "claims": 数字
      },
      "confidence": "high|medium|low",
      "confidenceReason": "置信度评估理由"
    },
    "executiveSummary": {
      "overview": "1-2 段核心判断，凝练本周最关键的发现和趋势（200-400字）",
      "keyPoints": [
        {
          "point": "【判断】+ 【依据】+ 【影响】",
          "evidence": ["支撑证据1", "支撑证据2"],
          "impact": "影响描述"
        }
      ],
      "recommendedActions": [
        {
          "action": "建议行动",
          "priority": "high|medium|low",
          "rationale": "行动理由"
        }
      ]
    },
    "sections": [
      {
        "id": "exec_overview",
        "title": "执行摘要",
        "thesis": "一句话核心论点",
        "content": "Markdown 格式的详细分析正文（300-500 字）",
        "highlights": ["要点 1", "要点 2", "要点 3"],
        "signals": [
          {
            "type": "trend|opportunity|threat|milestone|breakthrough",
            "title": "信号标题",
            "description": "信号描述",
            "confidence": 0.85
          }
        ],
        "entityRefs": ["实体名1", "实体名2"]
      },
      {
        "id": "tech_radar",
        "title": "技术雷达",
        "thesis": "技术发展态势一句话总结",
        "content": "技术突破、里程碑、趋势、衰减信号分析",
        "highlights": ["技术要点1", "技术要点2"],
        "signals": [],
        "entityRefs": ["技术实体1", "技术实体2"]
      },
      {
        "id": "competitive_moves",
        "title": "竞争态势",
        "thesis": "竞争格局变化一句话总结",
        "content": "组织动态分析和策略意图推断",
        "highlights": ["竞争要点1", "竞争要点2"],
        "signals": [],
        "entityRefs": ["组织名1", "组织名2"]
      },
      {
        "id": "investment_deals",
        "title": "投资与合作",
        "thesis": "资本流向一句话总结",
        "content": "投资事件和合作动态分析",
        "highlights": ["投资要点1", "投资要点2"],
        "signals": [],
        "entityRefs": ["投资方1", "被投方1"]
      },
      {
        "id": "risk_opportunity",
        "title": "风险与机遇",
        "thesis": "风险机遇一句话总结",
        "content": "威胁和机会识别分析",
        "highlights": ["风险要点1", "机遇要点1"],
        "signals": [],
        "entityRefs": ["相关实体1"]
      },
      {
        "id": "outlook",
        "title": "下周展望",
        "thesis": "未来趋势一句话预判",
        "content": "基于信号的预判和关注点",
        "highlights": ["关注点1", "关注点2"],
        "signals": [],
        "entityRefs": []
      }
    ],
    "timeline": [
      {
        "date": "YYYY-MM-DD",
        "event": "事件描述",
        "significance": "So What? 这个事件意味着什么",
        "entityRefs": ["相关实体1"]
      }
    ],
    "metrics": {
      "documentsAnalyzed": 数字,
      "entitiesCovered": 数字,
      "sourcesCredibility": "X 篇一级来源 / Y 篇二级来源"
    }
  },
  "metadata": {
    "documentsAnalyzed": 数字,
    "entitiesCovered": 数字,
    "period": { "start": "...", "end": "..." },
    "sourcesCredibility": "X 篇一级来源 / Y 篇二级来源",
    "dataGaps": ["信息缺口1", "信息缺口2"]
  }
}
```

---

## 第五阶段：质量检查

输出 JSON 前确认：

### 5a. 数据完整性检查
- [ ] `executiveSummary.keyPoints` 有 3-5 条
- [ ] `sections` 包含全部 6 个章节
- [ ] 每个 section 至少有 1 个 signal
- [ ] `timeline` 至少有 3 条事件（如果事件数据充足）

### 5b. 格式规范性检查
- [ ] 所有 `entityRefs` 中的实体名在数据中真实存在
- [ ] 所有 `confidence` 值在 0-1 之间
- [ ] 日期使用 YYYY-MM-DD 格式

### 5c. 逻辑一致性检查
- [ ] 执行摘要与各章节内容一致
- [ ] 信号标记有明确依据
- [ ] 推荐行动有充分理由

### 5d. 专业性检查
- [ ] 专业术语使用正确
- [ ] 实体名称统一规范
- [ ] 无歧义表述

---

## 第六阶段：图谱关联准备

### 6a. 实体引用规范

在 `entityRefs` 字段中，确保：
1. 实体名称与数据库中的 `entities.text` 完全匹配
2. 优先引用高提及量的实体
3. 每个章节引用 2-5 个关键实体

### 6b. 信号实体关联

每个信号应关联到：
1. 相关技术实体
2. 相关组织实体
3. 相关事件（如有）

---

## 重要约束

1. **禁止网络搜索**：本 skill 只使用 SQLite 中已有的数据生成报告，不要进行任何网络搜索、网页抓取或信息采集。如果数据不足，在报告中标注数据缺口即可。
2. **只输出 JSON**，不要包裹在 markdown 代码块中
3. **不要执行数据库写入操作**，由 server.ts 后处理负责写入数据库
4. 如果某个章节数据不足，仍保留章节但标注"数据不足，待后续采集补充"
5. 日期使用 YYYY-MM-DD 格式
6. 使用中文输出所有内容
7. `entityRefs` 必须是数据库中真实存在的实体名称
8. 每个信号必须有明确的类型和置信度

---

## McKinsey 方法论指引

### SCQA 框架（执行摘要）

在撰写 `executiveSummary` 时使用 SCQA 结构，按 S→C→Q→A 顺序组织 `overview`：
- **S (Situation/情境)**：当前技术领域的基本态势（1-2 句）
  - 示例："过去 6 个月，大模型推理成本持续下降，开源生态快速扩张。"
- **C (Complication/冲突)**：引发关注的关键变化或矛盾（1-2 句）
  - 示例："但本周 X 公司发布的新架构将推理效率提升 5 倍，可能打破现有成本竞争格局。"
- **Q (Question/疑问)**：由此产生的核心问题（1 句）
  - 示例："这一突破是否标志着推理成本竞赛进入新阶段？"
- **A (Answer/回答)**：基于数据的明确判断（1-2 句）
  - 示例："基于多源数据交叉验证，该技术尚处早期，但 6 个月内可能被大规模采用。"

### 金字塔原理（章节结构）

每个 section 遵循金字塔原理的纵向与横向逻辑：
1. **结论先行（纵向）**：`thesis` 放置该章节的核心论点，读者无需读完全文即可理解结论
2. **分组论证（横向）**：`highlights` 列出 3-5 个支撑论点，彼此独立（MECE）、共同支撑结论
3. **数据支撑（纵向深化）**：`content` 中引用具体数据作为证据，每条 highlight 至少有 1 个数据点支撑
4. **逻辑递进（章节间）**：sections 保持因果或递进关系（概览→技术→竞争→投资→风险→展望）

### 假设驱动分析（信号识别）

在第二阶段信号识别中，采用假设驱动方法：
1. **提出假设**：基于初步数据快速形成 1-3 个可验证假设
   - 示例假设："X 公司正在从消费级 AI 转向企业级 AI 战略"
2. **收集证据**：从 documents/claims/events 中寻找支持与反驳证据
3. **验证/修正**：基于证据强度调整置信度
   - 支持 ≥ 2 条 → confidence ≥ 0.8
   - 支持 1 条 → confidence 0.5-0.7
   - 无证据/矛盾 → 标注为 `metadata.dataGaps`

### 80/20 法则（内容聚焦）

周报应聚焦 20% 信号驱动 80% 价值判断：
- **优先覆盖**：breakthrough 信号、组织战略动作、投资流向变化
- **适当精简**：常规性 trend 信号、低影响 milestone、已知衰减信号的重复描述
- 在 `keyPoints` 中体现：每条 point 应解释"为什么这件事在 7 天内值得关注"

### MECE 验证（章节一致性）

生成各 section 后，验证 `highlights` 是否满足 MECE：
- **互斥性**：不同 highlights 之间不描述同一件事（避免"技术突破"和"性能提升"指向同一事件）
- **完备性**：highlights 共同覆盖该章节的核心发现（无遗漏重要信号）
- 实操：在脑海中反向检查——去掉任一条 highlight，结论是否仍完整？

---

## 数据不足时的处理

如果数据库查询返回空结果或数据不足：

1. **仍生成报告框架**：保留所有章节结构
2. **标注数据缺口**：在 `metadata.dataGaps` 中列出缺失的数据类型
3. **降低置信度**：将 `meta.confidence` 设为 `low`
4. **说明原因**：在 `meta.confidenceReason` 中说明数据不足的情况

示例：
```json
{
  "meta": {
    "confidence": "low",
    "confidenceReason": "数据库中该主题的文档数量不足（仅 2 篇），建议先执行数据采集"
  },
  "metadata": {
    "dataGaps": ["缺乏近期新闻数据", "缺乏投资事件数据", "缺乏技术论文数据"]
  }
}
```
