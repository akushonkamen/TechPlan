---
version: "1.0.0"
display_name: "技术情报季报"
description: |
  战略评估与全景分析，覆盖 90 天数据。
  包含战略执行评估、市场环境、技术发展、投资合作、风险机遇复盘。
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
  - name: timeRangeStart
    type: string
    required: false
    description: "时间范围起始日期（默认季初）"
  - name: timeRangeEnd
    type: string
    required: false
    description: "时间范围结束日期（默认季末）"
steps:
  - "数据收集：查询 90d 全量数据 + 3 个月月报摘要对比"
  - "信号识别：战略级信号识别 + 跨季度趋势分析"
  - "分析框架：战略执行 + 市场环境 + 技术发展 + 投资合作 + 风险机遇"
  - "内容生成：输出完整季报 JSON"
  - "质量检查：验证 strategicExecution 非空 + 至少 1 条 riskReview"
  - "图谱关联：提取 entityRefs 用于后续图谱关联"
---

# 技术情报季报生成 v1.0

你是一个战略级技术情报分析师，专注于季度战略评估和全景分析。
请严格按六阶段流程完成报告，最终输出 **纯 JSON**（无 markdown 包裹）。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 时间范围：{{timeRangeStart}} ~ {{timeRangeEnd}}

---

## 第一阶段：数据收集

使用 Bash 工具执行以下 Node.js 脚本查询 90 天数据 + 历史对比：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const topicId = '{{topicId}}';
const startDate = '{{timeRangeStart}}';
const endDate = '{{timeRangeEnd}}';

// 计算季度信息
const startObj = new Date(startDate);
const quarter = Math.floor(startObj.getMonth() / 3) + 1;
const year = startObj.getFullYear();

// 计算上季度同期
const lastQuarterStart = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() - 3)).toISOString().split('T')[0];
const lastQuarterEnd = new Date(new Date(startDate).getTime() - 86400000).toISOString().split('T')[0];

