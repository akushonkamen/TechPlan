[中文](README-zh.md)

<div align="center">

# TechPlan

**Technology Intelligence & Reasoning Platform**

End-to-end intelligence platform: from data collection, knowledge extraction, graph construction to analytical reports.
Six-step smart pipeline. Markdown skill engine. Real-time WebSocket push.

[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

</div>

---

## Why TechPlan

Tech teams face an overwhelming volume of daily technical updates. Manual tracking is slow and misses critical signals.

| Pain Point | Traditional Approach | TechPlan Solution |
| ---- | -------- | ------------- |
| Tech updates scattered across dozens of sources | Manual browsing, screenshots, Excel sheets | AI-driven auto-collection, aggregated by topic |
| Fragmented information, no visible connections | Individual memory, knowledge lost with staff | Knowledge graph auto-builds entity relationships & evidence chains |
| Periodic reports compiled manually | Rushing weekly reports on Friday afternoon | Scheduled auto-generation of 7 report types |
| New tech decisions lack quantitative assessment | Decisions based on gut feeling | 10-dimension scorecards + evidence-based recommendations |

---

## Core Architecture

### Report Generation Pipeline (Six Steps)

```
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ ①research │──▶│ ②extract │──▶│③sync-graph│──▶│ ④report  │──▶│⑤image-gen│──▶│ ⑥pptx   │
  │ Collection│   │ Extraction│   │ Graph Sync│   │ AI Report │   │ Cover+Fig│   │ PPT Export│
  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
        │              │              │              │              │              │
        └── skip when data exists ──┘              │              └── Z-Image ──┘
                                                   │
                              Skip ①②③ when data exists ──┘
```

Each step supports conditional skipping: skip collection when data is sufficient, skip extraction when entities exist, skip graph sync when extraction was skipped.

### Real-time Communication

```
  Browser ──── WebSocket ────┐
                              ▼
  ┌─ Express Server ──────────────────────────┐
  │  Skill Executor (Claude CLI, stream-json) │
  │       │                                   │
  │       ▼ internal stream-json events       │
  │       │  tool_use → human-readable text   │
  │       │  tool_result → result summary     │
  │       ▼                                   │
  │  WebSocket Broadcast (progress/result/error)│
  │       └──▶ all clients subscribed to       │
  │            the same executionId            │
  └───────────────────────────────────────────┘
```

---

## Features

### Dashboard

Real-time stat cards (active topics, weekly documents, pending reviews, alerts), area chart for collection trends, bar chart for topic evidence distribution. Intelligence highlights panel showing predicted associations, anomalous entities, and core entities. Trend signals panel displaying document change rates per topic. Smart alert area for real-time alert reports.

### Topic Management

Create and track technology topics with configurable keywords, priority, scope, and collection frequency (daily/weekly/monthly). Document listing and file upload analysis. Each topic can have independent report scheduling (daily/weekly/monthly/quarterly toggles).

### Knowledge Graph

Custom SVG graph with 7 layout modes: terrain (default, LLM semantic clustering), focus, timeline, grid, radar, matrix, and bundle. Node/edge search with highlighting. 6 analysis dimensions (statistics, paths, centrality, community, prediction, anomaly). JSON and SVG export supported.

### Analytical Reports

Auto-generate 7 report types: daily, weekly, monthly, quarterly, tech topic, competitor, and alert. Reports support cover image generation (Z-Image service) and PPT export. Built-in freshness mechanism auto-marks stale reports. Select text fragments for AI-powered deep discussion, with results pinnable back to report sections.

### Decision Support

10-dimension scorecards for quantitative tech evaluation (tech maturity, academic traction, industrialization speed, competitive density, etc.). Competitor tracking support. Evidence-based recommendations (continue tracking / small pilot / major investment, etc.).

### Skill System

Markdown-based extensible skill engine. Skills defined as `.md` files with YAML frontmatter and parameter templates. 13 built-in skills covering collection, extraction, graph sync, report generation, optimization, competitor tracking, and discussion expansion.

### Review Console

Manual review for low-confidence extractions across three review task types: claim review, entity disambiguation, and conflict detection. Batch approve supported to ensure data quality.

---

## Quick Start

<details>
<summary><strong>One-Click Install (Recommended)</strong></summary>

Cross-platform scripts auto-detect and install Node.js 18+, Claude Code CLI, dependencies, and build the project.

**macOS / Linux:**

```bash
bash scripts/setup.sh
```

**Windows (Admin PowerShell):**

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup.ps1
```

</details>

<details>
<summary><strong>Manual Install</strong></summary>

**Requirements:**

| Dependency | Version | Check |
| ---- | ---- | ---- |
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.0.0 | `git --version` |

**Install:**

```bash
git clone https://github.com/akushonkamen/TechPlan.git
cd TechPlan
npm install
```

</details>

<details>
<summary><strong>Configuration</strong></summary>

Create `config.json`:

```json
{
  "schedulerEnabled": false,
  "schedulerCheckIntervalMinutes": 30,
  "aiProvider": "openai",
  "openaiApiKey": "your-api-key",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "openaiModel": "gpt-4o-mini",
  "services": {
    "zImageUrl": "http://127.0.0.1:8000",
    "pptMasterDir": ""
  }
}
```

Or use environment variables:

| Variable | Default | Description |
| ---- | ------ | ----------- |
| `PORT` | `3000` | Server port |
| `ADMIN_TOKEN` | — | Admin auth token |
| `MAX_UPLOAD_SIZE_MB` | `10` | File upload size limit |
| `OPENAI_API_KEY` | — | AI service API key |
| `OPENAI_BASE_URL` | — | AI service API base URL |
| `OPENAI_MODEL` | — | AI model name |
| `SCHEDULER_ENABLED` | `true` | Enable/disable scheduled tasks |

</details>

**Start:**

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

Visit **http://localhost:3000** after startup.

---

## Tech Stack

| Layer | Technology |
| ---- | ---------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Express, Node.js |
| Database | SQLite (primary), Kuzu (local graph cache, SQLite auto-fallback) |
| AI | Claude CLI + stream-json output |
| Real-time | WebSocket (ws) |
| Charts | Recharts 3 |
| Graph | Custom SVG canvas |
| Image Generation | Z-Image (local deployment) |
| Document Export | PPTX (ppt-master) |

---

## Project Structure

```
TechPlan/
├── src/
│   ├── App.tsx                # React entry + route definitions
│   ├── main.tsx               # Render root
│   ├── components/            # Shared UI components
│   ├── pages/                 # Page components (8)
│   ├── services/              # Service layer
│   │   ├── imageGeneration.ts # Z-Image cover/figure generation
│   │   ├── imagePromptSchema.ts # Image prompt validation
│   │   ├── pptxExport.ts      # PPTX export
│   │   ├── reportService.ts   # Report migration helpers
│   │   └── topicService.ts    # Topic API
│   ├── hooks/                 # Custom Hooks
│   ├── schemas/               # Validation schemas
│   ├── lib/                   # Utilities (layout, graph analysis, design system)
│   ├── types/                 # Type definition modules
│   ├── db/                    # Database client (Kuzu)
│   ├── server/                # Backend services
│   │   ├── index.ts           # Express entry
│   │   ├── reportHandler.ts   # Report pipeline orchestration (6 steps)
│   │   ├── db.ts              # SQLite connection
│   │   ├── middleware.ts      # Auth & config middleware
│   │   └── routes/            # API routes (skills, reports, topics, graph, dashboard, reviews, config)
│   ├── skillExecutor.ts       # Claude CLI execution engine (stream-json)
│   ├── skillRegistry.ts       # Markdown skill loader
│   ├── scheduler.ts           # Report scheduling + alert detection
│   └── websocket.ts           # WebSocket real-time push
├── scripts/                   # Install & startup scripts
│   ├── setup.sh               # macOS/Linux one-click install
│   └── setup.ps1              # Windows one-click install
├── .claude/skills/            # Markdown skill definitions (13 built-in skills)
└── public/                    # Static assets
```

### Routes

| Route | Page | Description |
| ---- | ---- | ----------- |
| `/` | Dashboard | Stats overview, intelligence highlights, trend signals, alerts |
| `/topics` | Topics | Create / edit / collect / schedule config |
| `/graph` | Knowledge Graph | 7 layout visualizations + 6-dimension analysis |
| `/reports` | Reports | View / generate / PPT export / expand discussion |
| `/review` | Review Console | Claim review / entity disambiguation / conflict detection |
| `/decision` | Decision Support | 10-dimension scorecard + competitor tracking |
| `/settings` | Settings | AI / graph / skills / scheduler config |
| `/tasks` | Tasks | Execution monitoring & history |

---

## FAQ

**Q: "API Key not configured" on startup**

Set `openaiApiKey` in `config.json`, or set the `OPENAI_API_KEY` environment variable.

**Q: Port 3000 in use**

```bash
lsof -ti:3000 | xargs kill -9
# Or use a different port
PORT=3001 npm run dev
```

**Q: Graph has no data**

Run the collection pipeline first (research → extract → sync-graph), or manually sync:

```bash
curl -X POST http://localhost:3000/api/graph/sync/<topicId>
```

**Q: Cover image generation fails**

Ensure the Z-Image service is running and accessible (default `http://127.0.0.1:8000`). The image generation step is automatically skipped when the service is unavailable.

---

## License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**You are free to:**
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

**Under the following terms:**
- **Attribution** — Give appropriate credit
- **NonCommercial** — Not for commercial purposes
- **ShareAlike** — Distribute adaptations under the same license
