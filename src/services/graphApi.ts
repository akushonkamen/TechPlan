/**
 * 图数据库前端 API 客户端
 */

const API_BASE = '/api/graph';

// 图节点类型
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
}

// 图链接类型
export interface GraphLink {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, any>;
}

// 子图数据
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// 实体邻域数据
export interface EntityNeighborhood {
  entity: GraphNode;
  neighbors: Array<{
    node: GraphNode;
    relationship: {
      id: string;
      from: string;
      to: string;
      type: string;
      properties: Record<string, any>;
    };
  }>;
  graph: GraphData;
}

// 图数据库状态
export interface GraphStatus {
  backend: string;
  lastSyncAt: string | null;
  nodeCount: number;
  relationshipCount: number;
  pendingUpdates: number;
}

/**
 * 获取图数据库状态
 */
export async function getGraphStatus(): Promise<GraphStatus> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error('Failed to get graph status');
  }
  return response.json();
}

/**
 * 获取主题图谱
 */
export async function getTopicGraph(topicId: string, depth: number = 2): Promise<GraphData> {
  const response = await fetch(`${API_BASE}/topic/${topicId}?depth=${depth}`);
  if (!response.ok) {
    throw new Error('Failed to get topic graph');
  }
  return response.json();
}

/**
 * 获取实体邻域
 */
export async function getEntityNeighborhood(entityId: string): Promise<EntityNeighborhood> {
  const response = await fetch(`${API_BASE}/entity/${entityId}`);
  if (!response.ok) {
    throw new Error('Failed to get entity neighborhood');
  }
  return response.json();
}

/**
 * 查找主题相关的 Claims
 */
export async function findClaimsByTopic(topicId: string): Promise<{ claims: GraphNode[]; count: number }> {
  const response = await fetch(`${API_BASE}/claims/${topicId}`);
  if (!response.ok) {
    throw new Error('Failed to find claims');
  }
  return response.json();
}

/**
 * 查找相关实体
 */
export async function findRelatedEntities(
  entityId: string,
  depth: number = 2
): Promise<{ entities: GraphNode[]; count: number }> {
  const response = await fetch(`${API_BASE}/related/${entityId}?depth=${depth}`);
  if (!response.ok) {
    throw new Error('Failed to find related entities');
  }
  return response.json();
}

/**
 * 同步 SQLite 数据到图数据库
 */
export async function syncGraphData(): Promise<{
  message: string;
  nodesCreated: number;
  relationshipsCreated: number;
  errors: string[];
}> {
  const response = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to sync graph data');
  }
  return response.json();
}

/**
 * 创建节点
 */
export async function createNode(
  label: string,
  properties: Record<string, any>
): Promise<GraphNode> {
  const response = await fetch(`${API_BASE}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label, properties }),
  });
  if (!response.ok) {
    throw new Error('Failed to create node');
  }
  return response.json();
}

/**
 * 更新节点
 */
export async function updateNode(
  id: string,
  properties: Record<string, any>
): Promise<GraphNode> {
  const response = await fetch(`${API_BASE}/nodes/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  if (!response.ok) {
    throw new Error('Failed to update node');
  }
  return response.json();
}

/**
 * 删除节点
 */
export async function deleteNode(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/nodes/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete node');
  }
}

/**
 * 创建关系
 */
export async function createRelationship(
  from: string,
  to: string,
  type: string,
  properties?: Record<string, any>
): Promise<GraphLink> {
  const response = await fetch(`${API_BASE}/relationships`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, type, properties }),
  });
  if (!response.ok) {
    throw new Error('Failed to create relationship');
  }
  return response.json();
}

/**
 * 查找路径
 */
export async function findPath(
  from: string,
  to: string,
  maxDepth: number = 4
): Promise<{ path: GraphNode[]; length: number }> {
  const response = await fetch(`${API_BASE}/path?from=${from}&to=${to}&maxDepth=${maxDepth}`);
  if (!response.ok) {
    throw new Error('Failed to find path');
  }
  return response.json();
}

/**
 * 保存图数据
 */
export async function saveGraph(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/save`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to save graph');
  }
  return response.json();
}
