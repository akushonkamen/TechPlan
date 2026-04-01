---
version: "1.0.0"
display_name: "友商分析报告"
description: |
  竞争者深度画像，包括 SWOT 分析、技术能力评估和威胁评估。
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
  - name: reportType
    type: string
    required: false
    default: "competitor"
    description: "报告类型"
  - name: competitorName
    type: string
    required: true
    description: "友商名称"
  - name: timeRangeStart
    type: string
    required: false
    description: "时间范围起始日期（默认 90 天前）"
  - name: timeRangeEnd
    type: string
    required: false
    description: "时间范围结束日期（默认今天）"
steps:
  - "数据收集：查询提及友商的文档/实体/关系/事件/主张"
  - "信号识别：识别战略动作/产品发布/融资/招聘等信号"
  - "分析框架：战略意图推断→能力评估→威胁评估"
  - "内容生成：按友商分析报告 schema 生成严格 JSON"
  - "质量检查：验证 SWOT 四象限非空"
  - "图谱关联：提取 entityRefs 用于后续图谱关联"
---

# 友商深度分析报告 v1.0

你是一个资深竞争情报分析师，专注于竞争对手深度分析。请严格按六阶段流程完成报告，最终输出 **纯 JSON**（无 markdown 包裹）。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 友商名称：{{competitorName}}
- 时间范围：{{timeRangeStart}} ~ {{timeRangeEnd}}

---

## 第一阶段：数据收集

使用 Bash 工具执行以下 Node.js 脚本查询数据：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const topicId = '{{topicId}}';
const compName = '{{competitorName}}';

