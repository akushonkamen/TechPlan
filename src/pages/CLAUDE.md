# TechPlan Pages

## Route Pages

All pages are React components located in `src/pages/`.

## Page Components

### Dashboard (`Dashboard.tsx`)

**Purpose**: Overview of system status and recent activity

**Features**:
- Stats cards (active topics, weekly docs, pending reviews, alerts)
- Collection trend chart (LineChart)
- Topic evidence distribution (BarChart)
- Recent activity feed

**Data Sources**:
- `/api/dashboard/stats`
- `/api/dashboard/trend`
- `/api/dashboard/topic-distribution`
- `/api/dashboard/alerts`

### Topics (`Topics.tsx`)

**Purpose**: Manage technical tracking topics

**Features**:
- Topic list with search/filter
- Create/edit/delete topics
- Per-topic skill execution (research → extract → sync)
- Document list per topic
- File upload with analysis option

**Key Hooks**:
- `useEffect` for data fetching
- `useCallback` for skill execution
- `useRef` for file input and cleanup

**Skill Pipeline**:
```typescript
handleCollect(topic):
  1. research → 2. extract → 3. sync-graph
```

### KnowledgeGraph (`KnowledgeGraph.tsx`)

**Purpose**: Visualize entity relationships

**Features**:
- Custom SVG graph visualization
- Node/edge filtering with highlight-first search
- Deterministic terrain layout with focus, timeline, and grid modes
- LLM-backed graph sensemaking clusters with fallback
- Interactive viewport (pan/zoom)
- Node detail panel with metadata
- Export capabilities (JSON)

### Reports (`Reports.tsx`)

**Purpose**: View and manage generated reports

**Features**:
- Report list by type (daily/weekly/monthly/quarterly)
- Report detail view

### ReviewConsole (`ReviewConsole.tsx`)

**Purpose**: Review and approve extracted entities/claims

**Features**:
- Pending items queue
- Batch approval/rejection
- Confidence scoring
- Edit capabilities

### DecisionSupport (`DecisionSupport.tsx`)

**Purpose**: AI-powered decision analysis

**Features**:
- Scenario modeling
- Impact assessment
- Recommendation generation

### Tasks (`Tasks.tsx`)

**Purpose**: Task execution center with real-time progress and history

**Features**:
- Real-time task execution monitoring
- Task history and status tracking
- Skill execution via unified interface

### Settings (`Settings.tsx`)

**Purpose**: System configuration

**Features**:
- Local graph database status
- Skill configuration
- Scheduler settings
- User preferences

## Common Patterns

### Page Structure

```typescript
export default function PageName() {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className={SPINNER} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="..." description="...">
        {/* Actions */}
      </PageHeader>
      {/* Content */}
    </div>
  );
}
```

### Error Handling

```typescript
try {
  const res = await fetch('/api/endpoint');
  if (!res.ok) throw new Error('Failed');
  setData(await res.json());
} catch (error) {
  console.error('Error:', error);
  // Show error to user
} finally {
  setLoading(false);
}
```

### Pagination

```typescript
const [page, setPage] = useState(1);
const [limit] = useState(20);

const fetchPage = async (p: number) => {
  const res = await fetch(`/api/endpoint?page=${p}&limit=${limit}`);
  // ...
};
```

## Data Flow

```
User Action → fetch() → Backend API → SQLite/Kuzu → Response → setState() → Re-render
```

## WebSocket Integration

Pages use `useSkillExecutor` hook for real-time skill execution updates:

```typescript
const { status, progress, result, execute } = useSkillExecutor();

const handleExecute = () => {
  execute('skill-name', { params });
};
```
