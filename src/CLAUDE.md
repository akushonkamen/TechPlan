# TechPlan Source Code

## Project Overview

TechPlan is a technology intelligence platform for tracking, analyzing, and reporting on technical topics. It combines automated data collection, knowledge extraction, and AI-powered report generation.

## Architecture

```
TechPlan/
├── server.ts              # Express backend server
├── src/
│   ├── App.tsx           # React app entry point
│   ├── main.tsx          # React render root
│   ├── components/       # UI components
│   ├── pages/           # Route pages
│   ├── services/        # API services
│   ├── hooks/           # React hooks
│   ├── db/              # Database layer
│   ├── lib/             # Utilities
│   ├── utils/           # Helper functions
│   ├── types.ts         # TypeScript definitions
│   ├── types/           # Type modules
│   ├── skillExecutor.ts  # Claude CLI execution
│   ├── skillRegistry.ts  # Skill management
│   ├── scheduler.ts      # Report scheduler
│   └── websocket.ts      # Real-time updates
└── .claude/skills/       # Markdown skill definitions
```

## Key Reusable LLM Tool Patterns

### 1. Stream-JSON Output Parsing (skillExecutor.ts)

TechPlan spawns the Claude CLI with `--output-format stream-json` to get structured, real-time progress:

```typescript
const claudeCmd = `claude -p ${shellEscape(config.prompt)} --output-format stream-json --verbose --dangerously-skip-permissions`;
const proc = spawn('script', ['-q', '-c', claudeCmd, '/dev/null'], { ... });

// Parse stream-json lines for structured progress
for await (const line of readLine(proc.stdout)) {
  const data = JSON.parse(line);
  if (data.type === 'tool_use') {
    // Track which tool Claude is using
  } else if (data.type === 'tool_result') {
    // Capture tool output
  }
}
```

**Why this matters**: Enables granular progress tracking during long-running AI tasks without waiting for completion.

### 2. Markdown-Based Skill Registry (skillRegistry.ts)

Skills are defined as markdown files with YAML frontmatter:

```markdown
---
version: "1.0.0"
display_name: "情报采集"
category: research
timeout: 1200
params:
  - name: topicName
    type: string
    required: true
steps:
  - "广域扫描"
  - "深度追踪"
---

# Prompt content goes here...
```

The registry:
1. Loads all `.md` files from `.claude/skills/`
2. Parses YAML frontmatter for metadata
3. Renders prompts by replacing `{{param}}` placeholders
4. Caches skills for performance

### 3. Three-Phase Pipeline Pattern (Topics.tsx)

The collect button triggers a chained pipeline:

```typescript
// Phase 1: Research
await fetch('/api/skill/research', { body: JSON.stringify({ topicId, topicName, keywords }) });

// Phase 2: Extract (only after research completes)
await fetch('/api/skill/extract', { body: JSON.stringify({ topicId, extractTypes }) });

// Phase 3: Sync Graph (only after extract completes)
await fetch('/api/skill/sync-graph', { body: JSON.stringify({ topicId }) });
```

Each phase polls for completion before starting the next.

### 4. WebSocket Progress Broadcasting (websocket.ts)

```typescript
// Client subscribes to an execution
ws.send(JSON.stringify({ type: 'subscribe', executionId }));

// Server broadcasts progress to subscribers
send(executionId, 'progress', 'Collecting documents...');
```

### 5. Bash Tool for Database Operations (skills)

Skills use sqlite3 CLI directly:

```bash
sqlite3 -json database.sqlite "SELECT * FROM documents WHERE topic_id = '{{topicId}}';"
```

This allows LLMs to interact with databases without custom code.

## Database Schema

### SQLite Tables
- **topics**: Technical tracking topics
- **documents**: Collected documents
- **entities**: Extracted entities (organizations, technologies, people)
- **relations**: Entity relationships
- **claims**: Extracted claims/statements
- **events**: Timeline events
- **reports**: Generated reports

### Neo4j Graph (optional)
- Nodes: Topic, Entity, Event, Claim, Document, Person, Organization
- Relationships: DEVELOPS, COMPETES_WITH, PUBLISHED_BY, USES, INVESTS_IN

## Skill Categories

| Category | Skills | Description |
|----------|--------|-------------|
| research | research | Multi-source document collection |
| extraction | extract | Entity/relation/claim/event extraction |
| sync | sync-graph | SQLite to Neo4j synchronization |
| reporting | report-* | Daily/weekly/monthly/quarterly reports |
| analysis | optimize | Topic optimization suggestions |

## API Routes

### Skills
- `POST /api/skill/{name}` - Execute a skill
- `GET /api/skill/{executionId}/status` - Poll execution status
- `POST /api/skill/{executionId}/cancel` - Cancel execution

### Topics
- `GET /api/topics` - List all topics
- `POST /api/topics` - Create topic
- `PUT /api/topics/:id` - Update topic
- `DELETE /api/topics/:id` - Delete topic

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `DELETE /api/documents/:id` - Delete document
- `POST /api/upload` - Upload file

### Reports
- `GET /api/reports` - List reports
- `POST /api/reports` - Generate report
- `GET /api/reports/:id` - Get report

## Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Dashboard | Overview with stats and charts |
| `/topics` | Topics | Topic management and collection |
| `/graph` | KnowledgeGraph | Visual knowledge graph |
| `/reports` | Reports | Generated report list |
| `/review` | ReviewConsole | Review pending items |
| `/decision` | DecisionSupport | Decision analysis |
| `/settings` | Settings | Configuration |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `ADMIN_TOKEN` | - | Admin authentication token |
| `MAX_UPLOAD_SIZE_MB` | 10 | File upload limit |
| `NEO4J_URI` | - | Neo4j connection URI |
| `NEO4J_USERNAME` | - | Neo4j username |
| `NEO4J_PASSWORD` | - | Neo4j password |

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Express, SQLite, better-sqlite3
- **Graph**: Neo4j (optional, JSON file fallback)
- **AI**: Claude CLI with stream-json output
- **Real-time**: WebSocket (ws)
