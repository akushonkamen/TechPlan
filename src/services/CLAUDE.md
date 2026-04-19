# TechPlan Services

## API Services

Service modules for backend communication.

## Service Files

### topicService.ts

Topic operations:

```typescript
fetchTopics(): Promise<Topic[]>
```

### reportService.ts

Report migration helpers:

```typescript
migrateReportTables(db: Database): Promise<void>
```

### fileUploadService.ts

File upload handling:

```typescript
processUploadedFile(file: Express.Multer.File, uploadsDir: string): Promise<UploadResult>
```

## API Base URL

```typescript
const API_BASE = process.env.API_BASE_URL || '/api';
```

## Error Handling Pattern

```typescript
export async function fetchTopics(): Promise<Topic[]> {
  const response = await fetch(`${API_BASE}/topics`);
  if (!response.ok) {
    throw new Error('Failed to fetch topics');
  }
  return response.json();
}
```

## Type Re-exports

Services re-export types from `types.ts`:

```typescript
export type { DbDocument, CreateDocumentInput } from '../types';
```

## Usage Example

```typescript
import { fetchTopics } from '../services/topicService';

// Fetch all topics
const topics = await fetchTopics();
```
