export interface Topic {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  owner: string;
  priority: 'high' | 'medium' | 'low';
  scope: string;
  createdAt: string;
  keywords: string[];
  organizations: string[];
  schedule: 'daily' | 'weekly' | 'monthly';
}

export interface Document {
  id: string;
  type: 'paper' | 'news' | 'internal' | 'standard';
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  language: string;
  abstractOrSummary: string;
  trustScore: number;
}

// Database Document type for persistence
export interface DbDocument {
  id: string;
  title: string;
  source: string | null;
  source_url: string | null;
  published_date: string | null;
  collected_date: string;
  content: string | null;
  topic_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

// Input type for creating a document
export interface CreateDocumentInput {
  id?: string;
  title: string;
  source?: string;
  source_url?: string;
  published_date?: string;
  collected_date?: string;
  content?: string;
  topic_id?: string;
  metadata?: Record<string, any>;
}

export interface Event {
  id: string;
  eventType: string;
  title: string;
  eventTime: string;
  summary: string;
  confidence: number;
  sourceCount: number;
}

export interface Claim {
  id: string;
  claimText: string;
  claimType: string;
  polarity: 'positive' | 'negative' | 'neutral';
  confidence: number;
  noveltyScore: number;
  extractedFromDocumentId: string;
}

export interface Recommendation {
  id: string;
  topicId: string;
  direction: string;
  actionType: 'track' | 'pilot' | 'invest' | 'partner' | 'avoid' | 'continuous_tracking' | 'small_pilot' | 'heavy_investment' | 'joint_development' | 'risk_avoidance';
  rationale: string;
  confidence: number;
  generatedAt: string;
}

// ===== 知识抽取类型 =====

export interface Entity {
  id: string;
  text: string;
  type: 'person' | 'organization' | 'technology' | 'product' | 'location' | 'event' | 'other';
  confidence: number;
  metadata?: Record<string, any>;
  document_id?: string;
}

export interface Relation {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: number;
  document_id?: string;
}

export interface ExtractionClaim {
  id: string;
  text: string;
  type: 'prediction' | 'opinion' | 'assertion' | 'finding' | 'announcement';
  polarity: 'positive' | 'negative' | 'neutral';
  confidence: number;
  sourceContext?: string;
  document_id?: string;
}

export interface ExtractionEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  time?: string;
  location?: string;
  participants: string[];
  confidence: number;
  document_id?: string;
}

export interface ExtractionResult {
  entities: Entity[];
  relations: Relation[];
  claims: ExtractionClaim[];
  events: ExtractionEvent[];
  metadata: {
    textLength: number;
    extractedAt: string;
    model: string;
  };
}

// ===== 扩展实体类型 =====

/**
 * Metric - 性能指标
 * 用于记录技术相关的性能数据
 */
export interface Metric {
  id: string;
  name: string;
  value: number | string;
  unit?: string;
  category: 'performance' | 'efficiency' | 'cost' | 'accuracy' | 'speed' | 'quality' | 'other';
  confidence: number;
  context?: string;
  entity?: string; // 关联的实体（如产品/模型名称）
  document_id?: string;
}

/**
 * Method - 算法方法
 * 技术方法、算法、技术路线
 */
export interface Method {
  id: string;
  name: string;
  category?: string;
  description?: string;
  aliases?: string[];
  domain?: string;
  confidence?: number;
  document_id?: string;
}

/**
 * Model - AI 模型
 * 人工智能模型信息
 */
export interface Model {
  id: string;
  name: string;
  type?: 'llm' | 'cv' | 'nlp' | 'multimodal' | 'other';
  developer?: string;
  version?: string;
  parameters?: string; // 如 "7B", "175B"
  capabilities?: string[];
  confidence?: number;
  document_id?: string;
}

/**
 * Product - 产品/服务
 * 商业产品或服务
 */
