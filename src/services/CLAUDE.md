# TechPlan Services

## API Services

Service modules for backend communication.

## Service Files

### topicService.ts

Topic CRUD operations:

```typescript
fetchTopics(): Promise<Topic[]>
fetchTopic(id: string): Promise<Topic>
createTopic(topic: Omit<Topic, 'id'>): Promise<Topic>
updateTopic(id: string, topic: Partial<Topic>): Promise<Topic>
deleteTopic(id: string): Promise<void>
```

### documentService.ts

Document management:

```typescript
fetchAllDocuments(topicId?: string): Promise<DbDocument[]>
fetchDocument(id: string): Promise<DbDocument>
createDocument(input: CreateDocumentInput): Promise<DbDocument>
deleteDocument(id: string): Promise<void>
saveFetchedDocuments(docs: FetchedDoc[], topicId?: string): Promise<DbDocument[]>
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

### graphApi.ts

Graph visualization API:

```typescript
getGraphData(topicId: string): Promise<GraphData>
getEntityDetails(entityId: string): Promise<EntityDetail>
getPath(fromId: string, toId: string): Promise<PathResult>
```

### reportGraphService.ts

Report-to-graph integration:

```typescript
linkReportToGraph(reportId: string): Promise<void>
extractEntityReferences(content: string): Promise<string[]>
updateGraphFromReport(reportId: string): Promise<void>
```

### reportReviewService.ts

Report review workflow:

```typescript
submitReview(review: ReportReview): Promise<void>
getReviews(reportId: string): Promise<ReportReview[]>
updateReviewStatus(id: string, status: string): Promise<void>
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
import { fetchTopics, createTopic } from '../services/topicService';

// Fetch all topics
const topics = await fetchTopics();

// Create new topic
const newTopic = await createTopic({
  name: 'AI Agents',
  description: 'Tracking AI agent technologies',
  keywords: ['agents', 'llm', 'autonomy'],
  organizations: ['OpenAI', 'Anthropic'],
  priority: 'high',
  schedule: 'weekly',
  // ... other fields
});
```
