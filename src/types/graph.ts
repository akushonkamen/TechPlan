/**
 * 图数据库类型定义
 * 支持 Neo4j 和 JSON 文件存储两种后端
 */

// 节点标签类型
export type NodeLabel =
  | 'Topic'
  | 'Entity'
  | 'Event'
  | 'Claim'
  | 'Document'
  | 'Person'
  | 'Organization';

// 关系类型
export type RelationType =
  | 'HAS_ENTITY'
  | 'HAS_CLAIM'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'MENTIONS'
  | 'ABOUT'
  | 'AUTHORED_BY'
  | 'PUBLISHED_BY'
  | 'RELATED_TO';

// 基础节点接口
export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

// 具体节点类型
export interface TopicNode extends GraphNode {
  label: 'Topic';
  properties: {
    name: string;
    description?: string;
    priority?: 'high' | 'medium' | 'low';
    scope?: string;
    keywords?: string[];
  };
}

export interface EntityNode extends GraphNode {
  label: 'Entity';
  properties: {
    name: string;
    type?: 'technology' | 'company' | 'product' | 'concept';
    description?: string;
    aliases?: string[];
  };
}

export interface EventNode extends GraphNode {
  label: 'Event';
  properties: {
    title: string;
    eventTime?: string;
    summary?: string;
    confidence?: number;
  };
}

export interface ClaimNode extends GraphNode {
  label: 'Claim';
  properties: {
    claimText: string;
    claimType?: string;
    polarity?: 'positive' | 'negative' | 'neutral';
    confidence?: number;
    noveltyScore?: number;
  };
}

export interface DocumentNode extends GraphNode {
  label: 'Document';
  properties: {
    title: string;
    source?: string;
    sourceUrl?: string;
    publishedDate?: string;
    type?: 'paper' | 'news' | 'internal' | 'standard';
  };
}

export interface PersonNode extends GraphNode {
  label: 'Person';
  properties: {
    name: string;
    role?: string;
    affiliation?: string;
  };
}

export interface OrganizationNode extends GraphNode {
  label: 'Organization';
  properties: {
    name: string;
    type?: 'company' | 'university' | 'research_institute' | 'standard_body';
    website?: string;
  };
}

// 关系接口
export interface GraphRelationship {
  id: string;
  from: string; // source node id
  to: string; // target node id
  type: RelationType;
  properties?: Record<string, any>;
  createdAt?: string;
}

// 子图查询结果
export interface GraphSubgraph {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

// 实体邻域查询结果
export interface EntityNeighborhood {
  entity: GraphNode;
  neighbors: Array<{
    node: GraphNode;
    relationship: GraphRelationship;
  }>;
}

// 图同步状态
export interface SyncStatus {
  lastSyncAt: string | null;
  nodeCount: number;
  relationshipCount: number;
  pendingUpdates: number;
}

// 图数据库配置
export interface GraphDbConfig {
  // Neo4j 配置
  uri?: string;
  username?: string;
  password?: string;

  // JSON 文件配置 (fallback)
  jsonStoragePath?: string;

  // 行为配置
  enableNeo4j?: boolean;
  enableMockMode?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}
