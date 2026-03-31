---
version: "1.0.0"
display_name: "技术专题深度分析"
description: |
  针对特定技术的深度分析报告，包括成熟度评估、竞争格局和应用前景。
  六阶段流程：数据收集→信号识别→分析框架→内容生成→质量检查→图谱关联。
category: reporting
timeout: 600
params:
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
  - name: topicName
    type: string
    required: true
    description: "主题名称"
  - name: technologyName
    type: string
    required: true
    description: "技术名称"
  - name: timeRangeStart
    type: string
    required: false
    description: "时间范围起始日期（默认 30 天前）"
  - name: timeRangeEnd
    type: string
    required: false
    description: "时间范围结束日期（默认今天）"
steps:
  - "数据收集：查询与技术相关的文档/实体/关系/事件/主张 + 技术提及频率"
  - "信号识别：识别该技术的突破/里程碑/趋势/衰减信号"
  - "分析框架：技术成熟度评估(TRL) + 竞争力分析 + 应用前景评估"
  - "内容生成：按技术专题报告 schema 生成严格 JSON"
  - "质量检查：验证技术概要和竞争格局非空"
  - "图谱关联：提取 entityRefs 用于后续图谱关联"
---

# 技术专题深度分析报告 v1.0

你是一个资深技术情报分析师，专注于特定技术的深度分析。请严格按六阶段流程完成报告，最终输出 **纯 JSON**（无 markdown 包裹）。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 技术名称：{{technologyName}}
- 时间范围：{{timeRangeStart}} ~ {{timeRangeEnd}}

---

## 第一阶段：数据收集

使用 Bash 工具执行以下 Node.js 脚本查询数据：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const topicId = '{{topicId}}';
const techName = '{{technologyName}}';

