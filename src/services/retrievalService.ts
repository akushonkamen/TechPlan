/**
 * Retrieval Service
 * 适配当前项目的检索服务
 */

import { callAI } from './aiService.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RetrievalQuery {
  text: string;
  topicId?: string;
  filters?: {
    dateRange?: { start: string; end: string };
    sources?: string[];
    minConfidence?: number;
  };
  options?: {
    useFulltext?: boolean;
    useVector?: boolean;
    useGraph?: boolean;
    fulltextWeight?: number;
    vectorWeight?: number;
    graphWeight?: number;
    limit?: number;
  };
}

export interface RetrievedDocument {
  id: string;
  content: string;
  score: number;
  metadata: {
    source?: string;
    publishedAt?: string;
    title?: string;
    [key: string]: any;
  };
  retrievalMethod: 'fulltext' | 'vector' | 'graph' | 'hybrid';
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: any;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'entity' | 'topic' | 'document';
  properties?: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  weight?: number;
}

export interface EvidencePackage {
  documents: Array<{
    id: string;
    title: string;
    source: string;
    date: string;
    relevance: number;
  }>;
  claims: Array<{
    text: string;
    type: string;
    polarity: string;
    confidence: number;
  }>;
  events: Array<{
    title: string;
    type: string;
    time: string;
    participants: string[];
  }>;
  metrics: Array<{
    name: string;
    value: string | number;
    category: string;
  }>;
}

export interface RetrievalResult {
  documents: RetrievedDocument[];
  evidence: EvidencePackage;
}

// ============================================================================
// Vector Embedding Utilities
// ============================================================================

const EMBEDDING_DIM = 1536;

/**
 * Generate text embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await callAI(
      `Generate a JSON array of ${EMBEDDING_DIM} floating-point numbers between -1 and 1 representing the semantic embedding of: "${text.substring(0, 500)}". Return ONLY the JSON array.`,
      'You are an embedding service. Always return a valid JSON array of numbers.'
    );

    const jsonMatch = response.match(/\[[\d\.\,\s\-]+\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length === EMBEDDING_DIM) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('AI embedding generation failed, using fallback:', error);
  }

  return generateFallbackEmbedding(text);
}

/**
 * Generate deterministic fallback embedding
 */
function generateFallbackEmbedding(text: string): number[] {
  const embedding: number[] = [];
  let hash = simpleHash(text);

  for (let i = 0; i < EMBEDDING_DIM; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((hash % 2000 - 1000) / 1000);
  }

  return embedding;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vec;
  return vec.map(val => val / norm);
}

// ============================================================================
// Full-Text Search
// ============================================================================

/**
 * Perform full-text search on documents
 * db parameter is the database connection from server.ts
 */
export async function fulltextSearch(
  db: any,
  query: string,
  filters?: {
    dateRange?: { start: string; end: string };
    sources?: string[];
  },
  limit: number = 20
): Promise<RetrievedDocument[]> {
  let sql = `SELECT * FROM documents WHERE title LIKE ? OR content LIKE ?`;
  const params: any[] = [`%${query}%`, `%${query}%`];

  if (filters?.dateRange) {
    sql += ` AND published_date BETWEEN ? AND ?`;
    params.push(filters.dateRange.start, filters.dateRange.end);
  }

  if (filters?.sources && filters.sources.length > 0) {
    sql += ` AND source IN (${filters.sources.map(() => '?').join(',')})`;
    params.push(...filters.sources);
  }

  sql += ` ORDER BY collected_date DESC LIMIT ?`;
  params.push(limit);

  const results = await db.all(sql, params);

  return results.map((row: any) => {
    const score = calculateRelevanceScore(query, row.title || '' + (row.content || ''));
    return {
      id: row.id,
      content: row.content || '',
      score,
      metadata: {
        source: row.source,
        publishedAt: row.published_date,
        title: row.title
      },
      retrievalMethod: 'fulltext'
    };
  });
}

function calculateRelevanceScore(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let score = 0;
  if (textLower.includes(queryLower)) {
    score += 1.0;
  }

  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  const textWords = textLower.split(/\s+/);

  for (const word of queryWords) {
    const count = textWords.filter(w => w.includes(word)).length;
    score += (count / textWords.length) * 0.5;
  }

  return Math.min(score, 1.0);
}

// ============================================================================
// Vector Search
// ============================================================================

/**
 * Perform semantic vector search
 */
