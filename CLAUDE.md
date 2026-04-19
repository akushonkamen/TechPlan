# TechPlan - Technology Intelligence Platform

## Overview

TechPlan is a full-stack technology intelligence platform that tracks technical topics, collects documents, extracts knowledge, and generates AI-powered reports.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Backend** | Express, Node.js |
| **Database** | SQLite (primary), Neo4j (optional graph DB) |
| **AI** | Claude CLI with stream-json output |
| **Real-time** | WebSocket (ws) |
| **Charts** | Recharts |
| **Graph** | ReactFlow |

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Production server
npm start
```

## Project Structure

```
TechPlan/
├── server.ts              # Express backend with skill execution
├── database.sqlite        # SQLite database (created at runtime)
├── src/                   # Frontend source
│   ├── App.tsx           # React app entry
│   ├── main.tsx          # React render root
│   ├── components/       # UI components
│   ├── pages/           # Route pages
│   ├── services/        # API client functions
│   ├── hooks/           # Custom React hooks
│   ├── db/              # Database client (Neo4j)
│   ├── skillExecutor.ts  # Claude CLI execution engine
│   ├── skillRegistry.ts  # Skill loader from markdown
│   ├── scheduler.ts      # Report scheduling
│   └── types.ts         # TypeScript definitions
├── .claude/
│   └── skills/          # Markdown skill definitions
│       ├── research.md   # Document collection
│       ├── extract.md    # Knowledge extraction
│       ├── sync-graph.md # Graph sync
│       └── report-*.md   # Report generation
└── public/               # Static assets
```

## Key LLM Tool Usage Patterns (Reusable)

### 1. Stream-JSON Output Parsing

**File**: `src/skillExecutor.ts`

TechPlan spawns Claude CLI with `--output-format stream-json` to get structured progress:

```typescript
const claudeCmd = `claude -p ${shellEscape(config.prompt)} --output-format stream-json --verbose`;

// Parse stream-json lines
for await (const line of readLine(proc.stdout)) {
  const data = JSON.parse(line);
  if (data.type === 'tool_use') {
    // Track tool usage
  } else if (data.type === 'tool_result') {
    // Capture results
  }
}
```

**Benefits**:
- Real-time progress tracking
- Tool execution visibility
- Structured output parsing

### 2. Markdown-Based Skill Registry

**File**: `src/skillRegistry.ts`

Skills are markdown files with YAML frontmatter:

```markdown
---
version: "1.0.0"
display_name: "情报采集"
category: research
timeout: 1200
params:
  - name: topicId
    type: string
    required: true
---

# Prompt with {{paramName}} placeholders
```

**Benefits**:
- Skills are version-controllable markdown files
- Easy to create and modify skills
- Frontmatter provides structured metadata
- Template rendering for parameters

### 3. Three-Phase Pipeline Pattern

**File**: `src/pages/Topics.tsx`

Automatic skill chaining:

```typescript
// Phase 1: Research
await execute('research', { topicId, keywords });

// Phase 2: Extract (auto-triggered)
await execute('extract', { topicId });

// Phase 3: Sync Graph (auto-triggered)
await execute('sync-graph', { topicId });
```

### 4. WebSocket Progress Broadcasting

**File**: `src/websocket.ts`

```typescript
// Client subscribes
ws.send(JSON.stringify({ type: 'subscribe', executionId }));

// Server broadcasts
wss.clients.forEach(client => {
  if (client.executionId === executionId) {
    client.ws.send(JSON.stringify({ type: 'progress', data }));
  }
});
```

### 5. Bash Tool for Database Operations

**File**: `.claude/skills/*.md`

LLMs interact with SQLite via CLI:

```bash
sqlite3 -json database.sqlite "SELECT * FROM documents WHERE topic_id = '{{topicId}}';"
```

No custom API needed - LLMs can query directly.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `ADMIN_TOKEN` | - | Admin authentication |
| `MAX_UPLOAD_SIZE_MB` | 10 | File upload limit |
| `NEO4J_URI` | - | Neo4j connection (optional) |
| `NEO4J_USERNAME` | - | Neo4j auth |
| `NEO4J_PASSWORD` | - | Neo4j auth |

## Database Schema

### SQLite Tables

| Table | Purpose |
|-------|---------|
| `topics` | Technical tracking topics |
| `documents` | Collected documents |
| `entities` | Extracted entities |
| `relations` | Entity relationships |
| `claims` | Extracted claims |
| `events` | Timeline events |
| `reports` | Generated reports |

### Neo4j Graph (Optional)

- **Nodes**: Topic, Entity, Event, Claim, Document, Person, Organization
- **Relationships**: DEVELOPS, COMPETES_WITH, PUBLISHED_BY, USES, INVESTS_IN

## API Endpoints

### Skills
- `POST /api/skill/{name}` - Execute skill
- `GET /api/skill/{id}/status` - Poll status
- `POST /api/skill/{id}/cancel` - Cancel execution

### Topics
- `GET /api/topics` - List topics
- `POST /api/topics` - Create topic
- `PUT /api/topics/:id` - Update topic
- `DELETE /api/topics/:id` - Delete topic

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `POST /api/upload` - Upload file
- `DELETE /api/documents/:id` - Delete document

### Reports
- `GET /api/reports` - List reports
- `POST /api/reports` - Generate report
- `GET /api/reports/:id` - Get report

## Frontend Routes

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/topics` | Topic Management |
| `/graph` | Knowledge Graph |
| `/reports` | Reports |
| `/review` | Review Console |
| `/decision` | Decision Support |
| `/settings` | Settings |

## Creating a New Skill

1. Create `.claude/skills/my-skill.md`
2. Add YAML frontmatter
3. Write prompt with `{{param}}` placeholders
4. Define JSON output format

```markdown
---
version: "1.0.0"
display_name: "My Skill"
category: analysis
timeout: 300
params:
  - name: input
    type: string
    required: true
---

# My Skill

Input: {{input}}

## Output

```json
{
  "result": "value"
}
```
```

## Design System

Apple-inspired design with:

- **Colors**: Blue (#0071e3), green (#34c759), orange (#ff9f0a), red (#ff3b30)
- **Rounded corners**: 980px for buttons, 2xl for cards
- **Typography**: San Francisco / Inter
- **Animations**: Subtle fade-ins (0.3s ease-out)

## License

SPDX-License-Identifier: Apache-2.0
