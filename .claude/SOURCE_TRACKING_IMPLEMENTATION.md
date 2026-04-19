# Source Tracking and Deduplication Schema - Implementation Summary

## Overview
This document describes the implementation of source tracking and deduplication features added to TechPlan for report generation with built-in collection.

## Database Schema Changes

### 1. `sources` Table
Tracks unique sources with URLs, domains, fingerprints for deduplication and rate limiting.

```sql
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  title TEXT,
  first_seen TEXT NOT NULL,
  last_collected TEXT,
  fingerprint TEXT NOT NULL,
  content_hash TEXT,
  collect_count INTEGER DEFAULT 1,
  last_checked TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `idx_sources_url` - Fast URL lookups
- `idx_sources_domain` - Domain-based queries and rate limiting
- `idx_sources_fingerprint` - Content-based deduplication
- `idx_sources_last_collected` - Time-based collection tracking

### 2. `report_time_periods` Table
Links reports to their declared time periods for time-bound document filtering.

```sql
CREATE TABLE IF NOT EXISTS report_time_periods (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  preset_type TEXT,  -- '24h', '7d', '30d', 'custom', etc.
  documents_count INTEGER DEFAULT 0,
  sources_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_report_time_periods_report_id` - Report lookups
- `idx_report_time_periods_period_start` - Time-range queries
- `idx_report_time_periods_period_end` - Time-range queries

### 3. Existing `documents` Table
Already has `published_date` with index `idx_documents_published_date` for efficient time-period filtering.

## Deduplication Strategy

### Content Fingerprint Function
Uses SHA-256 hashing via `crypto.createHash` for reliable deduplication:

```typescript
function generateFingerprint(content: string): string {
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[?&](utm_[^&]*|ref=[^&]*|source=[^&]*|fbclid=[^&]*|gclid=[^&]*)/gi, '')
    .replace(/\/+$/, '');

  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
```

**Features:**
- Normalizes whitespace, case, and tracking parameters
- Consistent SHA-256 hashes for identical content
- Handles URL normalization for web sources

### URL-Based Deduplication
```typescript
function computeDedupHash(sourceUrl: string | null, title: string): string {
  // Normalizes URL (removes protocol, www, query params, fragments)
  // Combines with normalized title
  // Returns SHA-256 based hash
}
```

### Domain-Based Rate Limiting
```typescript
async function checkDomainRateLimit(
  domain: string,
  maxCollectionsPerHour: number = 10
): Promise<{ allowed: boolean; count: number; resetAt: string }>
```

Precludes overwhelming any single source domain during collection.

## Helper Functions

### Source Registration
```typescript
async function registerSource(
  db: Database,
  url: string,
  title: string,
  content?: string
): Promise<SourceRecord>
```
- Creates or updates source record
- Tracks collection count and timestamps
- Computes fingerprints for deduplication

### Duplicate Detection
```typescript
async function findDuplicateSources(
  db: Database,
  fingerprint: string
): Promise<SourceRecord[]>
```
Finds existing sources with identical content fingerprints.

### Time Period Queries
```typescript
async function getDocumentsInPeriod(
  db: Database,
  periodStart: string,
  periodEnd: string,
  topicId?: string
): Promise<any[]>
```
Retrieves documents whose `published_date` falls within the specified range.

### Report Time Period Creation
```typescript
async function createReportTimePeriod(
  db: Database,
  reportId: string,
  periodStart: string,
  periodEnd: string,
  presetType: string | null = null,
  documentsCount: number = 0,
  sourcesCount: number = 0
): Promise<void>
```
Links a report to its declared time period.

## Module Organization

### Core Implementation
- **server.ts**: Database schema, in-memory helper functions
- **src/utils/sourceTracking.ts**: Reusable utilities module (exported)

### Test Coverage
- **src/utils/sourceTracking.test.ts**: Vitest unit tests

## Usage Example

```typescript
import {
  generateFingerprint,
  registerSource,
  checkDomainRateLimit,
  getDocumentsInPeriod
} from './src/utils/sourceTracking';

// Check rate limit before collecting
const rateLimit = await checkDomainRateLimit(db, 'example.com', 10);
if (!rateLimit.allowed) {
  console.log(`Rate limited until ${rateLimit.resetAt}`);
  return;
}

// Register source (updates if exists)
const source = await registerSource(db, url, title, content);

// Query documents for report time period
const docs = await getDocumentsInPeriod(db, '2025-01-01', '2025-01-31', topicId);
```

## Integration Points

1. **Report Generation**: `handleReportResult()` should call `createReportTimePeriod()`
2. **Document Collection**: Research skills should call `registerSource()` and `checkDomainRateLimit()`
3. **Time-Period Filtering**: Report skills should use `getDocumentsInPeriod()` to fetch relevant documents

## Next Steps

1. Integrate `registerSource()` into document collection endpoint
2. Add rate limiting check to collection workflow
3. Update `handleReportResult()` to create time period entries
4. Add API endpoints for source management (`GET /api/sources`, `GET /api/sources/:domain`)
