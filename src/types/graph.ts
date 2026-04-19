import type { Edge, Node } from 'reactflow';

export const GRAPH_NODE_TYPES = [
  'topic',
  'technology',
  'product',
  'organization',
  'entity',
  'event',
  'claim',
  'document',
] as const;

export type GraphNodeType = typeof GRAPH_NODE_TYPES[number];

export const GRAPH_RELATION_TYPES = [
  'HAS_ENTITY',
  'ABOUT',
  'HAS_EVENT',
  'HAS_CLAIM',
  'PARTICIPATED_IN',
  'RELATED_TO',
  'DEVELOPS',
  'COMPETES_WITH',
  'USES',
  'INVESTS_IN',
  'PARTNERS_WITH',
  'PUBLISHED_BY',
  'SUPPORTS',
  'CONTRADICTS',
  'MENTIONS',
  'COMPRESSES',
  'EXTENDS',
  'MODIFIES',
  'IMPROVES',
  'EVOLVES_FROM',
  'BENCHMARKS',
] as const;

export type GraphRelationType = typeof GRAPH_RELATION_TYPES[number];

export type GraphExportFormat = 'json' | 'png';

export type GraphClusterRole = 'anchor' | 'member' | 'bridge' | 'supporting';

export interface GraphSensemakingCluster {
  id: string;
  label: string;
  summary: string;
  priority: number;
  nodeIds: string[];
  relationFocus: GraphRelationType[];
}

export interface GraphSensemakingAssignment {
  nodeId: string;
  clusterId: string;
  role: GraphClusterRole;
}

export interface GraphReadingPathStep {
  title: string;
  nodeIds: string[];
  relationIds: string[];
}

export interface GraphSensemakingResult {
  topicId: string;
  graphHash: string;
  status: 'cache' | 'fallback' | 'refreshing' | 'error';
  source: 'llm' | 'fallback';
  generatedAt: string;
  clusters: GraphSensemakingCluster[];
  assignments: GraphSensemakingAssignment[];
  readingPath: GraphReadingPathStep[];
  error?: string;
}

export type GraphEdgeVisualType =
  | 'has_entity'
  | 'has_event'
  | 'has_claim'
  | 'participated_in'
  | 'supports'
  | 'contradicts'
  | 'related_to';

export interface GraphNodeData {
  label: string;
  fullLabel?: string;
  canonicalName?: string;
  type: GraphNodeType;
  description?: string;
  url?: string;
  metadata?: Record<string, any>;
  topicId?: string;
  highlighted?: boolean;
  searchMatched?: boolean;
  dimmed?: boolean;
  importance?: number;
  recent?: boolean;
  pulse?: boolean;
  clusterId?: string;
  clusterLabel?: string;
  clusterRole?: GraphClusterRole;
}

export interface GraphEdgeData {
  label?: string;
  type: GraphEdgeVisualType;
  relationType?: GraphRelationType;
  confidence?: number;
  recent?: boolean;
  dimmed?: boolean;
}

export type GraphNode = Node<GraphNodeData>;
export type GraphEdge = Edge<GraphEdgeData>;

export const RELATION_LABELS: Record<GraphRelationType, string> = {
  HAS_ENTITY: '实体',
  ABOUT: '关于',
  HAS_EVENT: '事件',
  HAS_CLAIM: '主张',
  PARTICIPATED_IN: '参与',
  RELATED_TO: '相关',
  DEVELOPS: '研发',
  COMPETES_WITH: '竞争',
  USES: '使用',
  INVESTS_IN: '投资',
  PARTNERS_WITH: '合作',
  PUBLISHED_BY: '发布',
  SUPPORTS: '支持',
  CONTRADICTS: '反驳',
  MENTIONS: '提及',
  COMPRESSES: '压缩',
  EXTENDS: '扩展',
  MODIFIES: '修改',
  IMPROVES: '改进',
  EVOLVES_FROM: '演化',
  BENCHMARKS: '评测',
};

const NODE_TYPE_ALIASES: Record<string, GraphNodeType> = {
  topic: 'topic',
  entity: 'entity',
  event: 'event',
  claim: 'claim',
  document: 'document',
  technology: 'technology',
  tech: 'technology',
  product: 'product',
  organization: 'organization',
  organisation: 'organization',
  org: 'organization',
  company: 'organization',
  person: 'entity',
};

const RELATION_ALIASES: Record<string, GraphRelationType> = {
  HAS_ENTITY: 'HAS_ENTITY',
  ABOUT: 'ABOUT',
  HAS_EVENT: 'HAS_EVENT',
  HAS_CLAIM: 'HAS_CLAIM',
  PARTICIPATED_IN: 'PARTICIPATED_IN',
  RELATED_TO: 'RELATED_TO',
  DEVELOPS: 'DEVELOPS',
  COMPETES_WITH: 'COMPETES_WITH',
  USES: 'USES',
  INVESTS_IN: 'INVESTS_IN',
  PARTNERS_WITH: 'PARTNERS_WITH',
  PUBLISHED_BY: 'PUBLISHED_BY',
  SUPPORTS: 'SUPPORTS',
  CONTRADICTS: 'CONTRADICTS',
  MENTIONS: 'MENTIONS',
  COMPRESSES: 'COMPRESSES',
  EXTENDS: 'EXTENDS',
  MODIFIES: 'MODIFIES',
  IMPROVES: 'IMPROVES',
  EVOLVES_FROM: 'EVOLVES_FROM',
  BENCHMARKS: 'BENCHMARKS',
};

export const ENTITY_RELATION_TYPES = GRAPH_RELATION_TYPES.filter(
  rel => !['HAS_ENTITY', 'HAS_EVENT', 'HAS_CLAIM', 'ABOUT'].includes(rel)
);

export const DEFAULT_VISIBLE_RELATIONS: GraphRelationType[] = [
  'DEVELOPS',
  'COMPETES_WITH',
  'USES',
  'INVESTS_IN',
  'PARTNERS_WITH',
  'SUPPORTS',
  'CONTRADICTS',
  'MENTIONS',
  'COMPRESSES',
  'EXTENDS',
  'MODIFIES',
  'IMPROVES',
  'EVOLVES_FROM',
  'BENCHMARKS',
  'RELATED_TO',
];

export function normalizeGraphNodeType(type?: string | null): GraphNodeType {
  if (!type) return 'entity';
  return NODE_TYPE_ALIASES[type.trim().toLowerCase()] ?? 'entity';
}

export function normalizeGraphRelationType(relation?: string | null): GraphRelationType {
  if (!relation) return 'RELATED_TO';
  const normalized = relation.trim().replace(/[\s-]+/g, '_').toUpperCase();
  return RELATION_ALIASES[normalized] ?? 'RELATED_TO';
}

export function getGraphRelationLabel(relation?: string | null): string {
  const normalized = normalizeGraphRelationType(relation);
  return RELATION_LABELS[normalized] ?? normalized;
}

export function getEdgeVisualType(relation?: string | null): GraphEdgeVisualType {
  const normalized = normalizeGraphRelationType(relation);
  if (normalized === 'HAS_ENTITY') return 'has_entity';
  if (normalized === 'HAS_EVENT') return 'has_event';
  if (normalized === 'HAS_CLAIM') return 'has_claim';
  if (normalized === 'PARTICIPATED_IN') return 'participated_in';
  if (normalized === 'SUPPORTS') return 'supports';
  if (normalized === 'CONTRADICTS') return 'contradicts';
  return 'related_to';
}
