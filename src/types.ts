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
  actionType: 'track' | 'pilot' | 'invest' | 'partner' | 'avoid';
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
