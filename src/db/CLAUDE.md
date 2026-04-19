# TechPlan Database Layer

## Neo4j Client (`neo4j.ts`)

Multi-backend graph database client with fallback support.

## Architecture

```
Neo4jClient
├── Primary:   Neo4j Driver (real graph database)
├── Fallback:  JSON file storage (data/graph-data.json)
└── Mock:      In-memory Map storage (development)
```

## Storage Backends

### 1. Neo4j Mode (Production)

Connects to running Neo4j instance:

```typescript
const client = new Neo4jClient({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password'
});
await client.connect();
```

### 2. JSON File Mode (Fallback)

Stores data as JSON in `data/graph-data.json`:

```typescript
const client = new Neo4jClient({
  jsonStoragePath: './data/graph-data.json'
});
await client.connect();  // Falls back to JSON if Neo4j unavailable
```

### 3. Mock Mode (Development)

In-memory storage, no persistence:

```typescript
const client = new Neo4jClient({
  enableMockMode: true
});
await client.connect();
```

## Node Operations

### Create Node

```typescript
const node = await client.createNode('Organization', {
  name: 'Anthropic',
  type: 'company',
  confidence: 1.0
});
// Returns: { id, label, properties, createdAt, updatedAt }
```

### Batch Create

```typescript
const nodes = await client.createNodes([
  { label: 'Organization', properties: { name: 'OpenAI' } },
  { label: 'Technology', properties: { name: 'GPT-4' } }
]);
```

### Get Node

```typescript
const node = await client.getNode(id);
// Returns GraphNode or null
```

### Update Node

```typescript
const updated = await client.updateNode(id, {
  name: 'New Name',
  confidence: 0.95
});
```

### Delete Node

```typescript
await client.deleteNode(id);
// Returns true if deleted
```

## Relationship Operations

### Create Relationship

```typescript
const rel = await client.createRelationship(
  'org-id',      // from
  'tech-id',     // to
  'DEVELOPS',     // type
  { since: '2020' }
);
```

### Get Relationship

```typescript
const rel = await client.getRelationship(id);
```

### Delete Relationship

```typescript
await client.deleteRelationship(id);
```

## Graph Queries

### Get Topic Subgraph (BFS)

```typescript
const subgraph = await client.getTopicGraph(topicId, depth = 2);
// Returns: { nodes: GraphNode[], relationships: GraphRelationship[] }
```

BFS traversal from start node to specified depth.

### Find Related Entities

```typescript
const entities = await client.findRelatedEntities(entityId, depth = 2);
// Returns only Entity type nodes
```

### Find Claims by Topic

```typescript
const claims = await client.findClaimsByTopic(topicId);
// Traverses HAS_CLAIM relationships
```

### Get Entity Neighborhood

```typescript
const neighborhood = await client.getEntityNeighborhood(entityId);
// Returns: { entity: GraphNode, neighbors: [{ node, relationship }] }
```

### Find Path

```typescript
const path = await client.findPath(fromId, toId, maxDepth = 4);
// Returns array of nodes forming the path
```

## Sync Status

```typescript
const status = await client.getSyncStatus();
// Returns: {
//   lastSyncAt: string,
//   nodeCount: number,
//   relationshipCount: number,
//   pendingUpdates: number
// }
```

## Singleton Pattern

```typescript
// Get existing instance or create new one
const client = await getNeo4jClient(config);

// Close and clear instance
await closeNeo4jClient();
```

## Type Definitions

### Node Labels

```typescript
type NodeLabel =
  | 'Topic'
  | 'Entity'
  | 'Event'
  | 'Claim'
  | 'Document'
  | 'Person'
  | 'Organization';
```

### Relationship Types

```typescript
type RelationType =
  | 'HAS_ENTITY'
  | 'HAS_CLAIM'
  | 'HAS_EVENT'
  | 'DEVELOPS'
  | 'COMPETES_WITH'
  | 'PUBLISHED_BY'
  | 'USES'
  | 'INVESTS_IN'
  | 'PARTNERS_WITH';
```

### Graph Structures

```typescript
interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface GraphRelationship {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  properties: Record<string, any>;
  createdAt: string;
}

interface GraphSubgraph {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

interface EntityNeighborhood {
  entity: GraphNode;
  neighbors: Array<{
    node: GraphNode;
    relationship: GraphRelationship;
  }>;
}
```

## Configuration

```typescript
interface GraphDbConfig {
  // Neo4j connection
  uri?: string;
  username?: string;
  password?: string;

  // Fallback storage
  jsonStoragePath?: string;
  enableMockMode?: boolean;

  // Retry settings
  maxRetries?: number;
  retryDelay?: number;

  // Enable/disable Neo4j
  enableNeo4j?: boolean;
}
```

## Usage Example

```typescript
import { getNeo4jClient } from './db/neo4j';

// Initialize
const client = await getNeo4jClient({
  uri: process.env.NEO4J_URI,
  username: process.env.NEO4J_USERNAME,
  password: process.env.NEO4J_PASSWORD
});

// Create nodes
const anthropic = await client.createNode('Organization', { name: 'Anthropic' });
const claude = await client.createNode('Technology', { name: 'Claude' });

// Create relationship
await client.createRelationship(anthropic.id, claude.id, 'DEVELOPS');

// Query subgraph
const graph = await client.getTopicGraph(topicId, 2);

// Cleanup
await closeNeo4jClient();
```