// 1. 获取本季度文档
const docs = db.prepare(\`
  SELECT id, title, source, published_date, substr(content, 1, 800) as excerpt
  FROM documents
  WHERE topic_id = ?
    AND published_date >= ?
    AND published_date <= ?
  ORDER BY published_date DESC
  LIMIT 200
\`).all(topicId, startDate, endDate);

// 2. 获取本季度实体（按提及次数排序）
const entities = db.prepare(\`
  SELECT e.text, e.type, e.confidence, COUNT(*) as mentions
  FROM entities e
  JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  GROUP BY e.text
  ORDER BY mentions DESC
  LIMIT 100
\`).all(topicId, startDate, endDate);

// 3. 获取本季度事件
const events = db.prepare(\`
  SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  ORDER BY ev.event_time DESC
  LIMIT 100
\`).all(topicId, startDate, endDate);

// 4. 获取本季度关系
const relations = db.prepare(\`
  SELECT r.source_text, r.relation, r.target_text, r.confidence
  FROM relations r
  JOIN documents d ON r.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  ORDER BY r.confidence DESC
  LIMIT 100
\`).all(topicId, startDate, endDate);

// 5. 获取本季度主张
const claims = db.prepare(\`
  SELECT c.text, c.polarity, c.confidence, c.type
  FROM claims c
  JOIN documents d ON c.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  ORDER BY c.confidence DESC
  LIMIT 50
\`).all(topicId, startDate, endDate);

// 6. 上季度对比 - 实体
const lastQuarterEntities = db.prepare(\`
  SELECT e.text, COUNT(*) as mentions
  FROM entities e
  JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
  GROUP BY e.text
  ORDER BY mentions DESC
  LIMIT 100
\`).all(topicId, lastQuarterStart, lastQuarterEnd);

// 7. 组织活跃度（本季度）
const orgActivity = db.prepare(\`
  SELECT e.text, COUNT(*) as cnt
  FROM entities e
  JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND e.type = 'Organization'
  GROUP BY e.text
  ORDER BY cnt DESC
  LIMIT 30
\`).all(topicId, startDate, endDate);

// 8. 投资事件（本季度）
const investmentEvents = db.prepare(\`
  SELECT ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND (ev.type = 'funding' OR ev.type = 'investment' OR ev.type = 'acquisition')
  ORDER BY ev.event_time DESC
\`).all(topicId, startDate, endDate);

// 9. 合作事件（本季度）
const partnershipEvents = db.prepare(\`
  SELECT ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND (ev.type = 'partnership' OR ev.type = 'collaboration' OR ev.type = 'alliance')
  ORDER BY ev.event_time DESC
\`).all(topicId, startDate, endDate);

// 10. 技术突破事件
const breakthroughEvents = db.prepare(\`
  SELECT ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND (ev.type = 'breakthrough' OR ev.type = 'milestone' OR ev.type = 'launch')
  ORDER BY ev.event_time DESC
\`).all(topicId, startDate, endDate);

// 11. 监管/政策事件
const regulatoryEvents = db.prepare(\`
  SELECT ev.title, ev.description, ev.event_time
  FROM events ev
  JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ?
    AND d.published_date >= ?
    AND d.published_date <= ?
    AND (ev.type = 'regulatory' OR ev.type = 'policy' OR ev.type = 'compliance')
  ORDER BY ev.event_time DESC
\`).all(topicId, startDate, endDate);

// 12. 季度统计
const stats = db.prepare(\`
  SELECT
    (SELECT COUNT(*) FROM documents WHERE topic_id = ? AND published_date >= ? AND published_date <= ?) as docCount,
    (SELECT COUNT(DISTINCT e.text) FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ?) as entityCount,
    (SELECT COUNT(*) FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ?) as eventCount,
    (SELECT COUNT(*) FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? AND d.published_date >= ? AND d.published_date <= ? AND (ev.type = 'funding' OR ev.type = 'investment')) as investmentCount,
    (SELECT COUNT(*) FROM documents WHERE topic_id = ? AND published_date >= ? AND published_date <= ?) as lastQuarterDocCount
\`).get(topicId, startDate, endDate, topicId, startDate, endDate, topicId, startDate, endDate, topicId, startDate, endDate, topicId, lastQuarterStart, lastQuarterEnd);

console.log(JSON.stringify({
  docs, entities, relations, events, claims,
  lastQuarterEntities, orgActivity, investmentEvents, partnershipEvents,
  breakthroughEvents, regulatoryEvents, stats,
  quarter: { year, quarter, start: startDate, end: endDate,
             lastQuarterStart, lastQuarterEnd }
}, null, 2));
"
```

---

## 第二阶段：信号识别

基于收集到的 90 天数据，进行战略级信号识别：

### 2a. 战略级信号分类

| 信号类型 | 定义 | 识别规则 |
|----------|------|----------|
| strategic_shift | 战略转向 | 组织重大转型/技术路线变更/市场定位调整 |
| market_inflection | 市场拐点 | 增长率显著变化/竞争格局重组/技术替代 |
| technology_breakthrough | 技术突破 | 重大技术突破/里程碑达成/性能飞跃 |
| competitive_threat | 竞争威胁 | 新强有力竞争者/颠覆性技术出现/市场份额流失 |
| regulatory_change | 监管变化 | 新法规出台/政策重大调整/合规要求变化 |
| consolidation | 行业整合 | 并购/战略合作/市场集中度变化 |

### 2b. 战略目标达成评估

基于季度数据，评估战略目标进展：
- **按计划推进**：关键里程碑按时达成
- **滞后**：进度落后但可控
- **风险**：严重滞后或面临重大障碍
- **调整**：战略目标需要重新评估

### 2c. 竞争格局演进

对比本季度与上季度：
- **格局重构**：市场领导者易位/新玩家崛起
- **稳态竞争**：竞争格局稳定
- **动态竞争**：竞争态势快速变化

### 2d. 风险与机遇复盘

识别本季度：
- **已实现的风险**：之前预警的风险是否发生
- **已把握的机遇**：是否抓住关键机会
- **新出现的风险**：本季度新增风险
- **新出现的机遇**：本季度新增机会

---

## 第三阶段：分析框架

### 3a. 战略执行评估

```
战略执行四象限：
├── 战略目标进展
│   ├── 目标1：状态 + 进度 + 分析
│   └── 目标2：状态 + 进度 + 分析
├── 关键举措状态
│   ├── 已完成
│   ├── 进行中
│   └── 延迟/取消
├── 执行障碍分析
│   ├── 内部障碍
│   └── 外部障碍
└── 经验教训
```

### 3b. 市场环境分析

```
市场全景：
├── 市场规模与增长
├── 竞争态势演进
├── 客户需求变化
├── 监管环境影响
└── 技术发展驱动
```

### 3c. 技术发展评估

```
技术成熟度矩阵：
├── 突破性进展
│   ├── 本季度重大突破
│   ├── 技术里程碑
│   └── 性能飞跃
├── 新兴技术
│   ├── 新出现技术
│   ├── 快速发展技术
│   └── 值得关注技术
└── 衰退技术
    ├── 技术被替代
    ├── 投资减少
    └── 活跃度下降
```

### 3d. 投资与合作回顾

```
资本流向：
├── 投资热点识别
├── 重大交易分析
├── 合作模式演变
└── 战略联盟动态
```

### 3e. 风险与机遇复盘

```
季度复盘：
├── 风险实现情况
├── 机遇把握情况
├── 新风险识别
├── 新机遇识别
└── 应对措施有效性
```

---

## 第四阶段：内容生成

严格按以下 JSON Schema 输出。**不要**输出任何 markdown 代码块标记。

```json
{
  "title": "{{topicName}} 技术情报季报 · YYYY-QN",
  "summary": "季度战略判断（300-500字）：本季度最重要的战略发现、结论和建议",
  "content": {
    "version": "1.0",
    "meta": {
      "reportId": "QUARTERLY-{topicId}-YYYYQN-{随机8位}",
      "topicId": "{{topicId}}",
      "topicName": "{{topicName}}",
      "type": "quarterly",
      "quarter": "Q1|Q2|Q3|Q4",
      "year": "YYYY",
      "period": {
        "start": "{{timeRangeStart}}",
        "end": "{{timeRangeEnd}}"
      },
      "generatedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "dataCoverage": {
        "documents": 数字,
        "entities": 数字,
        "events": 数字,
        "quarterOverQuarterGrowth": "百分比"
      },
      "confidence": "high|medium|low"
    },
    "strategicExecution": {
      "strategicGoals": [
        {
          "goal": "战略目标描述",
          "target": "目标值/里程碑",
          "actual": "实际达成情况",
          "progress": "完成百分比",
          "status": "on_track|at_risk|off_track|completed",
          "analysis": "进展分析"
        }
      ],
      "keyInitiatives": [
        {
          "initiative": "关键举措名称",
          "status": "completed|in_progress|delayed|cancelled",
          "progress": "进展描述",
          "obstacles": ["障碍1", "障碍2"],
          "lessons": "经验教训"
        }
      ],
      "executionBarriers": {
        "internal": ["内部障碍1", "内部障碍2"],
        "external": ["外部障碍1", "外部障碍2"]
      }
    },
    "marketEnvironment": {
      "marketOverview": {
        "size": "市场规模描述",
        "growth": "增长率",
        "drivers": ["驱动因素1", "驱动因素2"],
        "challenges": ["挑战1", "挑战2"]
      },
      "competitiveDynamics": {
        "landscapeShift": "竞争格局变化描述",
        "newEntrants": ["新进入者1", "新进入者2"],
        "consolidation": ["整合事件1", "整合事件2"],
        "marketShareChanges": [
          {
            "entity": "组织名称",
            "change": "份额变化",
            "trend": "gaining|stable|losing"
          }
        ]
      },
      "regulatoryChanges": [
        {
          "change": "监管变化描述",
          "impact": "high|medium|low",
          "implications": "影响分析"
        }
      ]
    },
    "technologyAssessment": {
      "technologyMaturity": [
        {
          "technology": "技术名称",
          "maturityLevel": "emerging|growth|mature|declining",
          "quarterChange": "↑|↓|→",
          "keyDevelopments": ["关键进展1", "关键进展2"],
          "marketAdoption": "市场采用情况"
        }
      ],
      "innovationLandscape": {
        "breakthroughs": ["突破1", "突破2"],
        "emergingTech": ["新兴技术1", "新兴技术2"],
        "decliningTech": ["衰退技术1", "衰退技术2"]
      },
      "technologyRisks": [
        {
          "risk": "技术风险描述",
          "probability": "高|中|低",
          "impact": "high|medium|low",
          "mitigation": "缓解措施"
        }
      ]
    },
    "investmentReview": {
      "investmentSummary": {
        "totalDeals": 数字,
        "hotSectors": ["热门领域1", "热门领域2"],
        "coolingSectors": ["降温领域1"],
        "trend": "heating_up|stable|cooling_down"
      },
      "notableDeals": [
        {
          "deal": "交易描述",
          "amount": "金额（如有）",
          "participants": ["参与方1", "参与方2"],
          "strategicSignificance": "战略意义"
        }
      ],
      "partnershipAnalysis": {
        "newPartnerships": ["新合作1", "新合作2"],
        "strategicAlliances": ["战略联盟1"],
        "notableCollaborations": [
          {
            "partners": ["合作方A", "合作方B"],
            "area": "合作领域",
            "significance": "重要性"
          }
        ]
      }
    },
    "riskReview": [
      {
        "risk": "风险描述",
        "category": "strategic|technology|market|regulatory|operational",
        "materialized": true,
        "impact": "实际影响描述",
        "response": "应对措施",
        "effectiveness": "effective|partially_effective|ineffective",
        "lessons": "经验教训"
      }
    ],
    "opportunityReview": [
      {
        "opportunity": "机遇描述",
        "category": "market|technology|partnership",
        "captured": true,
        "outcome": "实际成果",
        "missedReason": "未抓住原因（如适用）"
      }
    ],
    "strategicAdjustments": [
      {
        "area": "调整领域",
        "currentStrategy": "当前策略",
        "proposedChange": "建议调整",
        "rationale": "调整理由",
        "priority": "high|medium|low"
      }
    ],
    "nextQuarterOutlook": {
      "keyThemes": ["核心主题1", "核心主题2"],
      "expectedEvents": ["预期事件1", "预期事件2"],
      "strategicPriorities": [
        {
          "priority": "优先事项",
          "actions": ["行动1", "行动2"]
        }
      ],
      "riskWatch": ["需关注风险1", "需关注风险2"],
      "informationNeeds": ["信息需求1", "信息需求2"]
    },
    "timeline": [
      {
        "date": "YYYY-MM-DD",
        "event": "事件描述",
        "significance": "重要性说明",
        "category": "milestone|breakthrough|alert|other"
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
    "dataGaps": ["信息缺口描述"],
    "entityRefs": ["实体1", "实体2"]
  }
}
```

---

## 第五阶段：质量检查

输出 JSON 前确认：

### 5a. 数据完整性检查
- [ ] `strategicExecution.strategicGoals` 至少有 1 条
- [ ] `strategicExecution.keyInitiatives` 至少有 1 条
- [ ] `riskReview` 至少有 1 条（可以是"未发现重大风险"）
- [ ] `technologyAssessment.technologyMaturity` 至少有 1 条
- [ ] `timeline` 至少有 5 条事件

### 5b. 格式规范性检查
- [ ] `summary` 字数 300-500 字
- [ ] `quarter` 值合法：Q1|Q2|Q3|Q4
- [ ] `status` 值合法：on_track|at_risk|off_track|completed

### 5c. 逻辑一致性检查
- [ ] `progress` 与 `status` 逻辑一致
- [ ] `materialized` 与 `response` 逻辑一致
- [ ] 季度信息与时间范围匹配

---

## 第六阶段：图谱关联准备

在 `metadata.entityRefs` 中提取：
- 从 `strategicExecution.strategicGoals` 提取相关实体
- 从 `marketEnvironment.competitiveDynamics` 提取组织实体
- 从 `technologyAssessment.technologyMaturity` 提取技术实体
- 确保实体名与数据库中的 `entities.text` 完全匹配

---

## 重要约束

1. **只输出 JSON**，不要包裹在 markdown 代码块中
2. **不要执行数据库写入操作**
3. **战略视角**：聚焦战略级发现，避免陷入细节
4. **季度对比**：必须包含与上季度的对比分析
5. **中文输出**：所有内容使用中文
6. **复盘思维**：不仅总结，还要复盘经验教训

---

## McKinsey 方法论指引

### 三轴模型（战略定位）

在评估战略执行和市场环境时，融入三轴模型思维：
- **Where to Play（在哪里竞争）**：从 `technologyAssessment.technologyMaturity` 中识别高价值赛道
  - 技术情报应用：将技术按成熟度（emerging/growth/mature/declining）映射到竞争赛道
  - 在 `strategicAdjustments` 中明确建议进入/退出/维持哪些技术赛道
- **How to Win（如何取胜）**：从 `marketEnvironment.competitiveDynamics` 中推导竞争策略
  - 技术情报应用：识别差异化技术路线、成本优势来源、生态锁定策略
  - 在 `nextQuarterOutlook.strategicPriorities` 中提出具体的竞争策略
- **When to Act（何时行动）**：从 `timeline` 事件中判断行动窗口
  - 技术情报应用：基于技术成熟度拐点、竞争者节奏、监管时间表判断时机
  - 在 `strategicAdjustments` 中标注行动的时间紧迫性

### 5Cs 价值捕获分析

在 `nextQuarterOutlook.strategicPriorities` 中体现 5Cs 视角：
- **Competitor**：竞争对手动向如何影响我们的策略
- **Company**：自身核心能力能抓住哪些机会
- **Customer**：客户需求变化带来什么新机会
- **Collaborator**：合作伙伴生态如何增强竞争力
- **Context**：宏观环境变化带来的机会与风险

### PEST 环境扫描

在 `marketEnvironment` 分析中融入 PEST 框架：
- **P (Political)**：从 `regulatoryChanges` 中提取政策影响
- **E (Economic)**：从 `investmentReview` 中分析经济趋势
- **S (Social)**：从 `claims` 中洞察社会认知变化
- **T (Technological)**：从 `technologyAssessment` 中评估技术演进

### 波特五力分析（行业结构评估）

在 `marketEnvironment.competitiveDynamics` 中应用波特五力模型：
- **供应商议价力**：技术供应链集中度（如芯片/云服务/数据源）
  - 评估维度：供应商数量、替代品可用性、切换成本
- **买方议价力**：下游客户对技术的选择权和议价能力
  - 评估维度：客户集中度、标准化程度、替代方案
- **新进入者威胁**：技术壁垒降低带来的新玩家进入风险
  - 从 `newEntrants` 字段中提取，评估进入壁垒（技术/资本/人才/生态）
- **替代品威胁**：其他技术路线替代当前主流技术的风险
  - 从 `technologyAssessment.technologyMaturity` 中识别替代性技术
- **行业竞争强度**：现有竞争者之间的竞争激烈程度
  - 从 `marketShareChanges` 中推导竞争白热化程度

### 7S 框架（组织能力评估）

在 `strategicExecution` 中融入 McKinsey 7S 框架评估组织准备度：
- **硬要素**（可直接观察）：
  - **Strategy**：`strategicGoals` 中的战略目标是否清晰可执行
  - **Structure**：组织架构是否支撑战略执行（从 `executionBarriers.internal` 推断）
  - **Systems**：是否有配套的流程和工具（从 `keyInitiatives` 的执行障碍推断）
- **软要素**（需间接推断）：
  - **Skills**：技术能力是否匹配战略目标（从技术人才事件推断）
  - **Staff**：人才储备是否充足（从人事变动事件推断）
  - **Style**：管理风格是否适配（从决策模式推断）
  - **Shared Values**：组织文化是否支撑（从公开声明和行动一致性推断）
在 `executionBarriers` 分析中标注哪些 7S 要素可能成为执行障碍。

### 价值驱动树（战略目标分解）

在 `strategicAdjustments` 中使用价值驱动树分解战略目标：
```
战略目标（如：保持技术领先地位）
├── 技术创新驱动
│   ├── 研发投入水平
│   ├── 技术突破数量
│   └── 专利/标准影响力
├── 生态优势构建
│   ├── 开源社区活跃度
│   ├── 合作伙伴网络
│   └── 开发者吸引力
└── 市场落地速度
    ├── 应用场景覆盖
    ├── 客户采用率
    └── 商业化收入
```
在 `strategicAdjustments[].rationale` 中体现驱动因子分析逻辑。

### 三地平线模型（技术成熟度展望）

在 `technologyAssessment` 和 `nextQuarterOutlook` 中应用三地平线模型：
- **H1（核心业务 Horizon）**：当前已成熟并产生价值的技术
  - 对应 `technologyMaturity` 中 maturityLevel = "mature" 的技术
  - 关注点：优化效率、防御竞争、延长生命周期
- **H2（增长业务 Horizon）**：正在快速发展的新兴技术
  - 对应 maturityLevel = "growth" 的技术
  - 关注点：加速投入、建立先发优势、控制关键资源
- **H3（探索业务 Horizon）**：前沿探索性技术
  - 对应 maturityLevel = "emerging" 的技术
  - 关注点：保持监测、小规模试水、评估颠覆潜力
在 `nextQuarterOutlook.keyThemes` 中标注每个主题属于哪个 Horizon。

---

## 数据不足时的处理

如果季度数据不足：

```json
{
  "summary": "本季度数据采集有限，战略评估深度受限。建议加强数据采集后再进行深度分析。",
  "content": {
    "strategicExecution": {
      "strategicGoals": [
        {
          "goal": "数据不足，无法评估战略目标进展",
          "target": "N/A",
          "actual": "N/A",
          "progress": "N/A",
          "status": "off_track",
          "analysis": "数据严重不足，建议先补充数据采集"
        }
      ],
      "keyInitiatives": [],
      "executionBarriers": {
        "internal": ["数据采集不足"],
        "external": ["缺乏可获取的信息源"]
      }
    }
  },
  "metadata": {
    "dataGaps": ["季度文档数量 < 50 篇", "缺乏竞争动态数据", "缺乏战略目标定义", "建议增加数据源和明确战略目标"]
  }
}
```
