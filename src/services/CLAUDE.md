# TechPlan Services

## API Services

Service modules for backend communication.

## Service Files

### topicService.ts

Topic operations:

```typescript
fetchTopics(): Promise<Topic[]>
```

### graphService.ts

Graph database operations:

```typescript
getTopicGraph(topicId: string, depth?: number): Promise<GraphSubgraph>
findRelatedEntities(entityId: string, depth?: number): Promise<GraphNode[]>
findClaimsByTopic(topicId: string): Promise<GraphNode[]>
getEntityNeighborhood(entityId: string): Promise<EntityNeighborhood>
findPath(fromId: string, toId: string, maxDepth?: number): Promise<GraphNode[]>
getSyncStatus(): Promise<SyncStatus>
save(): Promise<void>
```

### reportService.ts

Report generation:

```typescript
generateReport(request: ReportGenerationRequest): Promise<Report>
getReports(topicId?: string): Promise<Report[]>
getReport(id: string): Promise<Report>
deleteReport(id: string): Promise<void>
publishReport(id: string): Promise<Report>
```

### reportGraphService.ts

Report-to-graph integration:

```typescript
linkReportToGraph(reportId: string): Promise<void>
extractEntityReferences(content: string): Promise<string[]>
updateGraphFromReport(reportId: string): Promise<void>
```

### fileUploadService.ts

File upload handling:

```typescript
uploadFile(file: File, topicId: string): Promise<UploadResult>
uploadAndAnalyze(file: File, topicId: string): Promise<UploadResult>
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
