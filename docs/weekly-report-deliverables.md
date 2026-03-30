# 周报生成链路 - 交付物清单

> 创建日期：2026-03-30
> 版本：v1.0

---

## 一、已交付文档

### 1.1 设计文档

| 文档名称 | 路径 | 说明 |
|----------|------|------|
| 周报生成链路设计方案 | [docs/weekly-report-pipeline-design.md](file:///home/yalun/Dev/TechPlan/docs/weekly-report-pipeline-design.md) | 完整的设计方案，包含需求分析、数据采集、图谱关联、内容生成、审核发布等所有环节 |
| 周报生成流程图 | [docs/weekly-report-flowchart.md](file:///home/yalun/Dev/TechPlan/docs/weekly-report-flowchart.md) | 详细的流程图，包括整体流程、图谱关联流程、状态流转、数据流向、API 调用序列 |

### 1.2 技能模板

| 技能名称 | 路径 | 版本 | 说明 |
|----------|------|------|------|
| 咨询级报告生成 | [.claude/skills/report.md](file:///home/yalun/Dev/TechPlan/.claude/skills/report.md) | v3.0.0 | 六阶段生成流程，包含数据收集、信号识别、分析框架、内容生成、质量检查、图谱关联 |

---

## 二、已实现的后端服务

### 2.1 数据库迁移

**文件**: [src/services/reportService.ts](file:///home/yalun/Dev/TechPlan/src/services/reportService.ts)

新增表结构：
- `report_templates` - 报告模板表
- `report_reviews` - 报告审核记录表
- `report_feedback` - 报告反馈表
- `report_graph_links` - 报告图谱关联表
- `report_versions` - 报告版本历史表

更新 `reports` 表字段：
- `status` - 报告状态（draft/published）
- `version` - 版本号
- `template_id` - 模板ID
- `review_status` - 审核状态
- `published_at` - 发布时间
- `published_by` - 发布人
- `period_start` / `period_end` - 报告周期

### 2.2 报告审核服务

**文件**: [src/services/reportReviewService.ts](file:///home/yalun/Dev/TechPlan/src/services/reportReviewService.ts)

功能：
- 自动化审核（10项检查规则）
- 内容审核提交
- 审核结果查询
- 模板管理

检查类别：
| 类别 | 检查项 |
|------|--------|
| 数据完整性 | 文档数量、实体数量、时间线事件、章节完整性 |
| 格式规范性 | JSON格式、必填字段、日期格式 |
| 数值范围 | confidence值范围 |
| 逻辑一致性 | 执行摘要与正文一致性 |
| 证据充分性 | 关键论断数据支撑 |

### 2.3 报告图谱关联服务

**文件**: [src/services/reportGraphService.ts](file:///home/yalun/Dev/TechPlan/src/services/reportGraphService.ts)

功能：
- `buildGraphLinks()` - 构建报告与图谱的关联
- `getGraphSnapshot()` - 获取报告图谱快照
- `getSectionEvidence()` - 获取章节证据链
- `findEvidencePath()` - 查找证据路径
- `getRelatedNodes()` - 获取相关节点

---

## 三、已实现的 API 接口

### 3.1 报告模板

```
GET /api/reports/templates
```
获取所有活跃的报告模板

### 3.2 报告审核

```
GET  /api/reports/:id/reviews
POST /api/reports/:id/reviews
```
获取/提交审核记录

请求体：
```json
{
  "reviewType": "content|expert",
  "checklistResults": { "item_id": true },
  "issues": [{ "section": "", "field": "", "severity": "", "description": "" }],
  "comments": "",
  "action": "approve|reject|request_changes"
}
```

### 3.3 图谱关联

```
GET /api/reports/:id/graph
GET /api/reports/:id/section/:sectionId/evidence
GET /api/reports/:id/evidence-path?from=实体A&to=实体B
```

### 3.4 反馈收集

```
GET  /api/reports/:id/feedback
POST /api/reports/:id/feedback
```

请求体：
```json
{
  "type": "rating|comment|correction|suggestion",
  "content": {
    "rating": 5,
    "comment": "..."
  }
}
```

### 3.5 发布管理

```
POST /api/reports/:id/publish
POST /api/reports/:id/versions
GET  /api/reports/:id/versions
```

---

## 四、核心流程改进

### 4.1 报告生成流程

```
原流程：
用户触发 → LLM生成 → 直接保存 → 完成

新流程：
用户触发 → 数据收集 → 信号识别 → 分析框架 → 内容生成 
       → 质量检查 → 图谱关联 → 自动审核 → 待人工审核/发布
```

### 4.2 状态流转

```
draft → pending → review → published
                  ↓
              rejected → editing → pending
```

### 4.3 图谱关联机制

```
报告生成时：
1. 提取章节中的 entityRefs
2. 匹配图谱节点
3. 创建 report_graph_links 记录

用户查看时：
1. 点击实体 → 展开图谱面板
2. 点击论断 → 显示证据链
3. 查看时间线 → 播放演变动画
```

---

## 五、数据模型

### 5.1 报告内容结构 v2.0

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
  sections: Array<{
    id: string;
    title: string;
    thesis: string;
    content: string;
    highlights: string[];
    signals: Array<{
      type: string;
      title: string;
      description: string;
      confidence: number;
    }>;
    entityRefs: string[];
  }>;
  timeline: Array<{
    date: string;
    event: string;
    significance: string;
    entityRefs: string[];
  }>;
  metrics: {
    documentsAnalyzed: number;
    entitiesCovered: number;
    sourcesCredibility: string;
  };
}
```

### 5.2 信号类型

| 类型 | 说明 | 置信度范围 |
|------|------|-----------|
| breakthrough | 突破性进展 | 0.9-1.0 |
| milestone | 里程碑事件 | 0.8-0.9 |
| trend | 趋势性信号 | 0.7-0.8 |
| opportunity | 机会信号 | 0.6-0.8 |
| threat | 威胁信号 | 0.6-0.8 |
| declining | 衰减信号 | 0.5-0.7 |

---

## 六、后续工作建议

### 6.1 前端实现（待开发）

1. **报告审核页面**
   - 审核清单面板
   - 问题标注组件
   - 审核表单

2. **图谱关联面板**
   - 图谱快照展示
   - 实体高亮交互
   - 证据链展示

3. **反馈收集组件**
   - 评分组件
   - 评论表单
   - 纠错建议表单

### 6.2 功能增强（待开发）

1. **邮件订阅**
   - HTML 邮件模板
   - 定时推送机制

2. **导出功能**
   - PDF 导出
   - Markdown 导出

3. **版本对比**
   - 版本差异展示
   - 变更历史

### 6.3 性能优化（待开发）

1. **缓存策略**
   - 图谱数据缓存
   - 报告内容缓存

2. **异步处理**
   - 大型报告异步生成
   - 进度实时推送

---

## 七、测试建议

### 7.1 单元测试

```bash
# 测试审核服务
npm test -- reportReviewService.test.ts

# 测试图谱关联服务
npm test -- reportGraphService.test.ts
```

### 7.2 集成测试

```bash
# 测试完整流程
1. 创建主题
2. 采集文档
3. 抽取实体
4. 同步图谱
5. 生成报告
6. 自动审核
7. 查看图谱关联
8. 提交反馈
```

### 7.3 API 测试

```bash
# 获取模板
curl http://localhost:3000/api/reports/templates

# 获取报告图谱
curl http://localhost:3000/api/reports/{id}/graph

# 提交审核
curl -X POST http://localhost:3000/api/reports/{id}/reviews \
  -H "Content-Type: application/json" \
  -d '{"reviewType":"content","action":"approve"}'

# 提交反馈
curl -X POST http://localhost:3000/api/reports/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"rating","content":{"rating":5}}'
```

---

*本文档总结了周报生成链路的所有交付物，包括设计文档、后端服务、API 接口等。前端实现和功能增强待后续开发。*
