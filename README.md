[中文](README-zh.md)

<div align="center">

# TechPlan

**Technology Intelligence & Reasoning Platform**

End-to-end intelligence platform: from data collection, knowledge extraction, graph construction to analytical reports.
Three-phase pipeline. Markdown skill engine. Real-time WebSocket push.

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
| Periodic reports compiled manually | Rushing weekly reports on Friday afternoon | Scheduled auto-generation of daily/weekly/monthly/quarterly reports |
| New tech decisions lack quantitative assessment | Decisions based on gut feeling | Multi-dimensional scorecards + evidence-based recommendations |

---

## Core Architecture

### Three-Phase Intelligence Pipeline

```
  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  ① research      │     │  ② extract      │     │  ③ sync-graph   │
  │  Collection      │────▶│  Extraction      │────▶│  Graph Sync     │
  │                  │     │                  │     │                  │
  │  Multi-source    │     │  Entity / Rel    │     │  SQLite → Kuzu   │
  │  scanning        │     │  Claim / Event   │     │  Node + Edge     │
  └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Report Generation Pipeline

```
  Scheduler / Manual Trigger
       │
       ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Collect  │────▶│  AI      │────▶│  Generate │
  │  Data     │     │  Analyze │     │  Report   │
  │  Window   │     │  Trends  │     │  Markdown │
  └──────────┘     └──────────┘     └──────────┘
```

### Real-time Communication

```
  Browser ──── WebSocket ────┐
                              ▼
  ┌─ Express Server ──────────────────────────┐
  │  Skill Executor (Claude CLI, stream-json) │
  │       │                                   │
  │       ▼ progress / tool_use / tool_result │
  │  WebSocket Broadcast ──▶ All subscribers  │
  └───────────────────────────────────────────┘
```

---

## Features

### Dashboard

Real-time stat cards (active topics, weekly documents, pending reviews, alerts), trend charts for collection volume, bar charts for topic evidence distribution, and a live activity feed.

### Topic Management

Create and track technology topics with configurable keywords, priority, scope, and collection frequency (daily/weekly/monthly). Document listing and file upload analysis supported.

### Knowledge Graph

Custom SVG graph with focus, timeline, and grid layouts. Node/edge search with highlighting, LLM-driven clustering analysis, JSON export.

### Analytical Reports

Auto-generate 7 report types: daily, weekly, monthly, quarterly, special topics, competitor tracking, and alert reports. Each topic can have its own report schedule.

### Decision Support

Multi-dimensional scorecards for quantitative tech evaluation. Competitor tracking, scenario modeling, impact analysis, and evidence-based recommendations.

### Skill System

Markdown-based extensible skill engine. Skills defined as `.md` files with YAML frontmatter and parameter templates. 12 built-in skills covering collection, extraction, graph sync, and report generation.

### Review Console

Manual review for low-confidence extractions (entities, relations, claims, events). Batch approve/reject to ensure data quality.

---

## Quick Start

<details>
<summary><strong>One-Click Install (Recommended)</strong></summary>

Cross-platform scripts auto-detect and install Node.js 18+, Claude Code CLI, dependencies, and build the project.

**macOS / Linux:**

```bash
bash setup.sh
```

**Windows (Admin PowerShell):**

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup.ps1
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
  "services": {
    "zImageUrl": "http://127.0.0.1:8000"
  }
}
```

Or use environment variables:

| Variable | Default | Description |
| ---- | ------ | ----------- |
| `PORT` | `3000` | Server port |
| `ADMIN_TOKEN` | — | Admin auth token |
| `MAX_UPLOAD_SIZE_MB` | `10` | File upload size limit |

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
| Database | SQLite (primary), Kuzu (local graph cache) |
| AI | Claude CLI + stream-json output |
| Real-time | WebSocket (ws) |
| Charts | Recharts |
| Graph | Custom SVG canvas |

---

## Project Structure

```
TechPlan/
├── server.ts              # Express backend
├── setup.sh / setup.ps1   # One-click install scripts
├── config.json            # Configuration
├── database.sqlite        # SQLite DB (auto-generated)
├── src/
│   ├── App.tsx            # React entry
│   ├── main.tsx           # Render root
│   ├── components/        # UI components
│   ├── pages/             # Page components
│   ├── services/          # API services
│   ├── hooks/             # Custom Hooks
│   ├── schemas/           # Validation schemas
│   ├── db/                # Database client
│   ├── skillExecutor.ts   # Claude CLI execution engine
│   ├── skillRegistry.ts   # Markdown skill loader
│   ├── scheduler.ts       # Report scheduler
│   └── websocket.ts       # WebSocket real-time updates
├── .claude/skills/        # Markdown skill definitions (12 built-in)
└── public/                # Static assets
```

### Routes

| Route | Page | Description |
| ---- | ---- | ----------- |
| `/` | Dashboard | Stats overview & trends |
| `/topics` | Topics | Create / edit / collect |
| `/graph` | Knowledge Graph | Visualization & analysis |
| `/reports` | Reports | View / generate reports |
| `/review` | Review Console | Manual review of extractions |
| `/decision` | Decision Support | Scorecards & recommendations |
| `/settings` | Settings | AI / graph / skills / scheduler config |
| `/tasks` | Tasks | Execution monitoring & history |

---

## FAQ

**Q: "API Key not configured" on startup**

Create `config.json` with a valid API Key.

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
