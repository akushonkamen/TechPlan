/**
 * Neo4j 图数据库连接模块
 * 支持以下模式:
 * 1. Neo4j Driver 模式 - 连接到真实的 Neo4j 数据库
 * 2. JSON 文件模式 - 使用本地 JSON 文件存储图数据 (fallback)
 * 3. Mock 模式 - 内存存储，用于开发和测试
 */

import neo4j, { Driver, Session, Record as NeoRecord } from 'neo4j-driver';
import { promises as fs, writeFileSync, renameSync } from 'fs';
import path from 'path';
import {
  GraphNode,
  GraphRelationship,
  GraphSubgraph,
  EntityNeighborhood,
  GraphDbConfig,
  SyncStatus,
  NodeLabel,
  RelationType,
} from '../types/graph.js';

// 存储后端类型
type StorageBackend = 'neo4j' | 'json' | 'mock';

// JSON 存储结构
interface JsonGraphStorage {
  nodes: Map<string, GraphNode>;
  relationships: Map<string, GraphRelationship>;
  nodeIndex: Map<string, Set<string>>; // label -> node ids (use string for flexibility)
  fromIndex: Map<string, Set<string>>; // from id -> relationship ids
  toIndex: Map<string, Set<string>>; // to id -> relationship ids
}

class Neo4jClient {
  private config: GraphDbConfig;
  private backend: StorageBackend = 'mock';
  private driver: Driver | null = null;
  private jsonStoragePath: string;
  private mockStorage: JsonGraphStorage;
  private isConnected = false;
  private lastSyncTime: string | null = null;

  constructor(config: GraphDbConfig = {}) {
    this.config = {
      enableMockMode: false,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    // JSON 文件存储路径
    this.jsonStoragePath = this.config.jsonStoragePath ||
      path.join(process.cwd(), 'data', 'graph-data.json');

    // 初始化内存存储 (用于 mock 模式)
    this.mockStorage = {
      nodes: new Map(),
      relationships: new Map(),
      nodeIndex: new Map(),
      fromIndex: new Map(),
      toIndex: new Map(),
    };
  }

  /**
   * 初始化连接
   */
  async connect(): Promise<boolean> {
    // 优先尝试 Neo4j
    if (this.config.enableNeo4j !== false && this.config.uri && this.config.username && this.config.password) {
      try {
        this.driver = neo4j.driver(
          this.config.uri,
          neo4j.auth.basic(this.config.username, this.config.password),
          {
            maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
            maxTransactionRetryTime: 30 * 1000, // 30 seconds
          }
        );

        // 验证连接
        const serverInfo = await this.driver.getServerInfo();
        console.log('Connected to Neo4j:', serverInfo);
        this.backend = 'neo4j';
        this.isConnected = true;
        return true;
      } catch (error) {
        console.warn('Failed to connect to Neo4j, falling back to JSON storage:', error);
        this.driver = null;
      }
    }

    // 尝试加载 JSON 存储
    if (this.config.enableMockMode !== true) {
      try {
        await this.loadJsonStorage();
        this.backend = 'json';
        this.isConnected = true;
        console.log(`Using JSON file storage: ${this.jsonStoragePath}`);
        return true;
      } catch (error) {
        console.warn('Failed to load JSON storage, using mock mode:', error);
      }
    }

    // 使用 Mock 模式
    this.backend = 'mock';
    this.isConnected = true;
    console.log('Using mock in-memory storage');
    return true;
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }

    if (this.backend === 'json') {
      await this.saveJsonStorage();
    }

    this.isConnected = false;
  }

  /**
   * 获取当前后端类型
   */
  getBackendType(): StorageBackend {
    return this.backend;
  }

  /**
   * 检查是否已连接
   */
  isConnectedToDb(): boolean {
    return this.isConnected;
  }

  // ==================== 节点操作 ====================

  /**
   * 创建节点
   */
  async createNode(
    label: NodeLabel,
    properties: Record<string, any>
  ): Promise<GraphNode> {
    const node: GraphNode = {
      id: properties.id || this.generateId(),
      label,
      properties: { ...properties },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.backend === 'neo4j' && this.driver) {
      return await this.createNodeNeo4j(node);
    } else {
      return await this.createNodeLocal(node);
    }
  }

