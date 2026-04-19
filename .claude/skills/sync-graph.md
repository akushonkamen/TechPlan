---
version: "1.0.0"
display_name: "图谱同步"
description: |
  将 SQLite 中的结构化数据同步到 Neo4j 知识图谱，
  创建节点、关系和事件节点。
category: sync
timeout: 300
params:
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
steps:
  - "从 SQLite 获取实体、关系、事件、主张数据"
  - "创建/更新 Neo4j 节点（按实体类型分标签）"
  - "创建 Neo4j 关系（类型映射：develops→DEVELOPS 等）"
  - "创建事件和主张节点"
  - "创建主题关联"
---

# 知识图谱同步

你是一个图数据库专家。请将 SQLite 中的结构化数据同步到 Neo4j 知识图谱中。

## 任务参数

- 主题 ID：{{topicId}}

## 执行步骤

### 1. 从 SQLite 获取数据

使用 Bash 工具获取主题相关的所有结构化数据：

```bash
# 获取实体
sqlite3 -json database.sqlite "SELECT e.id, e.text, e.type, e.confidence FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = '{{topicId}}';"

# 获取关系
sqlite3 -json database.sqlite "SELECT r.id, r.source_text, r.target_text, r.relation, r.confidence FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = '{{topicId}}';"

# 获取事件
sqlite3 -json database.sqlite "SELECT ev.id, ev.type, ev.title, ev.description, ev.event_time, ev.participants FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = '{{topicId}}';"

# 获取主张
sqlite3 -json database.sqlite "SELECT c.id, c.text, c.polarity, c.confidence FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = '{{topicId}}';"
```

### 2. 创建/更新 Neo4j 节点

对每个实体，根据类型创建对应的节点标签：

- Technology → `(:Technology {name, confidence})`
- Organization → `(:Organization {name, confidence})`
- Person → `(:Person {name, confidence})`
- Product → `(:Product {name, confidence})`

使用 Bash 工具调用 neo4j_helper：

```bash
scripts/neo4j_helper.sh exec "MERGE (n:Organization {name: '实体名'}) SET n.confidence = 0.9, n.updatedAt = datetime();"
```

同时为每个实体添加 `Entity` 标签以便统一查询。

### 3. 创建关系

对每条关系记录，创建对应的 Neo4j 关系：

```bash
scripts/neo4j_helper.sh exec "
MATCH (a:Entity {name: '源实体'}), (b:Entity {name: '目标实体'})
MERGE (a)-[r:DEVELOPS {confidence: 0.85}]->(b);"
```

关系类型映射：
- develops → DEVELOPS
- competes_with → COMPETES_WITH
- published_by → PUBLISHED_BY
- uses → USES
- invests_in → INVESTS_IN
- partners_with → PARTNERS_WITH

### 4. 创建事件和主张节点

```bash
# 事件节点
scripts/neo4j_helper.sh exec "CREATE (e:Event {type: 'breakthrough', title: '事件标题', description: '描述', eventTime: '2025-01'})"

# 主张节点
scripts/neo4j_helper.sh exec "CREATE (c:Claim {text: '主张内容', polarity: 'positive', confidence: 0.8})"
```

### 5. 创建主题关联

```bash
scripts/neo4j_helper.sh exec "
MATCH (t:Topic {id: '{{topicId}}'}), (e:Entity)
WHERE e.name IN ['实体1', '实体2']
MERGE (t)-[:HAS_ENTITY]->(e);"
```

### 6. 返回结果

```json
{
  "topicId": "{{topicId}}",
  "syncStats": {
    "nodesCreated": 25,
    "relationshipsCreated": 15,
    "eventsCreated": 8,
    "claimsCreated": 10
  },
  "errors": []
}
```
