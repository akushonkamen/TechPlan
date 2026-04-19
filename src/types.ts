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
