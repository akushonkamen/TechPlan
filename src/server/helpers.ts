import * as crypto from 'crypto';

/** Safely parse JSON, returning fallback on failure */
export function safeJsonParse(val: string | null | undefined, fallback: any = null): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return val; }
}

/**
 * Calculate time decay score based on published date vs now
 */
export function calculateTimeDecay(publishedDate: string | null, urgency: string = 'ongoing'): number {
  if (!publishedDate) return 0.5;

  const now = new Date();
  const published = new Date(publishedDate);
  const hoursSince = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

  const urgencyMultiplier: Record<string, number> = {
    'breaking': 0.1,
    'developing': 0.05,
    'ongoing': 0.01,
    'archival': 0.001
  };

  const decay = urgencyMultiplier[urgency] || 0.01;
  const relevance = Math.max(0, Math.exp(-decay * hoursSince));

  return relevance;
}

/**
 * Calculate freshness hours since published date
 */
export function calculateFreshnessHours(publishedDate: string | null): number {
  if (!publishedDate) return 0;

  const now = new Date();
  const published = new Date(publishedDate);
  return (now.getTime() - published.getTime()) / (1000 * 60 * 60);
}

/**
 * Compute deduplication hash for a document.
 * Hash is based on normalized URL + title to identify duplicates
 */
export function computeDedupHash(sourceUrl: string | null, title: string): string {
  const normalizedUrl = sourceUrl
    ? sourceUrl.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .split('?')[0]
        .split('#')[0]
    : '';
  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
  const combined = `${normalizedUrl}|||${normalizedTitle}`;
  const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').substring(0, 16);
  return `dedup_${hash}`;
}

/**
 * Find existing document by dedup hash
 */
export async function findDuplicateByHash(db: any, dedupHash: string): Promise<any | null> {
  return await db.get(
    `SELECT id, title, source_url, collected_date, collection_count FROM documents WHERE dedup_hash = ? LIMIT 1`,
    [dedupHash]
  );
}

/**
 * Update document when it's collected again (increment count, update last_collected_at)
 */
export async function updateOnRecollect(db: any, documentId: string): Promise<void> {
  await db.run(
    `UPDATE documents SET
      collection_count = collection_count + 1,
      last_collected_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [documentId]
  );
}
