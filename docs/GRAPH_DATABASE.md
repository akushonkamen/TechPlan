# 图数据库集成文档

TechPlan 项目集成了图数据库功能，用于存储和查询知识图谱（实体、关系、事件、声明等）。

## 架构

图数据库模块支持三种后端存储模式：

1. **Neo4j 模式** - 连接到真实的 Neo4j 数据库（完整功能）
2. **JSON 文件模式** - 使用本地 JSON 文件存储（默认 fallback）
3. **Mock 模式** - 内存存储，用于开发和测试

系统会自动选择最佳后端：
- 如果配置了 Neo4j 连接信息且连接成功 → 使用 Neo4j
- 如果 JSON 文件存在或可创建 → 使用 JSON 文件
- 否则 → 使用 Mock 内存模式

## 环境变量配置

```bash
# Neo4j 连接配置（可选）
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# JSON 存储路径（可选，默认 ./data/graph-data.json）
GRAPH_JSON_PATH=./data/graph-data.json

# 启用 Mock 模式（可选，默认 false）
GRAPH_MOCK_MODE=false
```

## 数据模型

### 节点类型 (NodeLabel)

- `Topic` - 主题/话题
- `Entity` - 实体（技术、公司、产品等）
- `Event` - 事件
- `Claim` - 声明/观点
- `Document` - 文档
- `Person` - 人物
- `Organization` - 机构组织

### 关系类型 (RelationType)

- `HAS_ENTITY` - 主题包含实体
- `HAS_CLAIM` - 主题/文档包含声明
- `SUPPORTS` - 支持
- `CONTRADICTS` - 矛盾
- `MENTIONS` - 提及
- `ABOUT` - 关于
- `AUTHORED_BY` - 由...创作
- `PUBLISHED_BY` - 由...发布
- `RELATED_TO` - 相关

## API 端点

### 图数据库状态

```
GET /api/graph/status
```

响应：
```json
{
  "backend": "json",
  "lastSyncAt": "2025-01-15T10:30:00Z",
  "nodeCount": 42,
  "relationshipCount": 85,
  "pendingUpdates": 0
}
```

### 获取主题图谱

```
GET /api/graph/topic/:id?depth=2
```

响应：
```json
{
  "nodes": [
    { "id": "1", "label": "端侧大模型", "type": "topic", "properties": {...} }
  ],
  "links": [
    { "id": "r1", "source": "1", "target": "2", "label": "HAS_ENTITY", "properties": {} }
  ]
}
```

### 获取实体邻域

```
GET /api/graph/entity/:id
```

### 查找主题相关 Claims

```
GET /api/graph/claims/:topicId
```

### 查找相关实体

```
GET /api/graph/related/:entityId?depth=2
```

### 同步 SQLite 数据到图数据库

```
POST /api/graph/sync
```

### 创建节点

```
POST /api/graph/nodes
Content-Type: application/json

{
  "label": "Entity",
  "properties": {
    "name": "GPT-4",
    "type": "technology"
  }
}
```

### 更新节点

```
PUT /api/graph/nodes/:id
Content-Type: application/json

{
  "properties": {
    "name": "GPT-4 Turbo",
    "description": "Updated description"
  }
}
```

### 删除节点

```
DELETE /api/graph/nodes/:id
```

### 创建关系

```
POST /api/graph/relationships
Content-Type: application/json

{
  "from": "node_id_1",
  "to": "node_id_2",
  "type": "SUPPORTS",
  "properties": {
    "confidence": 0.9
  }
}
```

### 查找路径

```
GET /api/graph/path?from=node1&to=node2&maxDepth=4
```

### 保存图数据

```
POST /api/graph/save
```

## 前端使用

```typescript
import {
  getTopicGraph,
  getEntityNeighborhood,
  syncGraphData
} from '../services/graphApi';

// 获取主题图谱
const graph = await getTopicGraph('topic_id', 2);

// 同步数据
const result = await syncGraphData();
console.log(`Created ${result.nodesCreated} nodes`);
```

## 开发指南

### 添加新的节点类型

1. 在 `src/types/graph.ts` 中添加新的 `NodeLabel` 类型
2. 创建对应的节点接口（如 `XxxNode extends GraphNode`）
3. 在 `Neo4jClient` 中更新标签白名单

### 添加新的关系类型

1. 在 `src/types/graph.ts` 中添加新的 `RelationType` 类型
2. 在需要的地方使用新关系类型

## 故障排查

### Neo4j 连接失败

如果 Neo4j 连接失败，系统会自动降级到 JSON 文件存储。检查：

1. Neo4j 服务是否运行
2. 连接 URI 是否正确
3. 用户名和密码是否正确

### JSON 文件权限

确保应用有权限创建和写入 `data/graph-data.json`：

```bash
mkdir -p data
chmod 755 data
```

### 数据丢失

JSON 文件模式需要手动调用保存操作：

```bash
curl -X POST http://localhost:3000/api/graph/save
```

或在设置调度器时定期自动保存。
