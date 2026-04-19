# TechPlan Database Layer

## Kuzu Client (`kuzu.ts`)

The graph layer uses Kuzu as a local graph cache. SQLite remains the source of truth for topics, documents, entities, relations, claims, and events.

## Runtime Behavior

- `getKuzuConnection()` opens `database.kuzu` in the project root and initializes the graph schema.
- `kuzuQuery(cypher, params?)` runs Cypher queries through the shared connection.
- `closeKuzu()` releases the local connection during server shutdown.
- When a topic graph is missing from Kuzu, the server triggers `/api/graph/sync/:topicId` in the background and immediately falls back to SQLite results.

## Schema Ownership

Node tables:

- `Topic`
- `Entity`
- `Event`
- `Claim`

Relationship tables:

- `HAS_ENTITY`, `HAS_EVENT`, `HAS_CLAIM`, `PARTICIPATED_IN`
- `DEVELOPS`, `COMPETES_WITH`, `USES`, `INVESTS_IN`, `PARTNERS_WITH`, `PUBLISHED_BY`
- `SUPPORTS`, `CONTRADICTS`, `MENTIONS`, `RELATED_TO`
- `COMPRESSES`, `EXTENDS`, `MODIFIES`, `IMPROVES`, `EVOLVES_FROM`, `BENCHMARKS`

When adding graph concepts, update these places together:

- `src/db/kuzu.ts`
- `server.ts` graph sync and query routes
- `src/types/graph.ts`
- `src/components/GraphVisualization.tsx`
