---
version: "2.0.0"
display_name: "图谱同步"
description: |
  将 SQLite 中的结构化数据同步到 Kuzu 知识图谱，
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
  - "调用同步 API 将数据写入 Kuzu 图数据库"
  - "返回同步统计"
---

# 知识图谱同步（Kuzu）

你是一个图数据库同步专家。请将 SQLite 中的结构化数据同步到 Kuzu 嵌入式图数据库中。

## 任务参数

- 主题 ID：{{topicId}}

## 执行步骤

### 1. 调用同步 API

使用 Bash 工具调用同步接口：

```bash
curl -s -X POST http://localhost:3000/api/graph/sync/{{topicId}} | python3 -m json.tool
```

如果服务运行在其他端口，请使用实际端口。

### 2. 验证同步结果

检查返回的 JSON 中的 `syncStats`：
- `nodesCreated`: 创建的节点数
- `relationshipsCreated`: 创建的关系数

### 3. 返回结果

```json
{
  "topicId": "{{topicId}}",
  "syncStats": {
    "nodesCreated": 25,
    "relationshipsCreated": 15
  },
  "errors": []
}
```

## 数据模型

Kuzu 图数据库包含以下节点和关系类型：

### 节点类型
- **Topic** — 主题（id, name, description）
- **Entity** — 实体（name, type, confidence, docCount, firstSeen）
- **Event** — 事件（id, title, eventType, eventTime, participants, confidence）
- **Claim** — 主张（id, text, polarity, confidence）

### 关系类型
- `HAS_ENTITY` (Topic → Entity)
- `HAS_EVENT` (Topic → Event)
- `HAS_CLAIM` (Topic → Claim)
- `DEVELOPS`, `COMPETES_WITH`, `USES`, `INVESTS_IN`, `PARTNERS_WITH`
- `PUBLISHED_BY`, `SUPPORTS`, `CONTRADICTS`, `MENTIONS`, `RELATED_TO`
