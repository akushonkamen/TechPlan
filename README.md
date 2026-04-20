<div align="center">

# TechPlan

**技术情报与推理平台**

智能技术情报采集、知识图谱构建与分析报告生成

[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

</div>

---

## Features

- **Dashboard** - Real-time statistics and trend visualization
- **Topic Management** - Create and manage technology tracking topics
- **Knowledge Graph** - Visualize entity relationships and evidence chains
- **Decision Support** - Multi-dimensional scorecards and recommendations
- **Analysis Reports** - Auto-generated daily, weekly, monthly, and quarterly reports
- **Data Collection** - AI-driven real-time intelligence retrieval
- **Review Console** - Human review of low-confidence extraction results
- **Skill System** - Markdown-based extensible skill pipeline

---

## Quick Start

### Prerequisites

| Dependency | Version | Check |
|-----------|---------|-------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.0.0 | `git --version` |

### Install

```bash
git clone https://github.com/akushonkamen/TechPlan.git
cd TechPlan
npm install
```

### Configure

Create `config.json`:

```json
{
  "aiProvider": "openai",
  "openaiApiKey": "your-api-key",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "openaiModel": "gpt-4o-mini"
}
```

Or use environment variables:

```bash
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### Run

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

Open **http://localhost:3000**

---

## AI Provider Configuration

| Provider | Config Fields | Description |
|----------|--------------|-------------|
| **OpenAI** | `openaiApiKey`, `openaiBaseUrl`, `openaiModel` | OpenAI API or compatible services |
| **Custom** | `customApiKey`, `customBaseUrl`, `customModel` | Any OpenAI-compatible API endpoint |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Express, Node.js |
| Database | SQLite (primary), Kuzu (local graph cache) |
| AI | Claude CLI with stream-json output |
| Real-time | WebSocket (ws) |
| Charts | Recharts |
| Graph | Custom SVG canvas |

---

## Project Structure

```
TechPlan/
├── server.ts              # Express backend
├── config.json            # Configuration file
├── database.sqlite        # SQLite database (auto-generated)
├── src/
│   ├── App.tsx            # React entry
│   ├── main.tsx           # Render root
│   ├── components/        # UI components
│   ├── pages/             # Route pages
│   ├── services/          # API services
│   ├── hooks/             # Custom hooks
│   ├── db/                # Database client
│   ├── skillExecutor.ts   # Claude CLI engine
│   ├── skillRegistry.ts   # Skill loader
│   ├── scheduler.ts       # Report scheduling
│   └── websocket.ts       # Real-time updates
├── .claude/skills/        # Markdown skill definitions
└── public/                # Static assets
```

---

## Routes

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/topics` | Topic Management |
| `/graph` | Knowledge Graph |
| `/reports` | Reports |
| `/review` | Review Console |
| `/decision` | Decision Support |
| `/settings` | Settings |
| `/tasks` | Tasks |

---

## FAQ

**Q: "API Key not configured" on startup**

Create `config.json` with a valid API key.

**Q: Port 3000 in use**

```bash
lsof -ti:3000 | xargs kill -9
# or
PORT=3001 npm run dev
```

**Q: Graph has no data**

Trigger a manual sync:

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
- **Attribution** — You must give appropriate credit
- **NonCommercial** — You may not use the material for commercial purposes
- **ShareAlike** — If you remix or transform, you must distribute under the same license
