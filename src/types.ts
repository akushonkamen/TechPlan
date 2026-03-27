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
