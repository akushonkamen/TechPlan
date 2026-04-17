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
  schedule: 'daily' | 'weekly' | 'monthly' | 'disabled';
}

// Urgency levels for documents
export type UrgencyLevel = 'breaking' | 'developing' | 'ongoing' | 'archival';

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
  urgency: UrgencyLevel;
  relevance_score: number;
  freshness_hours: number;
  original_source?: string | null;
  dedup_hash?: string | null;
  collection_count?: number;
  first_collected_at?: string | null;
  last_collected_at?: string | null;
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
  urgency?: UrgencyLevel;
  relevance_score?: number;
}

// Re-export from graph types
export * from './types/graph.js';
