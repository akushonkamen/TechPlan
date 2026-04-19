/**
 * Source Tracking and Deduplication Utilities
 *
 * Provides functions for:
 * - Content fingerprinting using crypto.createHash
 * - Domain extraction for rate limiting
 * - Source registration and tracking
 * - Time period document queries
 */

import * as crypto from 'crypto';
import type { Database } from 'sqlite';

export interface SourceRecord {
  id: string;
  url: string;
  domain: string;
  title: string;
  first_seen: string;
  last_collected: string;
  fingerprint: string;
  content_hash: string | null;
  collect_count: number;
  last_checked: string;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  resetAt: string;
}

export interface TimePeriod {
  start: string;
  end: string;
  presetType?: string;
}

/**
 * Generate content fingerprint using crypto.createHash
 * Creates a SHA-256 hash of normalized content for deduplication
 * @param content - The content to fingerprint (title, url, or full content)
 * @returns Hex string hash
 */
export function generateFingerprint(content: string): string {
  const normalized = content
    .toLowerCase()
    .trim()
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove common tracking parameters
    .replace(/[?&](utm_[^&]*|ref=[^&]*|source=[^&]*|fbclid=[^&]*|gclid=[^&]*)/gi, '')
    // Remove trailing slashes
    .replace(/\/+$/, '');

  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Extract domain from URL for rate limiting and grouping
 * @param url - The URL to extract domain from
 * @returns Domain name or null
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Register or update a source in the sources table
 * @param db - Database instance
 * @param url - Source URL
 * @param title - Source title
 * @param content - Optional content for content hashing
 * @returns Source record
 */
export async function registerSource(
  db: Database,
  url: string,
  title: string,
  content?: string
): Promise<SourceRecord> {
  const domain = extractDomain(url);
  if (!domain) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const fingerprint = generateFingerprint(`${url}|||${title}`);
  const contentHash = content ? generateFingerprint(content) : null;
  const now = new Date().toISOString();

  // Check if source already exists
  const existing = await db.get(
    `SELECT * FROM sources WHERE url = ? LIMIT 1`,
    [url]
  ) as SourceRecord | undefined;

  if (existing) {
    // Update existing source
    await db.run(
      `UPDATE sources SET
        title = ?,
        last_collected = ?,
        content_hash = COALESCE(?, content_hash),
        collect_count = collect_count + 1,
        last_checked = ?
       WHERE id = ?`,
      [title, now, contentHash, now, existing.id]
    );
    return {
      ...existing,
      title,
      last_collected: now,
      content_hash: contentHash ?? existing.content_hash,
      collect_count: existing.collect_count + 1
    };
  }

  // Insert new source
  const id = `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.run(
    `INSERT INTO sources (id, url, domain, title, first_seen, last_collected, fingerprint, content_hash, collect_count, last_checked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, url, domain, title, now, now, fingerprint, contentHash, 1, now]
  );

  return {
    id,
    url,
    domain,
    title,
    first_seen: now,
    last_collected: now,
    fingerprint,
    content_hash: contentHash,
    collect_count: 1,
    last_checked: now
  };
}

/**
 * Check domain-based rate limiting
 * @param db - Database instance
 * @param domain - Domain to check
 * @param maxCollectionsPerHour - Maximum collections allowed per hour
 * @returns Object with allowed flag and count
 */
export async function checkDomainRateLimit(
  db: Database,
  domain: string,
  maxCollectionsPerHour: number = 10
): Promise<RateLimitResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const result = await db.get(
    `SELECT COUNT(*) as count FROM sources
     WHERE domain = ? AND last_collected > ?`,
    [domain, oneHourAgo]
  ) as { count: number } | undefined;

  const count = result?.count || 0;
  const allowed = count < maxCollectionsPerHour;
  const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return { allowed, count, resetAt };
}

/**
 * Find duplicate sources by fingerprint
 * @param db - Database instance
 * @param fingerprint - Content fingerprint to search for
 * @returns Array of matching sources
 */
export async function findDuplicateSources(
  db: Database,
  fingerprint: string
): Promise<SourceRecord[]> {
  return await db.all(
    `SELECT * FROM sources WHERE fingerprint = ? ORDER BY first_seen DESC`,
    [fingerprint]
  ) as SourceRecord[];
}

/**
 * Create a report time period entry
 * @param db - Database instance
 * @param reportId - Report ID
 * @param periodStart - Period start date
 * @param periodEnd - Period end date
 * @param presetType - Preset type (24h, 7d, 30d, custom, etc.)
 * @param documentsCount - Number of documents in period
 * @param sourcesCount - Number of unique sources
 */
export async function createReportTimePeriod(
  db: Database,
  reportId: string,
  periodStart: string,
  periodEnd: string,
  presetType: string | null = null,
  documentsCount: number = 0,
  sourcesCount: number = 0
): Promise<void> {
  const id = `rtp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.run(
    `INSERT INTO report_time_periods (id, report_id, period_start, period_end, preset_type, documents_count, sources_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, reportId, periodStart, periodEnd, presetType, documentsCount, sourcesCount]
  );
}

/**
 * Get documents within a time period
 * @param db - Database instance
 * @param periodStart - Period start date
 * @param periodEnd - Period end date
 * @param topicId - Optional topic filter
 * @returns Array of documents
 */
export async function getDocumentsInPeriod(
  db: Database,
  periodStart: string,
  periodEnd: string,
  topicId?: string
): Promise<any[]> {
  let query = `
    SELECT * FROM documents
    WHERE published_date >= ? AND published_date <= ?
  `;
  const params: any[] = [periodStart, periodEnd];

  if (topicId) {
    query += ` AND topic_id = ?`;
    params.push(topicId);
  }

  query += ` ORDER BY published_date DESC`;

  return await db.all(query, params);
}

/**
 * Check if a URL has already been collected
 * @param db - Database instance
 * @param url - URL to check
 * @returns Existing source record or null
 */
export async function findSourceByUrl(
  db: Database,
  url: string
): Promise<SourceRecord | null> {
  return await db.get(
    `SELECT * FROM sources WHERE url = ? LIMIT 1`,
    [url]
  ) as SourceRecord | null;
}

/**
 * Get sources by domain with collection statistics
 * @param db - Database instance
 * @param domain - Domain to filter by
 * @returns Array of sources for the domain
 */
export async function getSourcesByDomain(
  db: Database,
  domain: string
): Promise<SourceRecord[]> {
  return await db.all(
    `SELECT * FROM sources WHERE domain = ? ORDER BY last_collected DESC`,
    [domain]
  ) as SourceRecord[];
}

/**
 * Compute deduplication hash for a document (uses generateFingerprint)
 * Hash is based on normalized URL + title to identify duplicates
 * @param sourceUrl - Source URL
 * @param title - Document title
 * @returns Deduplication hash
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
  // Use crypto.createHash for better fingerprinting
  const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').substring(0, 16);
  return `dedup_${hash}`;
}