  /**
   * 批量创建节点
   */
  async createNodes(nodes: Array<{ label: NodeLabel; properties: Record<string, any> }>): Promise<GraphNode[]> {
    const results: GraphNode[] = [];
    for (const node of nodes) {
      results.push(await this.createNode(node.label, node.properties));
    }
    return results;
  }

  /**
   * 获取节点
   */
  async getNode(id: string): Promise<GraphNode | null> {
    if (this.backend === 'neo4j' && this.driver) {
      return await this.getNodeNeo4j(id);
    } else {
      return await this.getNodeLocal(id);
    }
  }

  /**
   * 更新节点
   */
  async updateNode(id: string, properties: Record<string, any>): Promise<GraphNode | null> {
    if (this.backend === 'neo4j' && this.driver) {
      return await this.updateNodeNeo4j(id, properties);
    } else {
      return await this.updateNodeLocal(id, properties);
    }
  }

  /**
   * 删除节点
   */
  async deleteNode(id: string): Promise<boolean> {
    if (this.backend === 'neo4j' && this.driver) {
      return await this.deleteNodeNeo4j(id);
    } else {
      return await this.deleteNodeLocal(id);
    }
  }

  // ==================== 关系操作 ====================

  /**
   * 创建关系
   */
  async createRelationship(
    fromId: string,
    toId: string,
    type: RelationType,
    properties: Record<string, any> = {}
  ): Promise<GraphRelationship | null> {
    const relationship: GraphRelationship = {
      id: this.generateId(),
      from: fromId,
      to: toId,
      type,
      properties,
      createdAt: new Date().toISOString(),
    };

    if (this.backend === 'neo4j' && this.driver) {
      return await this.createRelationshipNeo4j(relationship);
    } else {
      return await this.createRelationshipLocal(relationship);
    }
  }

  /**
   * 获取关系
   */
  async getRelationship(id: string): Promise<GraphRelationship | null> {
    if (this.backend === 'neo4j' && this.driver) {
      return await this.getRelationshipNeo4j(id);
    } else {
      return this.mockStorage.relationships.get(id) || null;
    }
  }

  /**
   * 删除关系
   */
  async deleteRelationship(id: string): Promise<boolean> {
    if (this.backend === 'neo4j' && this.driver) {
      return await this.deleteRelationshipNeo4j(id);
    } else {
      return await this.deleteRelationshipLocal(id);
    }
  }

  // ==================== 图查询操作 ====================

