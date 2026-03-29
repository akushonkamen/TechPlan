# 分析报告生成

你是一个技术情报分析师。请基于已采集的文档和抽取的知识，生成一份结构化的技术分析报告。

## 任务参数

- 主题 ID：{{topicId}}
- 主题名称：{{topicName}}
- 报告类型：{{reportType}}
- 时间范围起始：{{timeRangeStart}}
- 时间范围结束：{{timeRangeEnd}}

## 执行步骤

### 1. 收集素材

使用 Bash 工具从数据库获取相关数据：

```bash
# 获取文档
sqlite3 -json database.sqlite "SELECT id, title, source, published_date, content FROM documents WHERE topic_id = '{{topicId}}' ORDER BY published_date DESC LIMIT 30;"

# 获取实体
sqlite3 -json database.sqlite "SELECT e.text, e.type, e.confidence, COUNT(*) as mentions FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = '{{topicId}}' GROUP BY e.text ORDER BY mentions DESC LIMIT 30;"

# 获取关系
sqlite3 -json database.sqlite "SELECT r.source_text, r.relation, r.target_text, r.confidence FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = '{{topicId}}' ORDER BY r.confidence DESC LIMIT 30;"

# 获取事件
sqlite3 -json database.sqlite "SELECT ev.type, ev.title, ev.description, ev.event_time, ev.participants FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = '{{topicId}}' ORDER BY ev.event_time DESC LIMIT 20;"

# 获取主张
sqlite3 -json database.sqlite "SELECT c.text, c.polarity, c.confidence FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = '{{topicId}}' ORDER BY c.confidence DESC LIMIT 20;"
```

### 2. 生成报告

根据报告类型生成对应格式的报告：

#### 周报 (weekly)
结构：
1. **概要**: 本周关键动态总结（3-5 条）
2. **技术进展**: 重要技术突破和发展
3. **组织动向**: 关注企业的关键动作
4. **竞争格局**: 竞争态势变化
5. **投资与合作**: 重要投资、合作事件
6. **风险与机会**: 潜在风险和机遇分析
7. **下周展望**: 值得关注的方向

#### 专题报告 (special)
结构：
1. **背景**: 技术领域概述
2. **现状分析**: 当前发展阶段
3. **关键玩家**: 主要参与方及其策略
4. **技术路线图**: 技术演进路径
5. **SWOT 分析**: 优势、劣势、机会、威胁
6. **建议**: 战略建议

#### 预警 (alert)
结构：
1. **预警内容**: 简明扼要的预警描述
2. **触发因素**: 导致预警的事件
3. **影响评估**: 对业务的影响
4. **建议行动**: 应对措施

### 3. 存入数据库

```bash
sqlite3 database.sqlite "INSERT INTO reports (id, topic_id, topic_name, type, title, summary, content, status, generated_at, period_start, period_end, metadata) VALUES ('$(uuidgen)', '{{topicId}}', '{{topicName}}', '{{reportType}}', '报告标题', '摘要', '报告正文（JSON转义的完整内容）', 'completed', '$(date -I)', '{{timeRangeStart}}', '{{timeRangeEnd}}', '{}');"
```

### 4. 返回结果

```json
{
  "topicId": "{{topicId}}",
  "topicName": "{{topicName}}",
  "reportType": "{{reportType}}",
  "title": "报告标题",
  "summary": "报告摘要",
  "contentLength": 5000,
  "sourcesUsed": 15,
  "period": {
    "start": "2025-01-01",
    "end": "2025-01-07"
  }
}
```
