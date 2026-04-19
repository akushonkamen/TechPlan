# TechPlan Skills

## Overview

Skills are markdown files with YAML frontmatter that define AI-powered workflows. They are loaded by `skillRegistry.ts` and executed via `skillExecutor.ts`.

## Location

```
.claude/skills/
├── research.md          # Document collection
├── extract.md           # Knowledge extraction
├── sync-graph.md        # Graph synchronization
├── optimize.md          # Topic optimization
├── track-competitor.md  # Competitor tracking
├── report.md            # Generic report generation
├── report-daily.md      # Daily reports
├── report-weekly.md     # Weekly reports
├── report-monthly.md    # Monthly reports
├── report-quarterly.md  # Quarterly reports
├── report-tech-topic.md # Technical topic reports
├── report-competitor.md # Competitor analysis reports
└── report-alert.md      # Alert reports
```

## Skill File Format

### YAML Frontmatter

```yaml
---
version: "1.0.0"
display_name: "情报采集"
description: |
  Multi-source document collection with deduplication
category: research
timeout: 1200
params:
  - name: topicName
    type: string
    required: true
    description: "Topic name"
  - name: keywords
    type: string
    required: true
    description: "Search keywords (JSON array string)"
steps:
  - "Phase 1: Broad scan"
  - "Phase 2: Deep dive"
  - "Phase 3: Gap filling"
---
```

### Prompt Content

```markdown
# Task Title

You are an expert in...

## Task Parameters

- Topic: {{topicName}}
- Keywords: {{keywords}}

## Execution Steps

### Step 1: ...

### Step 2: ...

## Output Format

```json
{
  "result": "value"
}
```
```

## Skill Categories

| Category | Skills | Timeout Range |
|----------|--------|---------------|
| `research` | research, track-competitor | 600-1200s |
| `extraction` | extract | 600-900s |
| `sync` | sync-graph | 300s |
| `reporting` | report-* | 300-900s |
| `analysis` | optimize | 300s |

## Parameter Rendering

Parameters are substituted using `{{paramName}}` syntax:

```typescript
// Input
{ topicName: 'AI Agents', keywords: '["agents", "llm"]' }

// Template
"Topic: {{topicName}}, Keywords: {{keywords}}"

// Result
"Topic: AI Agents, Keywords: ["agents", "llm"]"
```

## Database Access Pattern

Skills use the Bash tool to query SQLite:

```bash
sqlite3 -json database.sqlite "SELECT * FROM documents WHERE topic_id = '{{topicId}}';"
```

This returns JSON that can be parsed by the LLM.

## Common Skill Patterns

### 1. Multi-Phase Research

```markdown
### Phase 1: Broad Scan
- Search arXiv, news, GitHub
- Collect initial results

### Phase 2: Deep Dive
- Analyze Phase 1 results
- Follow promising leads

### Phase 3: Gap Filling
- Identify uncovered keywords
- Targeted searches
```

### 2. Structured Extraction

```markdown
For each document:
1. Identify entities (Technology, Organization, Person)
2. Extract relationships (DEVELOPS, COMPETES_WITH)
3. Extract claims (positive/negative/neutral)
4. Identify events (breakthrough, partnership, funding)
```

### 3. Quality Control

```markdown
Before storing:
- **Recency tier**: breaking (<30d), recent (<12mo), background (>12mo)
- **Credibility tier**: tier1 (official/peer-reviewed), tier2 (blogs/reports), tier3 (news/forums)
- **Deduplication**: Skip if title similarity >80%
```

### 4. Report Generation (SCQA)

```markdown
Executive Summary uses SCQA framework:
- **S**ituation: Current state (1-2 sentences)
- **C**omplication: Key change or conflict (1-2 sentences)
- **Q**uestion: Core problem (1 sentence)
- **A**nswer: Data-driven judgment (1-2 sentences)
```

## Output Format

All skills must output valid JSON:

```json
{
  "topicId": "{{topicId}}",
  "summary": "Brief summary",
  "stats": {
    "documentsProcessed": 10,
    "entitiesExtracted": 50
  },
  "results": [...]
}
```

The server parses this JSON and stores it in the database.

## Creating a New Skill

1. Create `.claude/skills/my-skill.md`
2. Add YAML frontmatter with metadata
3. Write the prompt with parameter placeholders
4. Define the output JSON format
5. The skill is automatically loaded by the registry

## Example: Simple Skill

```markdown
---
version: "1.0.0"
display_name: "Summary Generator"
description: "Generate a summary from documents"
category: analysis
timeout: 300
params:
  - name: topicId
    type: string
    required: true
steps:
  - "Fetch documents"
  - "Generate summary"
---

# Summary Generator

## Parameters

- Topic ID: {{topicId}}

## Steps

1. Fetch documents:
```bash
sqlite3 -json database.sqlite "SELECT title, content FROM documents WHERE topic_id = '{{topicId}}' LIMIT 10;"
```

2. Generate a 200-word summary.

## Output

```json
{
  "topicId": "{{topicId}}",
  "summary": "Generated summary text...",
  "documentCount": 10
}
```
```