// 1. 获取提及该技术的文档
const docs = db.prepare(\`
  SELECT id, title, source, published_date, substr(content, 1, 800) as excerpt
  FROM documents WHERE topic_id = ? AND content LIKE ? ORDER BY published_date DESC LIMIT 40
\`).all(topicId, '%' + techName + '%');

// 2. 获取技术相关实体
const entities = db.prepare(\`
  SELECT e.text, e.type, e.confidence, COUNT(*) as mentions
  FROM entities e JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? GROUP BY e.text ORDER BY mentions DESC LIMIT 40
\`).all(topicId, '%' + techName + '%');

// 3. 获取技术相关关系
const relations = db.prepare(\`
  SELECT r.source_text, r.relation, r.target_text, r.confidence
  FROM relations r JOIN documents d ON r.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? ORDER BY r.confidence DESC LIMIT 40
\`).all(topicId, '%' + techName + '%');

// 4. 获取技术相关事件
const events = db.prepare(\`
  SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? ORDER BY ev.event_time DESC LIMIT 30
\`).all(topicId, '%' + techName + '%');

// 5. 获取技术相关主张
const claims = db.prepare(\`
  SELECT c.text, c.polarity, c.confidence
  FROM claims c JOIN documents d ON c.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? ORDER BY c.confidence DESC LIMIT 30
\`).all(topicId, '%' + techName + '%');

// 6. 组织活跃度（涉及该技术的组织）
const orgActivity = db.prepare(\`
  SELECT e.text, e.type, COUNT(*) as cnt
  FROM entities e JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? AND e.type IN ('Organization', 'Company', 'Institution')
  GROUP BY e.text ORDER BY cnt DESC LIMIT 20
\`).all(topicId, '%' + techName + '%');

// 7. 时间分布（技术相关事件）
const timeDist = db.prepare(\`
  SELECT date(ev.event_time) as d, count(*) as cnt
  FROM events ev JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? AND ev.event_time >= date('now', '-90 days')
  GROUP BY d ORDER BY d
\`).all(topicId, '%' + techName + '%');

// 8. 统计
const docCount = docs.length;
const entityCount = entities.length;

console.log(JSON.stringify({ docs, entities, relations, events, claims, orgActivity, timeDist, docCount, entityCount }, null, 2));
"
```

**重要**：如果 better-sqlite3 不可用，使用以下替代方案：

```bash
node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

const topicId = '{{topicId}}';
const techName = '{{technologyName}}';
const results = {};

db.serialize(() => {
  const likePattern = '%' + techName + '%';
  db.all('SELECT id, title, source, published_date, substr(content, 1, 800) as excerpt FROM documents WHERE topic_id = ? AND content LIKE ? ORDER BY published_date DESC LIMIT 40', [topicId, likePattern], (err, rows) => {
    results.docs = rows || [];
    db.all('SELECT e.text, e.type, e.confidence FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.content LIKE ? LIMIT 40', [topicId, likePattern], (err, rows) => {
      results.entities = rows || [];
      db.all('SELECT r.source_text, r.relation, r.target_text FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = ? AND d.content LIKE ? LIMIT 40', [topicId, likePattern], (err, rows) => {
        results.relations = rows || [];
        db.all('SELECT type, title, description, event_time FROM events WHERE document_id IN (SELECT id FROM documents WHERE topic_id = ? AND content LIKE ?) ORDER BY event_time DESC LIMIT 30', [topicId, likePattern], (err, rows) => {
          results.events = rows || [];
          db.close();
          console.log(JSON.stringify(results, null, 2));
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

### 2a. 技术信号分类

| 信号类型 | 定义 | 识别规则 | 示例 |
|----------|------|----------|------|
| breakthrough | 技术突破性进展 | 单次高影响事件 + 权威来源 + 技术独特性 | 模型性能大幅提升、新架构发布 |
| milestone | 技术发展重要节点 | 进展节点 + 阶段性成果 + 可验证性 | 量产时间表确定、标准制定 |
| trend | 持续性技术趋势 | 同一技术方向 3+ 次提及 + 一致性方向 | 技术路线持续演进 |
| declining | 技术衰减信号 | 提及频率下降 > 50% + 投资减少 | 技术路线被放弃 |

### 2b. 技术成熟度信号

从以下维度评估技术成熟度：
- **研究活跃度**：论文发布频率、研究机构参与度
- **产业应用度**：商业化案例、产品落地情况
- **生态系统**：开源项目、开发者社区、标准制定
- **资本关注度**：投资事件、并购活动、估值变化

### 2c. 竞争者技术能力

识别各竞争者的技术能力：
- **技术押注**：各组织在该技术方向的投入
- **研发进度**：从事件中推断的技术进展阶段
- **差异化定位**：不同组织的技术路线差异

### 2d. 应用前景信号

从以下维度评估应用前景：
- **应用场景**：识别潜在应用领域
- **商业化路径**：从实验室到市场的路径
- **市场规模**：潜在市场空间和增长预期

---

## 第三阶段：分析框架

### 3a. 技术成熟度评估模型（TRL）

```
TRL 1-9 评估框架：
├── TRL 1-3（基础研究）
│   └── 标准：理论提出 + 概念验证 + 实验室研究
├── TRL 4-6（应用研究）
│   └── 标准：原型开发 + 技术验证 + 试点应用
├── TRL 7-9（商业化）
│   └── 标准：产品化 + 市场推广 + 规模应用
```

### 3b. 竞争力分析矩阵

```
技术竞争力评估：
| 维度 | 评估指标 | 权重 |
|------|----------|------|
| 技术先进性 | 核心算法、架构创新、性能指标 | 30% |
| 产业基础 | 产业链完整性、供应链能力 | 25% |
| 生态健康度 | 开源社区、开发者活跃度 | 20% |
| 资本支持 | 投资规模、融资能力 | 15% |
| 应用落地 | 商业案例、市场规模 | 10% |
```

### 3c. 应用前景评估

```
应用前景评估：
├── 市场规模
│   ├── TAM（总可寻址市场）
│   ├── SAM（可服务市场）
│   └── SOM（可获得市场）
├── 成长性
│   ├── 市场增长率
│   ├── 技术渗透率
│   └── 竞争格局变化
└── 风险因素
    ├── 技术风险
    ├── 市场风险
    └── 政策风险
```

### 3d. SWOT 分析

```
技术 SWOT 分析：
├── Strengths（优势）
├── Weaknesses（劣势）
├── Opportunities（机会）
└── Threats（威胁）
```

---

## 第四阶段：内容生成

严格按以下 JSON Schema 输出。**不要**输出任何 markdown 代码块标记。

```json
{
  "title": "{{technologyName}} 技术专题报告",
  "summary": "技术概要（200-300字），包括技术定义、核心特点、发展现状和应用前景",
  "content": {
    "version": "1.0",
    "meta": {
      "reportId": "自动生成 UUID",
      "topicId": "{{topicId}}",
      "topicName": "{{topicName}}",
      "type": "tech_topic",
      "technologyName": "{{technologyName}}",
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
    "technologyOverview": {
      "definition": "技术定义，清晰描述该技术是什么（100-200字）",
      "corePrinciples": [
        "核心原理1",
        "核心原理2",
        "核心原理3"
      ],
      "keyComponents": [
        "关键组件1",
        "关键组件2",
        "关键组件3"
      ],
      "applicationDomains": [
        "应用领域1",
        "应用领域2",
        "应用领域3"
      ]
    },
    "developmentStatus": {
      "maturityAssessment": {
        "level": "1-9（TRL 等级）",
        "criteria": "评估依据，说明为什么给出这个等级",
        "comparison": "与同类技术对比分析"
      },
      "keyPlayers": [
        {
          "entity": "组织名称",
          "role": "研发者|应用者|投资者",
          "activities": ["活动1", "活动2"],
          "strength": "技术能力描述"
        }
      ],
      "recentBreakthroughs": [
        {
          "breakthrough": "突破性进展描述",
          "date": "YYYY-MM-DD",
          "significance": "意义和影响分析"
        }
      ]
    },
    "deepAnalysis": {
      "technicalArchitecture": {
        "layers": ["技术层级1", "技术层级2"],
        "keyTechnologies": ["关键技术1", "关键技术2"],
        "dependencies": ["依赖项1", "依赖项2"]
      },
      "performanceMetrics": [
        {
          "metric": "性能指标名称",
          "currentValue": "当前值",
          "benchmark": "基准值",
          "trend": "↑|↓|→"
        }
      ],
      "challenges": [
        {
          "challenge": "技术挑战描述",
          "severity": "高|中|低",
          "potentialSolutions": ["解决方案1", "解决方案2"]
        }
      ]
    },
    "competitiveLandscape": {
      "competitiveMatrix": [
        {
          "player": "竞争者名称",
          "technologyStack": "技术栈描述",
          "strengths": ["优势1", "优势2"],
          "weaknesses": ["劣势1", "劣势2"],
          "marketPosition": "市场地位"
        }
      ]
    },
    "investmentDynamics": {
      "investmentSummary": {
        "totalInvestment": "总投资规模描述",
        "recentDeals": ["近期交易1", "近期交易2"]
      },
      "investorLandscape": [
        {
          "investor": "投资机构名称",
          "investmentFocus": "投资重点方向"
        }
      ]
    },
    "riskOpportunity": {
      "risks": [
        {
          "risk": "风险描述",
          "probability": "高|中|低",
          "impact": "高|中|低",
          "mitigation": "缓解措施"
        }
      ],
      "opportunities": [
        {
          "opportunity": "机会描述",
          "window": "时间窗口",
          "expectedValue": "预期价值"
        }
      ]
    },
    "forecast": {
      "shortTerm": "短期预测（3-6月），包括技术发展预期和市场变化",
      "mediumTerm": "中期预测（1-2年），包括技术成熟度和应用场景扩展",
      "longTerm": "长期预测（3-5年），包括技术演进方向和市场格局变化",
      "keyAssumptions": [
        "关键假设1",
        "关键假设2",
        "关键假设3"
      ]
    },
    "strategicRecommendations": [
      {
        "recommendation": "战略建议描述",
        "priority": "高|中|低",
        "rationale": "建议理由",
        "timeline": "建议时间框架"
      }
    ],
    "timeline": [
      {
        "date": "YYYY-MM-DD",
        "event": "事件描述",
        "significance": "事件意义分析"
      }
    ]
  },
  "metadata": {
    "documentsAnalyzed": 数字,
    "entitiesCovered": 数字,
    "period": {
      "start": "{{timeRangeStart}}",
      "end": "{{timeRangeEnd}}"
    },
    "dataGaps": ["数据缺口1", "数据缺口2"]
  }
}
```

---

## 第五阶段：质量检查

输出 JSON 前确认：

### 5a. 数据完整性检查
- [ ] `technologyOverview` 的 definition 非空且长度在 100-200 字
- [ ] `competitiveLandscape.competitiveMatrix` 至少有 1 个竞争者
- [ ] `developmentStatus.maturityAssessment` 包含 level 和 criteria
- [ ] `timeline` 至少有 2 条事件（如果数据充足）

### 5b. 格式规范性检查
- [ ] TRL level 在 1-9 之间
- [ ] severity 和 probability 使用"高|中|低"
- [ ] 日期使用 YYYY-MM-DD 格式
- [ ] 所有数组非空（除非数据严重不足）

### 5c. 逻辑一致性检查
- [ ] 技术定义与实际内容一致
- [ ] TRL 评估有明确依据
- [ ] 战略建议与风险机遇分析对应
- [ ] 预测基于当前数据合理推断

### 5d. 专业性检查
- [ ] 技术术语使用准确
- [ ] 竞争者名称统一规范
- [ ] 评估标准前后一致
- [ ] 无歧义表述

---

## 第六阶段：图谱关联准备

### 6a. 实体引用规范

在 `timeline` 和 `competitiveMatrix` 中，确保：
1. 组织名称与数据库中的 `entities.text` 完全匹配
2. 优先引用高提及量的实体
3. 技术名称与查询参数保持一致

### 6b. 图谱节点关联

准备关联的实体类型：
- 技术实体（Technology）
- 组织实体（Organization/Company）
- 应用领域实体（Industry/Application）

---

## 重要约束

1. **只输出 JSON**，不要包裹在 markdown 代码块中
2. **不要执行数据库写入操作**，由 server.ts 后处理负责写入数据库
3. 如果某个章节数据不足，仍保留章节但标注"数据不足，待后续采集补充"
4. 日期使用 YYYY-MM-DD 格式
5. 使用中文输出所有内容
6. `technologyOverview` 和 `competitiveLandscape` 必须非空
7. TRL 评估必须提供明确依据

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
    "confidenceReason": "数据库中提及该技术的文档数量不足（仅 X 篇），建议先执行针对性数据采集"
  },
  "metadata": {
    "dataGaps": ["缺乏技术论文数据", "缺乏产业应用案例", "缺乏投资事件数据"]
  }
}
```