export interface Product {
  id: string;
  name: string;
  company?: string;
  type?: 'hardware' | 'software' | 'service' | 'platform' | 'other';
  status?: 'announced' | 'released' | 'discontinued' | 'beta';
  releaseDate?: string;
  confidence?: number;
  document_id?: string;
}

/**
 * Standard - 标准规范
 * 技术标准、行业规范
 */
export interface Standard {
  id: string;
  name: string;
  organization?: string;
  type?: 'international' | 'national' | 'industry' | 'de_facto' | 'other';
  status?: 'draft' | 'active' | 'deprecated' | 'withdrawn';
  version?: string;
  confidence?: number;
  document_id?: string;
}

/**
 * Dataset - 数据集
 * 用于训练/评估的数据集
 */
export interface Dataset {
  id: string;
  name: string;
  size?: string;
  domain?: string;
  license?: string;
  language?: string[];
  confidence?: number;
  document_id?: string;
}

/**
 * EntityAlias - 实体别名映射
 * 用于实体解析和归一化
 */
export interface EntityAlias {
  id: string;
  canonical_name: string; // 标准化名称
  alias: string; // 别名
  type: string; // 实体类型
  confidence?: number;
}

/**
 * ResolvedEntity - 解析后的实体
 * 实体对齐后的结果
 */
export interface ResolvedEntity {
  canonicalId: string;
  canonicalName: string;
  aliases: string[];
  type: string;
  mentions: Array<{
    documentId: string;
    text: string;
    confidence: number;
  }>;
  metadata?: Record<string, any>;
}

// ===== 报告类型 =====

/**
 * Report - 分析报告
 */
export interface Report {
  id: string;
  topicId: string;
  topicName: string;
  type: 'weekly' | 'special' | 'alert' | 'executive_summary';
  title: string;
  content: string;
  summary?: string;
  status: 'generating' | 'completed' | 'failed';
  generatedAt: string;
  period?: {
    start: string;
    end: string;
  };
  metadata?: {
    documentCount?: number;
    entityCount?: number;
    keyFindings?: string[];
    model?: string;
  };
}

/**
 * ReportGenerationRequest - 报告生成请求
 */
export interface ReportGenerationRequest {
  topicId: string;
  type: 'weekly' | 'special' | 'alert' | 'executive_summary';
  period?: {
    start: string;
    end: string;
  };
  options?: {
    includeCharts?: boolean;
    includeRecommendations?: boolean;
    detailLevel?: 'brief' | 'standard' | 'comprehensive';
  };
}

// ===== 分析类型 =====

/**
 * AnalysisRequest - 分析请求
 */
export interface AnalysisRequest {
  topicId: string;
  type: 'special_analysis' | 'decision_support' | 'trend_analysis';
  depth?: number; // 图谱深度
  options?: {
    includePredictions?: boolean;
    includeCompetitors?: boolean;
    includeTimeline?: boolean;
  };
}

/**
 * AnalysisResult - 分析结果
 */
export interface AnalysisResult {
  id: string;
  topicId: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  summary?: string;
  findings?: Array<{
    title: string;
    description: string;
    confidence: number;
    evidence: string[];
  }>;
  recommendations?: Recommendation[];
  graph?: {
    nodes: number;
    edges: number;
  };
  error?: string;
}

/**
 * ScoringCard - 评分卡
 * 技术成熟度、热度等评分
 */
export interface ScoringCard {
  topicId: string;
  topicName: string;
  scores: {
    maturity: number; // 技术成熟度 0-100
    academicInterest: number; // 学术关注度 0-100
    industryAdoption: number; // 产业化程度 0-100
    competition: number; // 竞争激烈度 0-100
    overall: number; // 综合评分 0-100
  };
  trends: {
    direction: 'rising' | 'stable' | 'declining';
    changePercent: number;
  };
  lastUpdated: string;
}

// ===== 图数据库类型 =====

// Re-export from graph types
export * from './types/graph.js';

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    confidence?: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    label: string;
    confidence: number;
  }>;
}
