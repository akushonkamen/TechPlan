 # 周报生成链路设计方案

> 版本：v1.0
> 创建日期：2026-03-30
> 状态：设计中

---

## 一、需求分析与规划

### 1.1 核心目标受众

| 受众角色 | 关注重点 | 信息需求 |
|----------|----------|----------|
| 技术决策者 | 战略方向、投资决策 | 执行摘要、竞争态势、投资建议 |
| 研发负责人 | 技术细节、实现路径 | 技术雷达、里程碑事件、技术突破 |
| 产品经理 | 市场动态、竞品分析 | 竞争者动态、产品发布、市场趋势 |
| 投资分析 | 资本流向、风险评估 | 投资事件、风险信号、机会识别 |

### 1.2 关键信息维度

```
周报信息架构
├── 战略层（决策者视角）
│   ├── 核心判断与置信度
│   ├── 关键信号标记
│   └── 行动建议
├── 分析层（专业视角）
│   ├── 技术雷达扫描
│   ├── 竞争态势分析
│   ├── 投资与合作动态
│   └── 风险与机遇识别
├── 证据层（数据支撑）
│   ├── 时间线事件
│   ├── 实体关系图谱
│   ├── 文献引用溯源
│   └── 数据统计指标
└── 附录层（深度信息）
    ├── 详细数据表
    ├── 图谱可视化
    └── 原始文档链接
```

### 1.3 数据来源与更新频率

| 数据源 | 采集频率 | 数据类型 | 可信度评级 |
|--------|----------|----------|------------|
| arXiv | 每日 | 学术论文 | 一级来源 |
| 新闻媒体 | 每日 | 行业新闻 | 二级来源 |
| 企业公告 | 实时 | 官方发布 | 一级来源 |
| 专利数据库 | 每周 | 专利申请 | 一级来源 |
| 社交媒体 | 每日 | 舆论动态 | 三级来源 |

### 1.4 标准化周报框架模板

```yaml
周报模板 v2.0:
  元信息:
    - 报告ID
    - 主题ID/名称
    - 报告周期
    - 生成时间
    - 数据覆盖范围
    - 置信度评级
  
  执行摘要:
    - 核心判断（1-2段）
    - 关键结论（3-5条）
    - 置信度说明
    - 建议行动
  
  技术雷达:
    - 突破性进展
    - 里程碑事件
    - 衰减信号
    - 技术成熟度评估
  
  竞争态势:
    - 组织动态矩阵
    - 策略意图推断
    - 竞争格局变化
  
  投资与合作:
    - 资本流向分析
    - 重点交易事件
    - 投资热点识别
  
  风险与机遇:
    - 威胁信号
    - 机会信号
    - 影响评估
  
  下周展望:
    - 关注重点
    - 预期事件
    - 信息缺口
  
  附录:
    - 时间线
    - 数据统计
    - 图谱快照
    - 来源索引
```

---

## 二、数据采集与整合

### 2.1 自动化采集机制

```
采集流程
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  数据源配置  │───▶│  采集调度器  │───▶│  数据获取器  │
└─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  数据存储    │◀───│  数据清洗    │◀───│  格式解析    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 2.2 数据质量保障

| 质量维度 | 检查规则 | 处理策略 |
|----------|----------|----------|
| 完整性 | 必填字段检查 | 标记缺失，降级使用 |
| 准确性 | 来源可信度验证 | 低可信度标记 |
| 时效性 | 发布时间检查 | 过期数据降权 |
| 唯一性 | 去重检测 | 合并重复记录 |

### 2.3 数据整合视图

```sql
-- 周报数据聚合视图
CREATE VIEW weekly_report_data AS
SELECT 
  d.id as document_id,
  d.title,
  d.source,
  d.published_date,
  d.content,
  t.id as topic_id,
  t.name as topic_name,
  t.priority as topic_priority,
  GROUP_CONCAT(DISTINCT e.text) as entities,
  GROUP_CONCAT(DISTINCT ev.title) as events,
  GROUP_CONCAT(DISTINCT c.text) as claims
