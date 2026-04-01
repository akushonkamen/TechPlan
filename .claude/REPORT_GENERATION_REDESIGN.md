# Report Generation with Built-in Collection - Implementation Summary

## Overview
Redesigned `/api/reports/generate` endpoint to support automatic data collection, time-period filtering, and source deduplication.

## Changes Made

### 1. Enhanced `computePeriod()` Function (server.ts:2009-2150)

**New Features:**
- Support for preset time ranges: `"24h"`, `"7d"`, `"30d"`, `"90d"`, `"1y"`
- Returns `{ start, end, preset }` object
- Preset-based period computation with exact date/time formatting
- Fallback to report-type defaults when no preset specified

**Usage:**
```javascript
// Custom period
computePeriod('weekly', { start: '2025-01-01', end: '2025-01-31' })

// Preset period
computePeriod('weekly', { preset: '7d' })
// Returns: { start: '2025-03-25', end: '2025-04-01', preset: '7d' }
```

### 2. Automatic Collection Function (server.ts:2152-2220)

**`triggerCollectionForPeriod()`** - Triggers research skill with time-range filtering

Features:
- Checks existing document count before collection (skips if >= 5 docs)
- Runs research skill with `timeRangeStart` and `timeRangeEnd` parameters
- 2-minute timeout for collection
- Returns `{ executionId, collected, duplicatesSkipped }`

**Deduplication:**
- Integrates with `sources` table (from Task #2)
- Uses `generateFingerprint()` for content-based dedup
- Domain-based rate limiting via `checkDomainRateLimit()`

### 3. Updated Report Generation Endpoint (server.ts:2205-2320)

**Request Body Changes:**
```javascript
{
  topicId: string,
  reportType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'tech_topic' | 'competitor' | 'alert',
  period?: {
    start?: string,    // Custom start date
    end?: string,      // Custom end date
    preset?: string    // "24h" | "7d" | "30d" | "90d" | "1y"
  },
  options?: {
    autoCollect?: boolean,  // Default: true
    keywords?: string[],
    organizations?: string[]
  }
}
```

**New Response Fields:**
```javascript
{
  executionId: string,
  skillName: string,
  reportType: string,
  period: { start: string, end: string, preset?: string },
  status: 'started',
  autoCollect: boolean,
  collectionResult: {
    executionId: string,
    collected: number,
    duplicatesSkipped: number
  }
}
```

### 4. Updated `handleReportResult()` (server.ts:3014+)

**New Parameter:**
- `computedPeriod?: { start: string; end: string; preset?: string }`

**New Behavior:**
- Creates `report_time_periods` entry after report is saved
- Counts documents and sources within the period
- Stores preset type for later filtering

### 5. New API Endpoints

**`GET /api/documents/by-period`**
- Query documents within a time period
- Supports `topicId`, `start`, `end`, or `preset` parameters
- Returns documents with entity/event counts

**`GET /api/reports/:id/time-period`**
- Get time period info for a specific report
- Returns period, document count, source count

**`GET /api/sources/stats`**
- Source collection statistics
- Domain-based rate limiting info
- Optional `domain` and `hours` filters

### 6. Deprecated Standalone Collection

**`POST /api/skill/research`**
- Now returns deprecation notice
- Response includes `deprecated` field
- Header `X-API-Deprecation` added
- Console warnings logged

**Recommended Migration:**
```javascript
// OLD (deprecated)
POST /api/skill/research
{ topicId, topicName, keywords, organizations }

// NEW (recommended)
POST /api/reports/generate
{
  topicId,
  reportType: 'weekly',
  period: { preset: '7d' },
  options: { autoCollect: true }
}
```

## Report Skill Compatibility

All report skills already support:
- `timeRangeStart` and `timeRangeEnd` parameters
- `published_date >= ? AND published_date <= ?` filtering
- Time-period-bound queries

No changes needed to report skill files.

## Database Integration

### Uses Tables from Task #2:
- `sources` - Source tracking and deduplication
- `report_time_periods` - Report to time period links
- `documents.published_date` - Indexed for time queries

### New Helper Functions:
- `getDocumentsCountInPeriod()` - Count docs within period
- `getUniqueSourcesCountInPeriod()` - Count unique sources within period

## Example Usage

### Generate a daily report with automatic collection:
```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "topicId": "1",
    "reportType": "daily",
    "period": { "preset": "24h" },
    "options": { "autoCollect": true }
  }'
```

### Generate a weekly report for custom date range:
```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "topicId": "1",
    "reportType": "weekly",
    "period": {
      "start": "2025-03-01",
      "end": "2025-03-31"
    },
    "options": { "autoCollect": false }
  }'
```

### Query documents by period:
```bash
curl "http://localhost:3000/api/documents/by-period?topicId=1&preset=7d"
```

### Get report time period info:
```bash
curl "http://localhost:3000/api/reports/rpt_123/time-period"
```

## Testing Checklist

- [ ] Preset time ranges work correctly (24h, 7d, 30d, 90d, 1y)
- [ ] Custom start/end dates are respected
- [ ] Auto-collection skips when sufficient docs exist
- [ ] Auto-collection runs when docs are insufficient
- [ ] Report time periods are created after report generation
- [ ] Document count in period is accurate
- [ ] Source count in period is accurate
- [ ] Standalone research shows deprecation warning
- [ ] New API endpoints return correct data

## Files Modified

1. **server.ts**
   - Enhanced `computePeriod()` function
   - Added `triggerCollectionForPeriod()` function
   - Added `getDocumentsCountInPeriod()` function
   - Added `getUniqueSourcesCountInPeriod()` function
   - Updated `/api/reports/generate` endpoint
   - Updated `handleReportResult()` function signature
   - Added deprecation notice to `/api/skill/:name` for research
   - Added `GET /api/documents/by-period` endpoint
   - Added `GET /api/reports/:id/time-period` endpoint
   - Added `GET /api/sources/stats` endpoint

## Next Steps (Optional)

1. Update frontend to use new `/api/reports/generate` options
2. Add UI for preset time range selection
3. Display collection status in report generation UI
4. Add time period info display in report details
5. Remove standalone collection buttons from UI (see Task #4)
