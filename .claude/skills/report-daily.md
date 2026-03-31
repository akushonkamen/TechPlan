---
version: "1.0.0"
display_name: "技术情报日报"
description: |
  快速感知每日变化，浅层扫描新增文档、事件和实体。
  24小时数据范围，聚焦 breakthrough/milestone/alert 类信号，输出精简 JSON。
category: reporting
timeout: 300
params:
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
  - name: topicName
    type: string
    required: true
    description: "主题名称"
  - name: timeRangeStart
    type: string
    required: false
    description: "时间范围起始日期（默认当天 0 点）"
  - name: timeRangeEnd
    type: string
    required: false
    description: "时间范围结束日期（默认当前时间）"
steps:
  - "数据收集：查询 24h 内文档/实体/事件"
  - "信号识别：识别突破/里程碑/预警类信号"
  - "快速分析：简要判断影响程度"
  - "内容生成：输出精简日报 JSON"
  - "质量检查：验证至少 1 条 keyUpdates"
  - "图谱关联：提取 entityRefs 用于后续图谱关联"
---

# 技术情报日报生成 v1.0

你是一个技术情报分析师，专注于快速识别每日关键变化。
请严格按六阶段流程完成报告，最终输出 **纯 JSON**（无 markdown 包裹）。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 时间范围：{{timeRangeStart}} ~ {{timeRangeEnd}}

---

## 第一阶段：数据收集

使用 Bash 工具执行以下 Node.js 脚本查询 24 小时内数据：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const topicId = '{{topicId}}';
const startDate = '{{timeRangeStart}}' || new Date().toISOString().split('T')[0] + 'T00:00:00';
const endDate = '{{timeRangeEnd}}' || new Date().toISOString();