FROM documents d
LEFT JOIN topics t ON d.topic_id = t.id
LEFT JOIN entities e ON e.document_id = d.id
LEFT JOIN events ev ON ev.document_id = d.id
LEFT JOIN claims c ON c.document_id = d.id
WHERE d.collected_date >= date('now', '-7 days')
GROUP BY d.id;
```

---

## 三、图谱构建与应用

### 3.1 图谱与周报关联机制

```
图谱-周报关联模型
┌────────────────────────────────────────────────────────┐
│                    周报内容结构                          │
├────────────────────────────────────────────────────────┤
│  执行摘要 ──────────────┬──▶ 核心实体节点              │
│                        │                               │
│  技术雷达 ──────────────┼──▶ 技术节点 + 关系           │
│                        │                               │
│  竞争态势 ──────────────┼──▶ 组织节点 + 竞争关系       │
│                        │                               │
│  投资合作 ──────────────┼──▶ 资本流向关系              │
│                        │                               │
│  风险机遇 ──────────────┼──▶ 信号节点 + 影响关系       │
│                        │                               │
│  时间线 ────────────────┴──▶ 事件节点 + 时序关系       │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│                    知识图谱支撑                          │
├────────────────────────────────────────────────────────┤
│  1. 实体溯源：点击实体名 → 展示图谱中的完整关系网络      │
│  2. 关系验证：点击论断 → 展示支撑证据链                  │
│  3. 趋势可视化：时间轴 → 图谱演变动画                    │
│  4. 影响分析：点击信号 → 影响范围可视化                  │
└────────────────────────────────────────────────────────┘
```

### 3.2 图谱动态展示规则

| 周报元素 | 图谱展示方式 | 交互行为 |
|----------|--------------|----------|
| 实体提及 | 高亮节点 + 邻域 | 点击展开完整关系 |
| 关系论断 | 高亮边 + 路径 | 点击显示证据链 |
| 时间线事件 | 时序动画 | 播放演变过程 |
| 信号标记 | 节点着色 | 点击显示影响范围 |
| 数据统计 | 图谱统计面板 | 实时更新 |

### 3.3 图谱查询接口

```typescript
interface ReportGraphQuery {
  topicId: string;
  reportId: string;
  sectionId: string;
  entityRefs: string[];
  timeRange: { start: string; end: string };
  signalTypes: SignalType[];
}

interface ReportGraphResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  highlights: {
    nodeId: string;
    reason: string;
    sectionRef: string;
  }[];
  paths: {
    from: string;
    to: string;
    path: string[];
    evidence: string[];
  }[];
}
```

---

## 四、内容生成与结构化

### 4.1 分层次生成流程

```
内容生成流水线
┌─────────────────────────────────────────────────────────┐
│ 第一层：数据预处理                                       │
│   ├── 数据聚合（文档/实体/事件/主张）                    │
│   ├── 数据清洗（去重/校验/补全）                         │
│   └── 数据标注（可信度/重要性/时效性）                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第二层：信号识别                                         │
│   ├── 突破性信号检测（单次高影响事件）                   │
│   ├── 趋势性信号检测（多次提及模式）                     │
│   ├── 衰减信号检测（频率下降模式）                       │
│   └── 异常信号检测（偏离预期模式）                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第三层：分析框架                                         │
│   ├── 竞争者画像（组织策略推断）                         │
│   ├── 资本方向（投资流向分析）                           │
│   ├── 技术评估（成熟度/影响力）                          │
│   └── 风险评估（威胁/机会识别）                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第四层：内容生成                                         │
│   ├── 执行摘要（核心判断 + 关键结论）                    │
│   ├── 分析章节（6 大模块）                               │
│   ├── 时间线（事件 + 意义）                              │
│   └── 附录（数据 + 图谱）                                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第五层：质量检查                                         │
│   ├── 完整性检查（章节/字段）                            │
│   ├── 一致性检查（数据/论断）                            │
│   ├── 可读性检查（语言/格式）                            │
│   └── 专业性检查（术语/规范）                            │
└─────────────────────────────────────────────────────────┘
```

### 4.2 内容模块规范

#### 执行摘要模块

```yaml
结构要求:
  overview:
    长度: 200-400字
    内容: 本周最关键的发现和趋势
    要求: 凝练、有判断、有依据
  
  keyPoints:
    数量: 3-5条
    格式: "【判断】+ 【依据】+ 【影响】"
    示例: "Apple 端侧大模型布局加速，M4 芯片 NPU 算力提升 40%，将推动端侧 AI 应用爆发"
  
  confidence:
    取值: high/medium/low
    依据: 数据覆盖度 + 来源可信度 + 交叉验证结果
  
  actions:
    数量: 1-3条
    格式: "建议【行动】+ 【理由】"
```

#### 技术雷达模块

```yaml
扫描维度:
  breakthrough:
    定义: 单次出现但影响重大的技术突破
    识别规则: 高影响事件 + 权威来源 + 独特性
    示例: "GPT-5 发布、量子纠错突破"
  
  milestone:
    定义: 技术发展的重要里程碑
    识别规则: 进展节点 + 阶段性成果
    示例: "量产时间表确定、标准发布"
  
  declining:
    定义: 活跃度下降的技术方向
    识别规则: 提及频率下降 + 投资减少
    示例: "某技术路线被放弃"
