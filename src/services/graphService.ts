/**
 * 图数据库服务层
 * 提供高层次的图操作 API
 */

import { getNeo4jClient, Neo4jClient } from '../db/neo4j.js';
import type {
  GraphNode,
  GraphRelationship,
  GraphSubgraph,
  EntityNeighborhood,
  SyncStatus,
  NodeLabel,
  RelationType,
} from '../types/graph.js';

class GraphService {
  private client: Neo4jClient | null = null;

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    this.client = await getNeo4jClient({
      uri: process.env.NEO4J_URI,
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD,
      jsonStoragePath: process.env.GRAPH_JSON_PATH,
      enableMockMode: process.env.GRAPH_MOCK_MODE === 'true',
    });

    console.log(`GraphService initialized with backend: ${this.client.getBackendType()}`);
  }

  /**
   * 创建节点
   */
  async createNode(
    label: NodeLabel,
    properties: Record<string, any>
  ): Promise<GraphNode> {
    if (!this.client) await this.init();
    return this.client!.createNode(label, properties);
  }

  /**
   * 批量创建节点
   */
  async createNodes(
    nodes: Array<{ label: NodeLabel; properties: Record<string, any> }>
  ): Promise<GraphNode[]> {
    if (!this.client) await this.init();
    return this.client!.createNodes(nodes);
  }

  /**
   * 获取节点
   */
  async getNode(id: string): Promise<GraphNode | null> {
    if (!this.client) await this.init();
    return this.client!.getNode(id);
  }

  /**
   * 更新节点
   */
  async updateNode(id: string, properties: Record<string, any>): Promise<GraphNode | null> {
    if (!this.client) await this.init();
    return this.client!.updateNode(id, properties);
  }

  /**
   * 删除节点
   */
  async deleteNode(id: string): Promise<boolean> {
    if (!this.client) await this.init();
    return this.client!.deleteNode(id);
  }

  /**
   * 创建关系
   */
  async createRelationship(
    from: string,
    to: string,
    type: RelationType,
    properties: Record<string, any> = {}
  ): Promise<GraphRelationship | null> {
    if (!this.client) await this.init();
    return this.client!.createRelationship(from, to, type, properties);
  }

  /**
   * 获取主题图谱
   */
  async getTopicGraph(topicId: string, depth: number = 2): Promise<GraphSubgraph> {
    if (!this.client) await this.init();
    return this.client!.getTopicGraph(topicId, depth);
  }

  /**
   * 查找相关实体
   */
  async findRelatedEntities(entityId: string, depth: number = 2): Promise<GraphNode[]> {
    if (!this.client) await this.init();
    return this.client!.findRelatedEntities(entityId, depth);
  }

  /**
   * 查找主题相关的 Claims
   */
  async findClaimsByTopic(topicId: string): Promise<GraphNode[]> {
    if (!this.client) await this.init();
    return this.client!.findClaimsByTopic(topicId);
  }

  /**
   * 获取实体详情和邻域
   */
  async getEntityNeighborhood(entityId: string): Promise<EntityNeighborhood | null> {
    if (!this.client) await this.init();
    return this.client!.getEntityNeighborhood(entityId);
  }

  /**
   * 查找两个节点之间的路径
   */
  async findPath(fromId: string, toId: string, maxDepth: number = 4): Promise<GraphNode[]> {
    if (!this.client) await this.init();
    return this.client!.findPath(fromId, toId, maxDepth);
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    if (!this.client) await this.init();
    return this.client!.getSyncStatus();
  }

  /**
   * 保存当前状态
   */
  async save(): Promise<void> {
    if (this.client) {
      await this.client.save();
    }
  }

  /**
   * 获取后端类型
   */
  getBackendType(): string {
    return this.client?.getBackendType() || 'unknown';
  }

  // ==================== SQLite 同步方法 ====================

  /**
   * 从 SQLite 同步数据到图数据库
   * 将 Topic 和 Document 转换为图节点和关系
   */
  async syncFromSQLite(db: any): Promise<{
    nodesCreated: number;
    relationshipsCreated: number;
    errors: string[];
  }> {
    if (!this.client) await this.init();

    const result = {
      nodesCreated: 0,
      relationshipsCreated: 0,
      errors: [] as string[],
    };

    try {
      // 同步 Topics
      const topics = await db.all('SELECT * FROM topics');

      for (const topic of topics) {
        try {
          const topicNode = await this.createNode('Topic', {
            id: topic.id,
            name: topic.name,
            description: topic.description,
            priority: topic.priority,
            scope: topic.scope,
            keywords: topic.keywords ? JSON.parse(topic.keywords) : [],
            createdAt: topic.createdAt,
          });
          result.nodesCreated++;

          // 为关键词创建 Entity 节点
          const keywords = topic.keywords ? JSON.parse(topic.keywords) : [];
          for (const keyword of keywords) {
            try {
              // 查找或创建实体节点
              const existingEntities = await this.findEntitiesByName(keyword);
              let entityNode: GraphNode;

              if (existingEntities.length > 0) {
                entityNode = existingEntities[0];
              } else {
                entityNode = await this.createNode('Entity', {
                  name: keyword,
                  type: 'concept',
                });
                result.nodesCreated++;
              }

              // 创建 Topic-Entity 关系
              await this.createRelationship(topicNode.id, entityNode.id, 'HAS_ENTITY');
              result.relationshipsCreated++;
            } catch (err) {
              result.errors.push(`Failed to sync entity "${keyword}": ${err}`);
            }
          }

          // 为机构创建 Organization 节点
          const organizations = topic.organizations ? JSON.parse(topic.organizations) : [];
          for (const org of organizations) {
            try {
              const existingOrgs = await this.findOrganizationsByName(org);
              let orgNode: GraphNode;

              if (existingOrgs.length > 0) {
                orgNode = existingOrgs[0];
              } else {
                orgNode = await this.createNode('Organization', {
                  name: org,
                  type: 'company',
                });
                result.nodesCreated++;
              }

              await this.createRelationship(topicNode.id, orgNode.id, 'ABOUT');
              result.relationshipsCreated++;
            } catch (err) {
              result.errors.push(`Failed to sync organization "${org}": ${err}`);
            }
          }
        } catch (err) {
          result.errors.push(`Failed to sync topic "${topic.id}": ${err}`);
        }
      }

      // 同步 Documents
      const documents = await db.all('SELECT * FROM documents');

      for (const doc of documents) {
        try {
          const docNode = await this.createNode('Document', {
            id: doc.id,
            title: doc.title,
            source: doc.source,
            sourceUrl: doc.source_url,
            publishedDate: doc.published_date,
            type: doc.metadata?.type || 'news',
          });
          result.nodesCreated++;

          // 创建 Document-Topic 关系
          if (doc.topic_id) {
            await this.createRelationship(docNode.id, doc.topic_id, 'ABOUT');
            result.relationshipsCreated++;
          }
        } catch (err) {
          result.errors.push(`Failed to sync document "${doc.id}": ${err}`);
        }
      }

      // 保存状态
      await this.save();

    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
    }

    return result;
  }

  /**
   * 查找实体（通过名称）
   */
  private async findEntitiesByName(name: string): Promise<GraphNode[]> {
    if (!this.client) await this.init();

    const allNodes = await this.client!.getAllNodes();
    return allNodes.filter(
      node =>
        node.label === 'Entity' &&
        node.properties.name === name
    );
  }

  /**
   * 查找组织（通过名称）
   */
  private async findOrganizationsByName(name: string): Promise<GraphNode[]> {
    if (!this.client) await this.init();

    const allNodes = await this.client!.getAllNodes();
    return allNodes.filter(
      node =>
        node.label === 'Organization' &&
        node.properties.name === name
    );
  }
}

// 单例实例
let serviceInstance: GraphService | null = null;

/**
 * 获取图服务实例
 */
export function getGraphService(): GraphService {
  if (!serviceInstance) {
    serviceInstance = new GraphService();
  }
  return serviceInstance;
}

export { GraphService };