// 1. 获取提及该友商的文档
const docs = db.prepare(\`
  SELECT id, title, source, published_date, substr(content, 1, 800) as excerpt
  FROM documents WHERE topic_id = ? AND content LIKE ? ORDER BY published_date DESC LIMIT 50
\`).all(topicId, '%' + compName + '%');

// 2. 获取友商相关实体（包括关联实体）
const entities = db.prepare(\`
  SELECT e.text, e.type, e.confidence, COUNT(*) as mentions
  FROM entities e JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? GROUP BY e.text ORDER BY mentions DESC LIMIT 50
\`).all(topicId, '%' + compName + '%');

// 3. 获取友商相关关系
const relations = db.prepare(\`
  SELECT r.source_text, r.relation, r.target_text, r.confidence
  FROM relations r JOIN documents d ON r.document_id = d.id
  WHERE d.topic_id = ? AND (r.source_text LIKE ? OR r.target_text LIKE ?) ORDER BY r.confidence DESC LIMIT 50
\`).all(topicId, '%' + compName + '%', '%' + compName + '%');

// 4. 获取友商相关事件
const events = db.prepare(\`
  SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants
  FROM events ev JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? ORDER BY ev.event_time DESC LIMIT 40
\`).all(topicId, '%' + compName + '%');

// 5. 获取友商相关主张
const claims = db.prepare(\`
  SELECT c.text, c.polarity, c.confidence
  FROM claims c JOIN documents d ON c.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? ORDER BY c.confidence DESC LIMIT 40
\`).all(topicId, '%' + compName + '%');

// 6. 友商关联组织（合作伙伴、竞争对手、投资方等）
const relatedOrgs = db.prepare(\`
  SELECT e.text, e.type, COUNT(*) as cnt
  FROM entities e JOIN documents d ON e.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? AND e.type IN ('Organization', 'Company', 'Institution', 'Person')
  GROUP BY e.text ORDER BY cnt DESC LIMIT 30
\`).all(topicId, '%' + compName + '%');

// 7. 时间分布（友商相关事件）
const timeDist = db.prepare(\`
  SELECT date(ev.event_time) as d, count(*) as cnt
  FROM events ev JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? AND ev.event_time >= date('now', '-180 days')
  GROUP BY d ORDER BY d
\`).all(topicId, '%' + compName + '%');

// 8. 事件类型分布
const eventTypeDist = db.prepare(\`
  SELECT ev.type, count(*) as cnt
  FROM events ev JOIN documents d ON ev.document_id = d.id
  WHERE d.topic_id = ? AND d.content LIKE ? GROUP BY ev.type ORDER BY cnt DESC
\`).all(topicId, '%' + compName + '%');

// 9. 统计
const docCount = docs.length;
const entityCount = entities.length;

console.log(JSON.stringify({ docs, entities, relations, events, claims, relatedOrgs, timeDist, eventTypeDist, docCount, entityCount }, null, 2));
"
```

**重要**：如果 better-sqlite3 不可用，使用以下替代方案：

```bash
node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

const topicId = '{{topicId}}';
const compName = '{{competitorName}}';
const results = {};

db.serialize(() => {
  const likePattern = '%' + compName + '%';
  db.all('SELECT id, title, source, published_date, substr(content, 1, 800) as excerpt FROM documents WHERE topic_id = ? AND content LIKE ? ORDER BY published_date DESC LIMIT 50', [topicId, likePattern], (err, rows) => {
    results.docs = rows || [];
    db.all('SELECT e.text, e.type, e.confidence FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ? AND d.content LIKE ? LIMIT 50', [topicId, likePattern], (err, rows) => {
      results.entities = rows || [];
      db.all('SELECT type, title, description, event_time FROM events WHERE document_id IN (SELECT id FROM documents WHERE topic_id = ? AND content LIKE ?) ORDER BY event_time DESC LIMIT 40', [topicId, likePattern], (err, rows) => {
        results.events = rows || [];
        db.close();
        console.log(JSON.stringify(results, null, 2));
      });
    });
  });
});
"
```

---

## 第二阶段：信号识别

基于收集到的数据，进行以下分析：

### 2a. 战略信号分类

| 信号类型 | 定义 | 识别规则 | 示例 |
|----------|------|----------|------|
| strategic_moves | 战略动作 | 高层决策 + 长期影响 | 业务重组、战略转型 |
| product_launches | 产品发布 | 新产品/功能 + 市场推出 | 新产品发布、功能更新 |
| funding | 融资活动 | 资本注入 + 估值变化 | 融资轮次、投资并购 |
| hiring | 人事变动 | 关键人才 + 组织变化 | 高管任命、团队扩张 |
| partnerships | 合作关系 | 战略合作 + 资源整合 | 技术合作、渠道合作 |
| acquisitions | 并购活动 | 收购 + 整合 | 收购公司、业务并购 |

### 2b. 能力评估信号

从以下维度评估友商能力：
- **技术能力**：技术栈、研发投入、专利布局
- **产品能力**：产品线、产品竞争力、创新能力
- **市场能力**：市场份额、渠道覆盖、品牌影响力
- **资本能力**：融资能力、财务状况、投资能力
- **组织能力**：团队规模、人才结构、管理能力

### 2c. 威胁评估信号

从以下维度评估威胁程度：
- **直接威胁**：产品竞争、市场争夺、客户抢夺
- **间接威胁**：生态竞争、标准竞争、人才竞争
- **潜在威胁**：技术储备、布局预谋、战略意图

### 2d. 战略意图推断

从以下方面推断战略意图：
- **战略重点**：资源投入方向
- **战略节奏**：发展快慢、时机选择
- **战略风格**：激进/保守、开放/封闭
- **战略目标**：短期目标、长期愿景

---

## 第三阶段：分析框架

### 3a. SWOT 分析框架

```
SWOT 分析矩阵：
├── Strengths（内部优势）
│   ├── 技术优势
│   ├── 产品优势
│   ├── 市场优势
│   └── 资源优势
├── Weaknesses（内部劣势）
│   ├── 技术短板
│   ├── 产品缺陷
│   ├── 市场弱点
│   └── 资源限制
├── Opportunities（外部机会）
│   ├── 市场机会
│   ├── 技术机会
│   ├── 政策机会
│   └── 合作机会
└── Threats（外部威胁）
    ├── 竞争威胁
    ├── 技术威胁
    ├── 政策威胁
    └── 市场威胁
```

### 3b. 竞争态势评估

```
威胁等级评估：
| 维度 | 低威胁 | 中威胁 | 高威胁 |
|------|--------|--------|--------|
| 市场重叠度 | < 20% | 20-50% | > 50% |
| 产品替代性 | 弱 | 中 | 强 |
| 资源投入度 | 低 | 中 | 高 |
| 执行能力 | 弱 | 中 | 强 |
```

### 3c. 战略响应框架

```
战略响应矩阵：
├── 监控型响应
│   └── 适用：低威胁 + 远期竞争
├── 防御型响应
│   └── 适用：中威胁 + 当前竞争
├── 进攻型响应
│   └── 适用：高威胁 + 直接竞争
└── 联盟型响应
    └── 适用：高威胁 + 非直接竞争
```

### 3d. 能力对比分析

```
能力雷达图：
├── 技术能力（0-100）
├── 产品能力（0-100）
├── 市场能力（0-100）
├── 资本能力（0-100）
└── 组织能力（0-100）
```

---

## 第四阶段：内容生成

严格按以下 JSON Schema 输出。**不要**输出任何 markdown 代码块标记。

```json
{
  "title": "{{competitorName}} 友商分析报告",
  "summary": "竞争态势概述（200-300字），包括友商基本情况、主要威胁和应对建议",
  "content": {
    "version": "1.0",
    "meta": {
      "reportId": "自动生成 UUID",
      "topicId": "{{topicId}}",
      "topicName": "{{topicName}}",
      "type": "competitor",
      "competitorName": "{{competitorName}}",
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
    "companyProfile": {
      "basicInfo": {
        "name": "{{competitorName}}",
        "headquarters": "总部地点",
        "publicPrivate": "上市|非上市",
        "founded": "成立年份（如有）",
        "website": "官网（如有）"
      },
      "financialOverview": {
        "revenue": "营收情况描述",
        "funding": "融资情况描述",
        "valuation": "估值情况描述"
      },
      "leadership": [
        {
          "name": "高管姓名",
          "title": "职位",
          "keyDecisions": ["关键决策1", "关键决策2"]
        }
      ]
    },
    "strategyAnalysis": {
      "vision": "愿景描述",
      "strategicFocus": [
        {
          "focus": "战略重点领域",
          "priority": "高|中|低",
          "progress": "进展情况"
        }
      ],
      "businessModel": {
        "type": "商业模式类型",
        "revenueStreams": ["收入来源1", "收入来源2"],
        "valueProposition": "价值主张"
      },
      "competitiveStrategy": {
        "type": "竞争策略类型（如成本领先、差异化等）",
        "differentiation": "差异化策略描述",
        "competitiveAdvantages": ["竞争优势1", "竞争优势2"]
      }
    },
    "techCapabilities": {
      "technologyStack": [
        {
          "area": "技术领域",
          "capabilities": "技术能力描述",
          "maturity": "高|中|低"
        }
      ],
      "technologyRoadmap": [
        {
          "technology": "技术名称",
          "status": "研发|测试|量产",
          "timeline": "时间规划"
        }
      ]
    },
    "productServices": {
      "productPortfolio": [
        {
          "product": "产品名称",
          "category": "产品类别",
          "marketPosition": "市场地位"
        }
      ],
      "recentLaunches": [
        {
          "product": "产品名称",
          "date": "YYYY-MM-DD",
          "significance": "发布意义"
        }
      ]
    },
    "marketPerformance": {
      "marketShare": {
        "overall": "整体市场份额",
        "bySegment": ["细分市场1", "细分市场2"]
      },
      "growthMetrics": {
        "revenueGrowth": "营收增长",
        "userGrowth": "用户增长"
      }
    },
    "partnershipInvestment": {
      "partnerships": [
        {
          "partner": "合作伙伴名称",
          "type": "合作类型",
          "significance": "合作意义"
        }
      ],
      "investments": [
        {
          "company": "被投公司名称",
          "amount": "投资金额",
          "strategicRationale": "战略意图"
        }
      ]
    },
    "swotAnalysis": {
      "strengths": [
        {
          "strength": "优势描述",
          "evidence": "支撑证据"
        }
      ],
      "weaknesses": [
        {
          "weakness": "劣势描述",
          "evidence": "支撑证据"
        }
      ],
      "opportunities": [
        {
          "opportunity": "机会描述",
          "probability": "高|中|低"
        }
      ],
      "threats": [
        {
          "threat": "威胁描述",
          "probability": "高|中|低"
        }
      ]
    },
    "competitiveAssessment": {
      "threatLevel": "高|中|低",
      "threatAreas": ["威胁领域1", "威胁领域2"],
      "recommendedResponse": [
        {
          "action": "建议行动",
          "priority": "高|中|低",
          "timeline": "时间框架"
        }
      ]
    },
    "forecast": {
      "shortTerm": "短期预测（3-6月）",
      "mediumTerm": "中期预测（1-2年）",
      "keyAssumptions": ["关键假设1", "关键假设2"]
    },
    "timeline": [
      {
        "date": "YYYY-MM-DD",
        "event": "事件描述",
        "significance": "事件意义"
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
- [ ] `swotAnalysis` 的四个象限（strengths/weaknesses/opportunities/threats）均非空
- [ ] `companyProfile.basicInfo` 的 name 字段与 competitorName 一致
- [ ] `competitiveAssessment.threatLevel` 有明确值
- [ ] `timeline` 至少有 2 条事件（如果数据充足）

### 5b. 格式规范性检查
- [ ] priority 使用"高|中|低"
- [ ] probability 使用"高|中|低"
- [ ] 日期使用 YYYY-MM-DD 格式
- [ ] maturity 使用"高|中|低"或"研发|测试|量产"

### 5c. 逻辑一致性检查
- [ ] 战略分析与实际事件一致
- [ ] SWOT 分析有充分证据支撑
- [ ] 威胁评估与竞争态势匹配
- [ ] 建议响应与威胁等级对应

### 5d. 专业性检查
- [ ] 友商名称统一规范
- [ ] 评估标准前后一致
- [ ] 无主观偏见
- [ ] 无歧义表述

---

## 第六阶段：图谱关联准备

### 6a. 实体引用规范

在 `timeline` 和各章节中，确保：
1. 友商名称与查询参数保持一致
2. 关联组织名称与数据库中的 `entities.text` 匹配
3. 优先引用高提及量的实体

### 6b. 关系网络构建

准备构建的关系：
- 友商 → 合作伙伴（partnership）
- 友商 → 竞争对手（competition）
- 友商 → 投资方（invested_by）
- 友商 → 被投公司（invested_in）

---

## 重要约束

1. **只输出 JSON**，不要包裹在 markdown 代码块中
2. **不要执行数据库写入操作**，由 server.ts 后处理负责写入数据库
3. 如果某个章节数据不足，仍保留章节但标注"数据不足，待后续采集补充"
4. 日期使用 YYYY-MM-DD 格式
5. 使用中文输出所有内容
6. `swotAnalysis` 四个象限必须非空
7. 威胁评估必须基于客观数据，避免主观臆断

---

## McKinsey 方法论指引

### 波特五力分析（竞争格局结构）

在 `competitiveAssessment` 和 `swotAnalysis` 中应用波特五力模型，分析竞争者所处的行业结构：
- **供应商议价力**：竞争者的上游依赖
  - 从 `techCapabilities.technologyStack` 推断其对特定供应商/技术的依赖度
  - 依赖度高 → 供应商议价力强 → 竞争者利润空间受限
- **买方议价力**：竞争者客户的选择权
  - 从 `marketPerformance.marketShare.bySegment` 推断客户集中度
  - 客户集中 → 议价力强 → 竞争者定价能力弱
- **新进入者威胁**：竞争者所在市场的壁垒
  - 从 `companyProfile.financialOverview` 和 `techCapabilities` 推断壁垒高度
  - 壁垒低 → 新进入者多 → 竞争者护城河浅
- **替代品威胁**：其他技术/模式替代竞争者的风险
  - 从 `strategyAnalysis.businessModel.valueProposition` 评估可替代性
- **行业竞争强度**：竞争者与同行的竞争激烈程度
  - 从 `partnershipInvestment` 和 `marketPerformance.growthMetrics` 推断
在 `threatAreas` 中标注五力中哪几力对竞争者最不利。

### 5Cs 价值捕获分析

在 `strategyAnalysis` 中分析竞争者的价值捕获模式：
- **Competitor（竞争维度）**：竞争者如何与同行竞争
  - 从 `competitiveStrategy.type` 和 `differentiation` 提取
  - 判断：成本领先 vs 差异化 vs 聚焦
- **Company（自身能力）**：竞争者有哪些不可复制的核心能力
  - 从 `techCapabilities.technologyRoadmap` 和 `swotAnalysis.strengths` 提取
  - 评估：技术/数据/网络效应/品牌哪个是核心壁垒
- **Customer（客户价值）**：竞争者如何为客户创造独特价值
  - 从 `productServices.productPortfolio` 的 `marketPosition` 和 `businessModel.valueProposition` 提取
- **Collaborator（合作生态）**：竞争者的合作伙伴网络如何增强竞争力
  - 从 `partnershipInvestment.partnerships` 提取
  - 评估：合作网络是增强还是限制了竞争者的灵活性
- **Context（环境适应）**：竞争者如何适应外部环境变化
  - 从 `forecast.keyAssumptions` 和事件 timeline 推断适应能力

### 战略意图分析（长期目标推断）

在 `strategyAnalysis` 中从竞争者的行动推断其长期战略意图：
1. **资源分配信号**：资金/人才流向哪里 → 战略重点在哪里
   - 从 `partnershipInvestment.investments` 的 `strategicRationale` 推断
   - 从 `companyProfile.leadership` 的 `keyDecisions` 推断
2. **行动模式识别**：竞争者是进攻型还是防御型
   - 进攻型信号：频繁发布新产品、激进扩张、大量招聘
   - 防御型信号：收购竞争对手、加固专利墙、锁定客户
3. **时间节奏推断**：竞争者的行动是响应式还是主动式
   - 主动式：有预判性的技术布局（提前 2-3 年开始研发）
   - 响应式：跟随市场趋势的快速跟进
4. **战略目标推断**：综合以上信号推断 3-5 年战略目标
   - 在 `strategyAnalysis.vision` 和 `forecast.mediumTerm` 中体现推断结论
   - 标注置信度：多源佐证 → 高；单一信号 → 中；推测 → 低

### VRIO 竞争优势可持续性评估

在 `swotAnalysis.strengths` 和 `competitiveAssessment` 中应用 VRIO 评估：
- **V (Value)**：竞争者的优势是否真正为客户创造价值？
  - 从 `productServices` 和 `claims` 中交叉验证
- **R (Rarity)**：这些优势在行业中是否稀缺？
  - 从 `competitiveLandscape` 的竞争者对比中判断
- **I (Inimitability)**：这些优势是否难以模仿？
  - 技术壁垒：专利数量、研发深度、算法复杂度
  - 网络效应：用户规模、生态锁定、数据飞轮
  - 品牌壁垒：市场认知、客户忠诚度
- **O (Organization)**：竞争者的组织能力是否能持续支撑这些优势？
  - 从 `companyProfile.leadership` 和人才事件推断组织稳定性
- **综合评估**：
  - V+R+I+O → 竞争者具有持久优势，威胁长期存在
  - V+R 但非 I → 优势可被追赶，存在时间窗口
  - 非R → 优势可复制，竞争威胁可控
在 `recommendedResponse` 中根据 VRIO 结果调整响应策略的紧迫程度。

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
    "confidenceReason": "数据库中提及该友商的文档数量不足（仅 X 篇），建议先执行针对性数据采集"
  },
  "metadata": {
    "dataGaps": ["缺乏公司基本信息", "缺乏财务数据", "缺乏产品信息"]
  }
}
```