```

#### 竞争态势模块

```yaml
分析框架:
  organization_matrix:
    维度: [技术投入, 资本动作, 产品发布, 合作关系]
    输出: 组织动态矩阵表
  
  strategy_inference:
    方法: 从行为推断意图
    输出: 每个组织的策略意图描述
  
  landscape_change:
    方法: 对比上周数据
    输出: 竞争格局变化描述
```

### 4.3 输出格式规范

```typescript
interface ReportContentV2 {
  version: "2.0";
  
  meta: {
    reportId: string;
    topicId: string;
    topicName: string;
    period: { start: string; end: string };
    generatedAt: string;
    dataCoverage: {
      documents: number;
      entities: number;
      events: number;
      claims: number;
    };
    confidence: 'high' | 'medium' | 'low';
    confidenceReason: string;
  };
  
  executiveSummary: {
    overview: string;
    keyPoints: Array<{
      point: string;
      evidence: string[];
      impact: string;
    }>;
    recommendedActions: Array<{
      action: string;
      priority: 'high' | 'medium' | 'low';
      rationale: string;
    }>;
  };
  
  sections: {
    techRadar: TechRadarSection;
    competitiveLandscape: CompetitiveSection;
    investmentDeals: InvestmentSection;
    riskOpportunity: RiskSection;
    outlook: OutlookSection;
  };
  
  timeline: TimelineEntry[];
  
  appendix: {
    dataStats: DataStats;
    graphSnapshot: GraphSnapshot;
    sourceIndex: SourceIndex;
  };
}
```

---

## 五、审核与优化

### 5.1 多级审核机制

```
审核流程
┌─────────────────────────────────────────────────────────┐
│ 第一级：自动化审核                                       │
│   ├── 数据完整性检查                                     │
│   ├── 格式规范性检查                                     │
│   ├── 数值范围校验                                       │
│   └── 自动生成审核报告                                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第二级：内容审核                                         │
│   ├── 逻辑一致性检查                                     │
│   ├── 论据充分性检查                                     │
│   ├── 专业术语规范性检查                                 │
│   └── 标注问题点                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 第三级：专家审核（可选）                                 │
│   ├── 专业准确性审核                                     │
│   ├── 判断合理性审核                                     │
│   └── 最终批准                                           │
└─────────────────────────────────────────────────────────┘
```

### 5.2 审核检查清单

```yaml
自动化检查项:
  data_integrity:
    - [ ] 文档数量 >= 5
    - [ ] 实体数量 >= 10
    - [ ] 时间线事件 >= 3
    - [ ] 所有章节已生成
  
  format_compliance:
    - [ ] JSON 格式正确
    - [ ] 所有必填字段存在
    - [ ] 日期格式统一 (YYYY-MM-DD)
    - [ ] confidence 值在 0-1 范围
  
  value_range:
    - [ ] confidence 值合理
    - [ ] 时间范围正确
    - [ ] 统计数字准确

内容检查项:
  logic_consistency:
    - [ ] 执行摘要与正文一致
    - [ ] 数据引用与原始数据一致
    - [ ] 时间线事件顺序正确
  
  evidence_sufficiency:
    - [ ] 关键论断有数据支撑
    - [ ] 信号标记有依据
    - [ ] 推荐行动有理由
  
  terminology:
    - [ ] 专业术语使用正确
    - [ ] 实体名称统一
    - [ ] 无歧义表述
```

### 5.3 审核状态流转

```
状态流转图

  ┌─────────┐
  │ 草稿    │
  └────┬────┘
       │ 自动审核通过
       ▼
  ┌─────────┐
  │ 待审核  │◀─────────────┐
  └────┬────┘              │
       │ 内容审核          │ 驳回修改
       ▼                   │
  ┌─────────┐              │
  │ 审核中  │──────────────┘
  └────┬────┘
       │ 审核通过
       ▼
  ┌─────────┐
  │ 已发布  │
  └─────────┘
```

---

## 六、发布与反馈

### 6.1 发布流程

```
发布流程
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  审核通过    │───▶│  格式转换    │───▶│  版本标记    │
└─────────────┘    └─────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  归档存储    │◀───│  通知推送    │◀───│  发布上线    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 6.2 发布渠道

