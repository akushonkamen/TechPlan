# 图数据库与知识图谱

TechPlan 的知识图谱以 SQLite 为事实源，以 Kuzu 作为本地图数据库缓存，并用自定义 SVG 画布在前端渲染。图谱目标是帮助用户快速理解一个技术主题的结构：核心技术、产品/组织、关键关系、事件与证据。

## 架构

- **SQLite**：主存储，保存 `topics`、`documents`、`entities`、`relations`、`claims`、`events`。
- **Kuzu**：可选本地图数据库缓存，文件位于项目根目录 `database.kuzu`。当主题图谱没有 Kuzu 数据时，接口会触发后台同步并立即使用 SQLite fallback 返回数据。
- **Graph Sensemaking**：语义地形缓存，保存 LLM 生成的簇、节点角色和阅读路径；缓存缺失或刷新失败时使用规则 fallback。
- **自定义 SVG 图谱画布**：前端图谱画布，默认使用技术地形布局；搜索默认高亮，不删除上下文。

## 数据模型

节点类型：

- `topic`：技术追踪主题
- `technology`：技术、方法、算法、机制
- `product`：产品、模型、库、工具
- `organization`：公司、机构、实验室
- `entity`：其他实体
- `event`：事件
- `claim`：观点、判断、主张
- `document`：文档

关系类型：

- 结构关系：`HAS_ENTITY`、`HAS_EVENT`、`HAS_CLAIM`、`PARTICIPATED_IN`
- 常规关系：`DEVELOPS`、`COMPETES_WITH`、`USES`、`INVESTS_IN`、`PARTNERS_WITH`、`PUBLISHED_BY`、`SUPPORTS`、`CONTRADICTS`、`MENTIONS`、`RELATED_TO`
- 技术关系：`COMPRESSES`、`EXTENDS`、`MODIFIES`、`IMPROVES`、`EVOLVES_FROM`、`BENCHMARKS`

前端统一类型定义在 `src/types/graph.ts`。新增节点或关系类型时，应先更新该文件，再更新 Kuzu schema、同步逻辑和前端筛选列表。

## API

### 图谱状态

```http
GET /api/graph/status
```

返回当前活跃 backend、SQLite 计数和 Kuzu 计数：

```json
{
  "backend": "kuzu",
  "nodeCount": 52,
  "relationshipCount": 84,
  "sqliteNodeCount": 41,
  "sqliteRelationshipCount": 28,
  "kuzuNodeCount": 52,
  "kuzuRelCount": 84,
  "claimCount": 19,
  "eventCount": 8,
  "lastSyncAt": "2026-04-17T10:00:00.000Z"
}
```

### 获取主题图谱

```http
GET /api/graph/topic/:id?hop=1
```

- `hop=0`：主题到实体/事件/claim 的 spoke view。
- `hop=1`：额外返回主题内实体之间的语义关系，前端默认使用。

响应：

```json
{
  "nodes": [
    { "id": "1776260701289", "label": "Agent上下文管理", "type": "topic", "properties": {} }
  ],
  "links": [
    { "id": "r0", "source": "e_a", "target": "e_b", "label": "COMPRESSES", "properties": { "confidence": 0.95 } }
  ],
  "metadata": {
    "backend": "sqlite",
    "topicId": "1776260701289",
    "hop": 1,
    "nodeCount": 42,
    "linkCount": 36
  }
}
```

### 获取实体邻域

```http
GET /api/graph/neighbor/:entityName?hop=1&limit=30
```

返回顶层 `nodes` / `links`，并保留 `graph.nodes` / `graph.links` 兼容旧调用。

### 最近发展

```http
GET /api/graph/recent/:topicId?hours=24
```

用于前端 Recent 面板和 pulse 标记，返回最近文档、活跃实体和新兴关系。

### 获取语义地形

```http
GET /api/graph/sensemaking/:topicId
```

返回 LLM 缓存或规则 fallback：

```json
{
  "topicId": "1776260701289",
  "graphHash": "...",
  "status": "cache",
  "source": "llm",
  "clusters": [
    {
      "id": "kv-cache-compression",
      "label": "KV Cache / 压缩",
      "summary": "围绕 KV cache 和上下文压缩的技术路线。",
      "priority": 10,
      "nodeIds": ["e_xxx"],
      "relationFocus": ["COMPRESSES", "USES"]
    }
  ],
  "assignments": [
    { "nodeId": "e_xxx", "clusterId": "kv-cache-compression", "role": "anchor" }
  ],
  "readingPath": [
    { "title": "KV Cache / 压缩", "nodeIds": ["e_xxx"], "relationIds": ["r1"] }
  ]
}
```

```http
POST /api/graph/sensemaking/:topicId/refresh
```

异步触发 LLM 刷新。接口立即返回当前 fallback/cache，前端可继续轮询 `GET` 查看刷新结果。

### 同步到 Kuzu

```http
POST /api/graph/sync/:topicId
```

从 SQLite 去重实体和关系，写入 Kuzu。同步会保留技术关系类型，例如 `compresses` 会映射为 `COMPRESSES`，不会降级为 `RELATED_TO`。

## 前端布局规则

- 默认布局是“技术地形图”：Topic 和核心语义簇共同构成主题地图，产品/组织分区展示，事件在底部时间带。
- 首屏核心优先：默认展示 top 实体、强关系和少量事件；claim 默认隐藏，可通过类型过滤打开。
- 左侧面板展示语义簇、摘要、节点数和关键关系；点击簇会高亮簇内节点并淡化其他簇。
- 搜索默认只高亮匹配节点并弱化其他节点；切换到 filter 模式时才隐藏非匹配节点。
- 双击实体进入 1-hop focus mode，并使用完整 canonical name 请求邻域，不使用截断 label。

## 验证

图谱相关改动至少运行：

```bash
npm run lint
npx vitest run
npm run build
```