export async function vectorSearch(
  db: any,
  query: string,
  limit: number = 20
): Promise<VectorSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const queryVector = normalizeVector(queryEmbedding);

  // Fetch all documents (simplified - in production use a proper vector DB)
  const documents = await db.all(`SELECT id, title, content FROM documents LIMIT 100`);

  const results: VectorSearchResult[] = [];

  for (const doc of documents) {
    const docText = doc.title + ' ' + (doc.content || '');
    const docEmbedding = await generateEmbedding(docText.substring(0, 500));
    const docVector = normalizeVector(docEmbedding);

    const similarity = cosineSimilarity(queryVector, docVector);
    results.push({
      id: doc.id,
      score: similarity,
      metadata: { title: doc.title }
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// Graph Neighborhood Expansion
// ============================================================================

/**
 * Expand search using knowledge graph relationships
 */
export async function graphNeighborhood(
  db: any,
  entityId: string,
  depth: number = 2
): Promise<GraphNode[]> {
  const nodes: GraphNode[] = [];
  const visited = new Set<string>();

  // Get entities from the same topic
  const entities = await db.all(`
    SELECT DISTINCT text, type
    FROM entities e
    JOIN documents d ON e.document_id = d.id
    WHERE d.topic_id = ?
    LIMIT 50
  `, [entityId]);

  for (const entity of entities) {
    const id = `entity_${entity.text.replace(/\s+/g, '_')}`;
    if (!visited.has(id)) {
      visited.add(id);
      nodes.push({
        id,
        label: entity.text,
        type: 'entity',
        properties: { entityType: entity.type }
      });
    }
  }

  return nodes;
}

// ============================================================================
// Hybrid Search
// ============================================================================

/**
 * Perform hybrid search combining multiple strategies
 */
export async function hybridSearch(
  db: any,
  query: RetrievalQuery
): Promise<RetrievalResult> {
  const options = {
    useFulltext: true,
    useVector: true,
    useGraph: true,
    fulltextWeight: 0.5,
    vectorWeight: 0.3,
    graphWeight: 0.2,
    limit: 20,
    ...query.options
  };

  const results: Map<string, RetrievedDocument> = new Map();
  const graphNodes: GraphNode[] = [];

  // Execute full-text search
  if (options.useFulltext) {
    const fulltextResults = await fulltextSearch(
      db,
      query.text,
      query.filters,
      options.limit
    );

    for (const doc of fulltextResults) {
      doc.score *= options.fulltextWeight;
      results.set(doc.id, doc);
    }
  }

  // Execute vector search
  if (options.useVector) {
    const vectorResults = await vectorSearch(db, query.text, options.limit);

    for (const vdoc of vectorResults) {
      const existing = results.get(vdoc.id);
      if (existing) {
        existing.score += vdoc.score * options.vectorWeight;
      } else {
        const docRow = await db.get(`SELECT * FROM documents WHERE id = ?`, [vdoc.id]);
        if (docRow) {
          results.set(vdoc.id, {
            id: docRow.id,
            content: docRow.content || '',
            score: vdoc.score * options.vectorWeight,
            metadata: {
              source: docRow.source,
              publishedAt: docRow.published_date,
              title: docRow.title
            },
            retrievalMethod: 'vector'
          });
        }
      }
    }
  }

  // Graph neighborhood expansion
  if (options.useGraph && query.topicId) {
    const nodes = await graphNeighborhood(db, query.topicId);
    graphNodes.push(...nodes);
  }

  // Sort and limit
  const sortedDocuments = Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);

  // Normalize scores
  if (sortedDocuments.length > 0) {
    const maxScore = Math.max(...sortedDocuments.map(d => d.score));
    sortedDocuments.forEach(d => {
      d.score = maxScore > 0 ? d.score / maxScore : 0;
    });
  }

  return {
    documents: sortedDocuments,
    evidence: await assembleEvidencePackage(db, query.topicId || '', query.text)
  };
}

// ============================================================================
// Evidence Package Assembly
// ============================================================================

/**
 * Assemble evidence package for reasoning workflow
 */
export async function assembleEvidencePackage(
  db: any,
  topicId: string,
  query: string
): Promise<EvidencePackage> {
  const evidence: EvidencePackage = {
    documents: [],
    claims: [],
    events: [],
    metrics: []
  };

  // Get documents
  const docs = await db.all(
    `SELECT id, title, source, published_date FROM documents WHERE topic_id = ? LIMIT 20`,
    [topicId]
  );

  evidence.documents = docs.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    source: doc.source || 'unknown',
    date: doc.published_date || doc.collected_date,
    relevance: 0.8
  }));

  // Get claims
  const claims = await db.all(`
    SELECT c.* FROM claims c
    JOIN documents d ON c.document_id = d.id
    WHERE d.topic_id = ?
    LIMIT 20
  `, [topicId]);

  evidence.claims = claims.map((c: any) => ({
    text: c.text,
    type: c.type,
    polarity: c.polarity,
    confidence: c.confidence
  }));

  // Get events
  const events = await db.all(`
    SELECT e.* FROM events e
    JOIN documents d ON e.document_id = d.id
    WHERE d.topic_id = ?
    LIMIT 20
  `, [topicId]);

  evidence.events = events.map((e: any) => ({
    title: e.title,
    type: e.type,
    time: e.event_time,
    participants: e.participants ? JSON.parse(e.participants) : []
  }));

  return evidence;
}

// ============================================================================
// Query Analysis
// ============================================================================

/**
 * Analyze query and suggest expansions
 */
export async function analyzeQuery(query: string): Promise<{
  keywords: string[];
  entities: string[];
  expandedQueries: string[];
}> {
  try {
    const response = await callAI(
      `Analyze the search query "${query}" and provide:
1. Key keywords (array)
2. Likely entity names (array)
3. Suggested query expansions (array)

Respond in JSON format:
{
  "keywords": ["word1", "word2"],
  "entities": ["Entity1", "Entity2"],
  "expandedQueries": ["alternative query 1", "alternative query 2"]
}`,
      'You are a query analysis assistant. Always respond with valid JSON.'
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        keywords: parsed.keywords || [],
        entities: parsed.entities || [],
        expandedQueries: parsed.expandedQueries || []
      };
    }
  } catch (error) {
    console.error('Query analysis failed:', error);
  }

  // Fallback
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return {
    keywords,
    entities: [],
    expandedQueries: []
  };
}

/**
 * Expand query with related terms
 */
export async function expandQuery(query: string): Promise<string[]> {
  const analysis = await analyzeQuery(query);
  const expansions = [query];

  if (analysis.keywords.length > 1) {
    for (let i = 0; i < analysis.keywords.length; i++) {
      for (let j = i + 1; j < analysis.keywords.length; j++) {
        expansions.push(`${analysis.keywords[i]} ${analysis.keywords[j]}`);
      }
    }
  }

  for (const entity of analysis.entities) {
    expansions.push(`${query} ${entity}`);
  }

  expansions.push(...analysis.expandedQueries);

  return [...new Set(expansions)];
}