| 渠道 | 格式 | 触发条件 |
|------|------|----------|
| Web 界面 | HTML + 交互 | 实时 |
| 邮件订阅 | HTML 邮件 | 定时推送 |
| API 接口 | JSON | 按需调用 |
| 导出文件 | PDF/Markdown | 手动导出 |

### 6.3 反馈收集机制

```typescript
interface ReportFeedback {
  reportId: string;
  userId: string;
  type: 'rating' | 'comment' | 'correction' | 'suggestion';
  content: {
    rating?: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    correction?: {
      section: string;
      original: string;
      suggested: string;
      reason: string;
    };
    suggestion?: string;
  };
  createdAt: string;
}
```

### 6.4 持续优化闭环

```
优化闭环
┌─────────────────────────────────────────────────────────┐
│                    反馈收集                              │
│   ├── 用户评分统计                                       │
│   ├── 评论内容分析                                       │
│   ├── 纠错建议整理                                       │
│   └── 使用行为分析                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    问题识别                              │
│   ├── 高频问题分类                                       │
│   ├── 质量短板定位                                       │
│   └── 改进优先级排序                                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    改进实施                              │
│   ├── 模板优化                                          │
│   ├── 算法调整                                          │
│   ├── 数据源扩充                                        │
│   └── 审核规则更新                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    效果验证                              │
│   ├── A/B 测试                                          │
│   ├── 指标对比                                          │
│   └── 用户满意度跟踪                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 七、数据库设计

### 7.1 新增表结构

```sql
-- 报告模板表
CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- weekly/special/alert/executive
  version TEXT NOT NULL,
  structure TEXT NOT NULL, -- JSON 结构定义
  validation_rules TEXT, -- JSON 验证规则
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 报告审核记录表
CREATE TABLE report_reviews (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  reviewer_id TEXT,
  review_type TEXT NOT NULL, -- auto/content/expert
  status TEXT NOT NULL, -- pending/pass/fail
  checklist_results TEXT, -- JSON 检查结果
  issues TEXT, -- JSON 问题列表
  comments TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- 报告反馈表
CREATE TABLE report_feedback (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  user_id TEXT,
  feedback_type TEXT NOT NULL, -- rating/comment/correction/suggestion
  content TEXT NOT NULL, -- JSON 反馈内容
  status TEXT DEFAULT 'new', -- new/processed/ignored
  processed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- 报告图谱关联表
CREATE TABLE report_graph_links (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  graph_node_id TEXT,
  graph_relationship_id TEXT,
  link_type TEXT NOT NULL, -- entity_ref/evidence/impact/path
  metadata TEXT, -- JSON 额外信息
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- 报告版本历史表
CREATE TABLE report_versions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  changed_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  UNIQUE(report_id, version)
);

-- 索引
CREATE INDEX idx_report_reviews_report ON report_reviews(report_id);
CREATE INDEX idx_report_reviews_status ON report_reviews(status);
CREATE INDEX idx_report_feedback_report ON report_feedback(report_id);
CREATE INDEX idx_report_feedback_status ON report_feedback(status);
CREATE INDEX idx_report_graph_links_report ON report_graph_links(report_id);
CREATE INDEX idx_report_graph_links_section ON report_graph_links(section_id);
CREATE INDEX idx_report_versions_report ON report_versions(report_id);
```

### 7.2 更新 reports 表结构

```sql
-- 添加新字段到 reports 表
ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE reports ADD COLUMN version TEXT DEFAULT '1.0.0';
ALTER TABLE reports ADD COLUMN template_id TEXT;
ALTER TABLE reports ADD COLUMN review_status TEXT DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN published_at TEXT;
ALTER TABLE reports ADD COLUMN published_by TEXT;
```

---

## 八、API 接口设计

### 8.1 报告生成接口

```typescript
// POST /api/reports/generate
interface GenerateReportRequest {
  topicId: string;
  type: 'weekly' | 'special' | 'alert';
  period?: {
    start: string; // YYYY-MM-DD
    end: string;
  };
  templateId?: string;
  options?: {
    includeGraphSnapshot: boolean;
    detailLevel: 'brief' | 'standard' | 'comprehensive';
  };
}

interface GenerateReportResponse {
  reportId: string;
  executionId: string;
  status: 'generating';
  estimatedTime: number; // seconds
}
```

### 8.2 报告审核接口

```typescript
// POST /api/reports/:id/review
interface SubmitReviewRequest {
  reviewType: 'auto' | 'content' | 'expert';
  checklistResults: {
    [key: string]: boolean;
  };
  issues: Array<{
    section: string;
    field: string;
    severity: 'error' | 'warning' | 'info';
    description: string;
  }>;
  comments?: string;
  action: 'approve' | 'reject' | 'request_changes';
}

// GET /api/reports/:id/reviews
interface GetReviewsResponse {
  reviews: Array<{
    id: string;
    reviewType: string;
    status: string;
    checklistResults: object;
    issues: object[];
    comments: string;
    reviewedAt: string;
    reviewer: string;
  }>;
}
```

### 8.3 图谱关联接口

```typescript
// GET /api/reports/:id/graph
interface GetReportGraphResponse {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  highlights: Array<{
    nodeId: string;
    sectionRef: string;
    reason: string;
  }>;
  paths: Array<{
    from: string;
    to: string;
    path: string[];
    evidence: string[];
  }>;
}

// GET /api/reports/:id/section/:sectionId/evidence
interface GetSectionEvidenceResponse {
  section: string;
  claims: Array<{
    claim: string;
    evidence: Array<{
      type: 'document' | 'entity' | 'event';
      id: string;
      content: string;
      source: string;
    }>;
    confidence: number;
  }>;
}
```

### 8.4 反馈接口

```typescript
// POST /api/reports/:id/feedback
interface SubmitFeedbackRequest {
  type: 'rating' | 'comment' | 'correction' | 'suggestion';
  content: {
    rating?: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    correction?: {
      section: string;
      original: string;
      suggested: string;
      reason: string;
    };
    suggestion?: string;
  };
}

// GET /api/reports/:id/feedback
interface GetFeedbackResponse {
  feedback: Array<{
    id: string;
    type: string;
    content: object;
    createdAt: string;
    status: string;
  }>;
  stats: {
    averageRating: number;
    totalFeedback: number;
    byType: {
      [type: string]: number;
    };
  };
}
```

---

## 九、前端组件设计

### 9.1 组件结构

```
src/pages/Reports.tsx (重构)
├── ReportGenerator (新)
│   ├── TopicSelector
│   ├── PeriodPicker
│   ├── TemplateSelector
│   └── GenerationProgress
├── ReportList (优化)
│   ├── ReportCard
│   ├── StatusBadge
│   └── QuickActions
├── ReportViewer (重构)
│   ├── ExecutiveSummary
│   ├── SectionViewer
│   ├── TimelineView
│   └── AppendixPanel
├── ReportGraphPanel (新)
│   ├── GraphSnapshot
│   ├── EntityHighlight
│   └── EvidencePath
├── ReportReviewer (新)
│   ├── ChecklistPanel
│   ├── IssueMarker
│   └── ReviewForm
└── FeedbackPanel (新)
    ├── RatingWidget
    ├── CommentForm
    └── CorrectionForm
```

### 9.2 核心交互流程

```
用户交互流程
┌─────────────────────────────────────────────────────────┐
│ 1. 生成报告                                              │
│    选择主题 → 设置周期 → 选择模板 → 开始生成             │
│    ↓                                                    │
│    显示生成进度（实时日志）                              │
│    ↓                                                    │
│    自动进入审核流程                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 审核报告                                              │
│    查看自动审核结果 → 标注问题 → 提交审核意见            │
│    ↓                                                    │
│    通过 → 发布 / 驳回 → 返回修改                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 查看报告                                              │
│    执行摘要 → 各章节 → 时间线 → 附录                     │
│    ↓                                                    │
│    点击实体 → 展开图谱面板                               │
│    ↓                                                    │
│    点击论断 → 显示证据链                                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 提交反馈                                              │
│    评分 → 评论 → 纠错建议                                │
│    ↓                                                    │
│    反馈归档 → 用于后续优化                               │
└─────────────────────────────────────────────────────────┘
```

---

## 十、实施计划

### 10.1 阶段划分

| 阶段 | 内容 | 工期 | 交付物 |
|------|------|------|--------|
| P1 | 数据层重构 | 3天 | 数据库表、视图、API |
| P2 | 图谱关联实现 | 3天 | 关联逻辑、查询接口 |
| P3 | 生成流程优化 | 4天 | 新模板、审核机制 |
| P4 | 前端重构 | 5天 | 新组件、交互优化 |
| P5 | 测试与优化 | 2天 | 测试报告、优化方案 |

### 10.2 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 数据质量不足 | 高 | 高 | 增加数据清洗规则，标注数据缺口 |
| 生成时间过长 | 中 | 中 | 异步生成 + 进度反馈 |
| 审核流程复杂 | 中 | 低 | 简化审核层级，支持快速发布 |
| 图谱关联性能 | 低 | 高 | 预计算 + 缓存 |

---

*本文档将随实施进展持续更新*