// 1. 获取 24h 内文档
const docs = db.prepare(\`
  SELECT id, title, source, published_date, substr(content, 1, 300) as excerpt
  FROM documents
  WHERE topic_id = ?
    AND published_date >= ?
    AND published_date <= ?
  ORDER BY published_date DESC
  LIMIT 50
\`).all(topicId, startDate, endDate);

// 2. 获取 24h 内实体（按提及次数排序）
const entities = db.prepare(\`
  SELECT e.text, e.type, e.confidence, COUNT(*) as mentions
  FROM entities e
  JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  GROUP BY e.text
  ORDER BY mentions DESC
  LIMIT 20
\`).all(topicId, startDate, endDate);

// 3. 获取 24h 内事件
const events = db.prepare(\`
  SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  ORDER BY ev.event_time DESC
  LIMIT 30
\`).all(topicId, startDate, endDate);

// 4. 获取 24h 内高置信关系
const relations = db.prepare(\`
  SELECT r.source_text, r.relation, r.target_text, r.confidence
  FROM relations r
  JOIN documents d ON r.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND r.confidence > 0.7
  ORDER BY r.confidence DESC
  LIMIT 20
\`).all(topicId, startDate, endDate);

// 5. 获取 24h 内主张（负面/预警）
const claims = db.prepare(\`
  SELECT c.text, c.polarity, c.confidence, c.type
  FROM claims c
  JOIN documents d ON c.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND (c.polarity = 'negative' OR c.type = 'alert' OR c.type = 'risk')
  ORDER BY c.confidence DESC
  LIMIT 15
\`).all(topicId, startDate, endDate);

// 6. 统计
const docCount = db.prepare(\`
  SELECT COUNT(*) as count
  FROM documents
  WHERE topic_id = ?
    AND published_date >= ?
    AND published_date <= ?
\`).get(topicId, startDate, endDate);

const entityCount = db.prepare(\`
  SELECT COUNT(DISTINCT e.text) as count
  FROM entities e
  JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
\`).get(topicId, startDate, endDate);

const eventCount = db.prepare(\`
  SELECT COUNT(*) as count
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
\`).get(topicId, startDate, endDate);

console.log(JSON.stringify({
  docs, entities, relations, events, claims,
  docCount, entityCount, eventCount,
  period: { start: startDate, end: endDate }
}, null, 2));
"
```

---

## 第二阶段：信号识别

基于收集到的 24h 数据，识别以下信号：

### 2a. 信号分类标准（日报精简版）

| 信号类型 | 定义 | 识别规则 |
|----------|------|----------|
| breakthrough | 单次重大突破 | 高影响事件 + 权威来源 + 独特性 |
| milestone | 技术进展节点 | 量产/发布/合作等关键事件 |
| alert | 预警信号 | 负面主张 + 风险事件 + 竞争威胁 |
| trend | 24h 内热点 | 3+ 次提及的同一实体/主题 |

### 2b. 快速影响判断

对识别出的信号，快速判断：
- **高影响**：可能改变竞争格局/技术路线/市场态势
- **中影响**：重要但非颠覆性变化
- **低影响**：常规动态，持续观察

### 2c. 预警识别

从 claims 和 events 中提取：
- **风险预警**：技术失败、监管变化、安全问题
- **机会预警**：市场空白、合作机会、投资热点

---

## 第三阶段：快速分析

### 3a. 数据覆盖评估

- 文档数量是否充足（>10 篇为佳）
- 实体分布是否集中（前 3 实体占比 >30% 为热点集中）
- 事件密度是否正常（>5 个事件为活跃日）

### 3b. 热点识别

- **新增热点**：24h 内首次出现的高频实体
- **持续热点**：之前已存在但持续活跃的实体
- **冷点**：之前活跃但 24h 内无动静的实体

### 3c. 置信度判断

- **high**：数据充足 + 多源佐证 + 权威来源
- **medium**：数据一般 + 单一来源 + 中等置信度
- **low**：数据不足 + 缺乏权威来源

---

## 第四阶段：内容生成

严格按以下 JSON Schema 输出。**不要**输出任何 markdown 代码块标记。

```json
{
  "title": "{{topicName}} 技术情报日报 · YYYY-MM-DD",
  "summary": "核心摘要（100字内）：24h内最关键的1-2个变化",
  "content": {
    "version": "1.0",
    "meta": {
      "reportId": "DAILY-{topicId}-{YYYYMMDD}-{随机8位}",
      "topicId": "{{topicId}}",
      "topicName": "{{topicName}}",
      "type": "daily",
      "period": {
        "start": "{{timeRangeStart}}",
        "end": "{{timeRangeEnd}}"
      },
      "generatedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "dataCoverage": {
        "documents": 数字,
        "entities": 数字,
        "events": 数字
      },
      "confidence": "high|medium|low"
    },
    "keyUpdates": [
      {
        "type": "breakthrough|milestone|alert|trend",
        "title": "更新标题",
        "summary": "一句话摘要（50字内）",
        "significance": "高|中|低",
        "source": "来源",
        "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
      }
    ],
    "dataHighlights": {
      "documentsAdded": [
        "文档标题 · 来源"
      ],
      "topEntities": [
        "实体名（提及次数）"
      ],
      "eventsTimeline": [
        {
          "time": "HH:mm",
          "event": "事件简述"
        }
      ]
    },
    "alerts": [
      {
        "alertType": "risk|opportunity|anomaly",
        "title": "预警标题",
        "description": "预警描述",
        "recommendedAction": "建议行动"
      }
    ]
  },
  "metadata": {
    "documentsAnalyzed": 数字,
    "period": {
      "start": "{{timeRangeStart}}",
      "end": "{{timeRangeEnd}}"
    },
    "dataGaps": ["信息缺口描述"]
  }
}
```

---

## 第五阶段：质量检查

输出 JSON 前确认：

### 5a. 数据完整性检查
- [ ] `keyUpdates` 至少有 1 条（数据不足时标注"今日暂无重大更新"）
- [ ] `dataHighlights` 与查询结果一致
- [ ] `period` 与实际查询范围一致

### 5b. 格式规范性检查
- [ ] `summary` 字数 < 100 字
- [ ] `keyUpdates[].summary` 字数 < 50 字
- [ ] 日期使用 YYYY-MM-DDTHH:mm:ssZ 格式

### 5c. 逻辑一致性检查
- [ ] `significance` 与信号类型匹配
- [ ] `alertType` 与 `recommendedAction` 逻辑一致

---

## 第六阶段：图谱关联准备

在输出中包含 `entityRefs`（通过 entityRefs 字段隐式关联到图谱）：
- 从 `topEntities` 中提取关键实体名
- 确保实体名与数据库中的 `entities.text` 完全匹配

---

## 重要约束

1. **只输出 JSON**，不要包裹在 markdown 代码块中
2. **不要执行数据库写入操作**
3. **时间精度**：日报关注小时级别变化，时间戳包含时分秒
4. **简洁原则**：每条更新控制在 50 字内
5. **中文输出**：所有内容使用中文
6. **数据不足处理**：`keyUpdates` 为空时，在 `metadata.dataGaps` 中标注

---

## 数据不足时的处理

如果 24h 内数据极少：

```json
{
  "summary": "今日数据采集量较少，暂未检测到重大变化。建议关注以下领域...",
  "content": {
    "keyUpdates": [
      {
        "type": "trend",
        "title": "数据监测中",
        "summary": "今日暂无重大更新，系统持续监测中",
        "significance": "低",
        "source": "系统",
        "timestamp": "..."
      }
    ]
  },
  "metadata": {
    "dataGaps": ["24h 内文档数量 < 5 篇", "建议检查数据源配置"]
  }
}
```