  /**
   * 获取主题子图 (BFS 遍历)
   */
  async getTopicGraph(topicId: string, depth: number = 2): Promise<GraphSubgraph> {
    const nodes = new Map<string, GraphNode>();
    const relationships = new Map<string, GraphRelationship>();

    const startNode = await this.getNode(topicId);
    if (!startNode) {
      return { nodes: [], relationships: [] };
    }

    nodes.set(startNode.id, startNode);

    // BFS 遍历
    const queue: Array<{ nodeId: string; currentDepth: number }> = [
      { nodeId: topicId, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId, currentDepth } = queue.shift()!;

      if (currentDepth >= depth) continue;

      // 获取出边
      const outgoingRels = await this.getOutgoingRelationships(nodeId);
      for (const rel of outgoingRels) {
        relationships.set(rel.id, rel);

        if (!nodes.has(rel.to)) {
          const neighborNode = await this.getNode(rel.to);
          if (neighborNode) {
            nodes.set(neighborNode.id, neighborNode);
            queue.push({ nodeId: neighborNode.id, currentDepth: currentDepth + 1 });
          }
        }
      }

      // 获取入边
      const incomingRels = await this.getIncomingRelationships(nodeId);
      for (const rel of incomingRels) {
        relationships.set(rel.id, rel);

        if (!nodes.has(rel.from)) {
          const neighborNode = await this.getNode(rel.from);
          if (neighborNode) {
            nodes.set(neighborNode.id, neighborNode);
            queue.push({ nodeId: neighborNode.id, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      relationships: Array.from(relationships.values()),
    };
  }

  /**
   * 查找相关实体
   */
  async findRelatedEntities(entityId: string, depth: number = 2): Promise<GraphNode[]> {
    const subgraph = await this.getTopicGraph(entityId, depth);
    return subgraph.nodes.filter(n => n.label === 'Entity' && n.id !== entityId);
  }

  /**
   * 查找主题相关的 Claims
   */
  async findClaimsByTopic(topicId: string): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];
    const visited = new Set<string>([topicId]);
    const queue = [topicId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      const outgoingRels = await this.getOutgoingRelationships(nodeId);
      for (const rel of outgoingRels) {
        if (rel.type === 'HAS_CLAIM') {
          const claimNode = await this.getNode(rel.to);
          if (claimNode && !visited.has(claimNode.id)) {
            nodes.push(claimNode);
            visited.add(claimNode.id);
          }
        } else if (!visited.has(rel.to)) {
          queue.push(rel.to);
          visited.add(rel.to);
        }
      }
    }

    return nodes;
  }

  /**
   * 获取实体邻域
   */
  async getEntityNeighborhood(entityId: string): Promise<EntityNeighborhood | null> {
    const entity = await this.getNode(entityId);
    if (!entity) return null;

    const neighbors: Array<{ node: GraphNode; relationship: GraphRelationship }> = [];

    // 出边邻居
    const outgoingRels = await this.getOutgoingRelationships(entityId);
    for (const rel of outgoingRels) {
      const neighborNode = await this.getNode(rel.to);
      if (neighborNode) {
        neighbors.push({ node: neighborNode, relationship: rel });
      }
    }

    // 入边邻居
    const incomingRels = await this.getIncomingRelationships(entityId);
    for (const rel of incomingRels) {
      const neighborNode = await this.getNode(rel.from);
      if (neighborNode) {
        neighbors.push({ node: neighborNode, relationship: rel });
      }
    }

    return { entity, neighbors };
  }

  /**
   * 查找路径
   */
  async findPath(fromId: string, toId: string, maxDepth: number = 4): Promise<GraphNode[]> {
    if (fromId === toId) return [await this.getNode(fromId)].filter(Boolean) as GraphNode[];

    const visited = new Set<string>([fromId]);
    const parentMap = new Map<string, { nodeId: string; rel: GraphRelationship }>();
    const queue = [fromId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const currentDepth = Array.from(visited).length;

      if (currentDepth > maxDepth) break;

      const outgoingRels = await this.getOutgoingRelationships(nodeId);
      for (const rel of outgoingRels) {
        if (!visited.has(rel.to)) {
          visited.add(rel.to);
          parentMap.set(rel.to, { nodeId, rel });
          queue.push(rel.to);

          if (rel.to === toId) {
            return this.reconstructPath(fromId, toId, parentMap);
          }
        }
      }
    }

    return [];
  }

  // ==================== 同步操作 ====================

  /**
   * 同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const allNodes = await this.getAllNodes();
    const allRels = await this.getAllRelationships();

    return {
      lastSyncAt: this.lastSyncTime,
      nodeCount: allNodes.length,
      relationshipCount: allRels.length,
      pendingUpdates: 0, // 可以实现更复杂的跟踪
    };
  }

  /**
   * 保存当前状态
   */
  async save(): Promise<void> {
    if (this.backend === 'json') {
      await this.saveJsonStorage();
    }
    this.lastSyncTime = new Date().toISOString();
  }

  // ==================== Neo4j 私有方法 ====================

  private async createNodeNeo4j(node: GraphNode): Promise<GraphNode> {
    const session = this.driver!.session();
    try {
      const result = await session.run(
        `
        CREATE (n:${node.label} $properties)
        SET n.id = $id
        SET n.createdAt = $createdAt
        SET n.updatedAt = $updatedAt
        RETURN n
        `,
        {
          properties: node.properties,
          id: node.id,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        }
      );

      const record = result.records[0];
      return this.neo4jRecordToNode(record.get('n'), node.label);
    } finally {
      await session.close();
    }
  }

  private async getNodeNeo4j(id: string): Promise<GraphNode | null> {
    const session = this.driver!.session();
    try {
      const result = await session.run(
        'MATCH (n) WHERE n.id = $id RETURN n',
        { id }
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const neoNode = record.get('n');
      const label = (neoNode.labels as string[]).find(l =>
        ['Topic', 'Entity', 'Event', 'Claim', 'Document', 'Person', 'Organization'].includes(l)
      ) as NodeLabel;

      return this.neo4jRecordToNode(neoNode, label);
    } finally {
      await session.close();
    }
  }

  private async updateNodeNeo4j(id: string, properties: Record<string, any>): Promise<GraphNode | null> {
    const session = this.driver!.session();
    try {
      const result = await session.run(
        `
        MATCH (n {id: $id})
        SET n += $properties
        SET n.updatedAt = $updatedAt
        RETURN n
        `,
        {
          id,
          properties,
          updatedAt: new Date().toISOString(),
        }
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const neoNode = record.get('n');
      const label = (neoNode.labels as string[]).find(l =>
        ['Topic', 'Entity', 'Event', 'Claim', 'Document', 'Person', 'Organization'].includes(l)
      ) as NodeLabel;

      return this.neo4jRecordToNode(neoNode, label);
    } finally {
      await session.close();
    }
  }

  private async deleteNodeNeo4j(id: string): Promise<boolean> {
    const session = this.driver!.session();
    try {
      await session.run(
        'MATCH (n {id: $id}) DETACH DELETE n',
        { id }
      );
      return true;
    } catch (error) {
      console.error('[Neo4j] Failed to delete node:', id, error);
      return false;
    } finally {
      await session.close();
    }
  }

  private async createRelationshipNeo4j(rel: GraphRelationship): Promise<GraphRelationship> {
    const session = this.driver!.session();
    try {
      await session.run(
        `
        MATCH (from {id: $fromId})
        MATCH (to {id: $toId})
        CREATE (from)-[r:${rel.type}]->(to)
        SET r.id = $id
        SET r += $properties
        SET r.createdAt = $createdAt
        RETURN r
        `,
        {
          fromId: rel.from,
          toId: rel.to,
          id: rel.id,
          properties: rel.properties || {},
          createdAt: rel.createdAt,
        }
      );

      return rel;
    } finally {
      await session.close();
    }
  }

  private async getRelationshipNeo4j(id: string): Promise<GraphRelationship | null> {
    const session = this.driver!.session();
    try {
      const result = await session.run(
        'MATCH ()-[r]->() WHERE r.id = $id RETURN r',
        { id }
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const neoRel = record.get('r');
      return this.neo4jRecordToRelationship(neoRel);
    } finally {
      await session.close();
    }
  }

  private async deleteRelationshipNeo4j(id: string): Promise<boolean> {
    const session = this.driver!.session();
    try {
      await session.run(
        'MATCH ()-[r {id: $id}]->() DELETE r',
        { id }
      );
      return true;
    } catch {
      return false;
    } finally {
      await session.close();
    }
  }

  private async getOutgoingRelationships(nodeId: string): Promise<GraphRelationship[]> {
    if (this.backend === 'neo4j' && this.driver) {
      const session = this.driver.session();
      try {
        const result = await session.run(
          'MATCH (from {id: $id})-[r]->(to) RETURN r',
          { id: nodeId }
        );
        return result.records.map(record =>
          this.neo4jRecordToRelationship(record.get('r'))
        );
      } finally {
        await session.close();
      }
    } else {
      const relIds = this.mockStorage.fromIndex.get(nodeId) || new Set();
      return Array.from(relIds)
        .map(id => this.mockStorage.relationships.get(id))
        .filter(Boolean) as GraphRelationship[];
    }
  }

  private async getIncomingRelationships(nodeId: string): Promise<GraphRelationship[]> {
    if (this.backend === 'neo4j' && this.driver) {
      const session = this.driver.session();
      try {
        const result = await session.run(
          'MATCH (from)-[r]->(to {id: $id}) RETURN r',
          { id: nodeId }
        );
        return result.records.map(record =>
          this.neo4jRecordToRelationship(record.get('r'))
        );
      } finally {
        await session.close();
      }
    } else {
      const relIds = this.mockStorage.toIndex.get(nodeId) || new Set();
      return Array.from(relIds)
        .map(id => this.mockStorage.relationships.get(id))
        .filter(Boolean) as GraphRelationship[];
    }
  }

  private neo4jRecordToNode(neoNode: any, label: NodeLabel): GraphNode {
    return {
      id: neoNode.properties.id,
      label,
      properties: { ...neoNode.properties },
      createdAt: neoNode.properties.createdAt,
      updatedAt: neoNode.properties.updatedAt,
    };
  }

  private neo4jRecordToRelationship(neoRel: any): GraphRelationship {
    return {
      id: neoRel.properties.id || this.generateId(),
      from: neoRel.start,
      to: neoRel.end,
      type: neoRel.type as RelationType,
      properties: { ...neoRel.properties },
      createdAt: neoRel.properties.createdAt,
    };
  }

  // ==================== 本地存储私有方法 ====================

  private async createNodeLocal(node: GraphNode): Promise<GraphNode> {
    this.mockStorage.nodes.set(node.id, node);

    // 更新索引
    if (!this.mockStorage.nodeIndex.has(node.label)) {
      this.mockStorage.nodeIndex.set(node.label, new Set());
    }
    this.mockStorage.nodeIndex.get(node.label)!.add(node.id);

    return node;
  }

  private async getNodeLocal(id: string): Promise<GraphNode | null> {
    return this.mockStorage.nodes.get(id) || null;
  }

  private async updateNodeLocal(id: string, properties: Record<string, any>): Promise<GraphNode | null> {
    const node = this.mockStorage.nodes.get(id);
    if (!node) return null;

    const updated: GraphNode = {
      ...node,
      properties: { ...node.properties, ...properties },
      updatedAt: new Date().toISOString(),
    };

    this.mockStorage.nodes.set(id, updated);
    return updated;
  }

  private async deleteNodeLocal(id: string): Promise<boolean> {
    const existed = this.mockStorage.nodes.has(id);
    this.mockStorage.nodes.delete(id);

    // 删除相关的关系
    const fromRels = this.mockStorage.fromIndex.get(id) || new Set();
    const toRels = this.mockStorage.toIndex.get(id) || new Set();

    for (const relId of fromRels) {
      this.mockStorage.relationships.delete(relId);
    }
    for (const relId of toRels) {
      this.mockStorage.relationships.delete(relId);
    }

    this.mockStorage.fromIndex.delete(id);
    this.mockStorage.toIndex.delete(id);

    return existed;
  }

  private async createRelationshipLocal(relationship: GraphRelationship): Promise<GraphRelationship> {
    this.mockStorage.relationships.set(relationship.id, relationship);

    // 更新索引
    if (!this.mockStorage.fromIndex.has(relationship.from)) {
      this.mockStorage.fromIndex.set(relationship.from, new Set());
    }
    this.mockStorage.fromIndex.get(relationship.from)!.add(relationship.id);

    if (!this.mockStorage.toIndex.has(relationship.to)) {
      this.mockStorage.toIndex.set(relationship.to, new Set());
    }
    this.mockStorage.toIndex.get(relationship.to)!.add(relationship.id);

    return relationship;
  }

  private async deleteRelationshipLocal(id: string): Promise<boolean> {
    const rel = this.mockStorage.relationships.get(id);
    if (!rel) return false;

    this.mockStorage.relationships.delete(id);

    // 更新索引
    const fromRels = this.mockStorage.fromIndex.get(rel.from);
    if (fromRels) {
      fromRels.delete(id);
    }

    const toRels = this.mockStorage.toIndex.get(rel.to);
    if (toRels) {
      toRels.delete(id);
    }

    return true;
  }

  public async getAllNodes(): Promise<GraphNode[]> {
    if (this.backend === 'neo4j' && this.driver) {
      const session = this.driver.session();
      try {
        const result = await session.run('MATCH (n) RETURN n');
        return result.records.map(record => {
          const neoNode = record.get('n');
          const label = (neoNode.labels as string[]).find(l =>
            ['Topic', 'Entity', 'Event', 'Claim', 'Document', 'Person', 'Organization'].includes(l)
          ) as NodeLabel;
          return this.neo4jRecordToNode(neoNode, label);
        });
      } finally {
        await session.close();
      }
    } else {
      return Array.from(this.mockStorage.nodes.values());
    }
  }

  public async getAllRelationships(): Promise<GraphRelationship[]> {
    if (this.backend === 'neo4j' && this.driver) {
      const session = this.driver.session();
      try {
        const result = await session.run('MATCH ()-[r]->() RETURN r');
        return result.records.map(record =>
          this.neo4jRecordToRelationship(record.get('r'))
        );
      } finally {
        await session.close();
      }
    } else {
      return Array.from(this.mockStorage.relationships.values());
    }
  }

  // ==================== JSON 存储 ====================

  private async loadJsonStorage(): Promise<void> {
    try {
      const dataDir = path.dirname(this.jsonStoragePath);
      await fs.mkdir(dataDir, { recursive: true });

      const content = await fs.readFile(this.jsonStoragePath, 'utf-8');
      const data = JSON.parse(content);

      // 重建 Map 和 Set
      this.mockStorage.nodes = new Map(data.nodes || []);
      this.mockStorage.relationships = new Map(data.relationships || []);
      this.mockStorage.nodeIndex = this.rebuildMapSet(data.nodeIndex || []);
      this.mockStorage.fromIndex = this.rebuildMapSet(data.fromIndex || []);
      this.mockStorage.toIndex = this.rebuildMapSet(data.toIndex || []);
    } catch (error) {
      // 文件不存在，使用空存储
      console.log('No existing graph data found, starting with empty storage');
    }
  }

  private async saveJsonStorage(): Promise<void> {
    const dataDir = path.dirname(this.jsonStoragePath);
    await fs.mkdir(dataDir, { recursive: true });

    const data = {
      nodes: Array.from(this.mockStorage.nodes.entries()),
      relationships: Array.from(this.mockStorage.relationships.entries()),
      nodeIndex: Array.from(this.mockStorage.nodeIndex.entries()).map(([k, v]) => [k, Array.from(v)]),
      fromIndex: Array.from(this.mockStorage.fromIndex.entries()).map(([k, v]) => [k, Array.from(v)]),
      toIndex: Array.from(this.mockStorage.toIndex.entries()).map(([k, v]) => [k, Array.from(v)]),
      lastUpdated: new Date().toISOString(),
    };

    // Atomic write: use temp file then rename
    const tmpPath = this.jsonStoragePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmpPath, this.jsonStoragePath);
  }

  private rebuildMapSet(data: Array<[string, string[]]>): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const [key, values] of data) {
      map.set(key, new Set(values));
    }
    return map;
  }

  // ==================== 工具方法 ====================

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private reconstructPath(
    fromId: string,
    toId: string,
    parentMap: Map<string, { nodeId: string; rel: GraphRelationship }>
  ): GraphNode[] {
    const path: GraphNode[] = [];
    let current = toId;

    while (current !== fromId) {
      const node = this.mockStorage.nodes.get(current);
      if (node) path.unshift(node);

      const parent = parentMap.get(current);
      if (!parent) break;
      current = parent.nodeId;
    }

    const startNode = this.mockStorage.nodes.get(fromId);
    if (startNode) path.unshift(startNode);

    return path;
  }
}

// 单例模式
let clientInstance: Neo4jClient | null = null;

/**
 * 获取 Neo4j 客户端实例
 */
export async function getNeo4jClient(config?: GraphDbConfig): Promise<Neo4jClient> {
  if (!clientInstance) {
    clientInstance = new Neo4jClient(config);
    await clientInstance.connect();
  }
  return clientInstance;
}

/**
 * 关闭 Neo4j 客户端
 */
export async function closeNeo4jClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}

export { Neo4jClient };
export type { GraphDbConfig };
