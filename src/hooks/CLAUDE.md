# TechPlan React Hooks

## Custom Hooks

React hooks for skill execution and API interactions.

## Hooks

### useSkillExecutor (`useSkillExecutor.ts`)

**Purpose**: Execute Claude Code skills via WebSocket

**State**:
```typescript
interface SkillExecutionState {
  executionId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout';
  progress: string[];        // Progress messages
  result: SkillResult | null;
  error: string | null;
  startedAt: string | null;
}
```

**Methods**:
```typescript
execute(skillName: string, params: Record<string, any>): Promise<void>
cancel(): Promise<void>
reset(): void
```

**Usage**:
```typescript
const { status, progress, result, execute, cancel, reset } = useSkillExecutor();

const handleCollect = async () => {
  await execute('research', { topicId: '123', topicName: 'AI' });
};

// Auto-cancel on unmount
useEffect(() => {
  return () => {
    // WebSocket cleanup handled internally
  };
}, []);
```

**Features**:
- WebSocket connection to `/ws`
- Progress streaming
- Polling fallback (every 2s)
- 5-minute timeout
- Auto-retry on connection loss

### useSkills (`useSkills.ts`)

**Purpose**: Convenience hooks for optimization

**Available Hooks**:
```typescript
useBilevelOptimization()  // Bilevel optimization for skills
```

**Usage**:
```typescript
const { status, execute, optimize } = useBilevelOptimization();

const handleOptimize = () => {
  optimize({ skillName, evaluationCriteria, maxIterations });
};
```

### useSkillApi (`useSkillApi.ts`)

**Purpose**: Skill execution via REST API (no WebSocket)

**Usage**:
```typescript
const { execute, getStatus, cancel } = useSkillApi();

const execution = await execute('research', { topicId });
const status = await getStatus(execution.id);
```

## WebSocket URL

```typescript
const WS_URL = `ws://${window.location.host}/ws`;
```

## Message Protocol

### Subscribe

```typescript
// Client → Server
{ type: 'subscribe', executionId: 'uuid' }
```

### Progress

```typescript
// Server → Client
{
  type: 'progress',
  executionId: 'uuid',
  data: 'Collecting documents from arXiv...'
}
```

### Result

```typescript
// Server → Client
{
  type: 'result',
  executionId: 'uuid',
  data: '{"totalCollected": 10, ...}'  // JSON string
}
```

### Error

```typescript
// Server → Client
{
  type: 'error',
  executionId: 'uuid',
  data: 'Collection failed: timeout'
}
```

## Result Types

```typescript
interface SkillResult {
  totalCollected?: number;           // Research result
  extractionStats?: {
    entities?: number;
    relations?: number;
  };
  title?: string;                    // Report result
  raw?: string;                      // Fallback for malformed JSON
  [key: string]: unknown;
}
```

## Polling Fallback

If WebSocket fails, the hook falls back to polling:

```typescript
const pollStatus = async () => {
  const statusRes = await fetch(`/api/skill/${executionId}/status`);
  const statusData = await statusRes.json();
  // Update state based on statusData.status
};

setInterval(pollStatus, 2000);  // Every 2 seconds
```

## Timeout Handling

```typescript
const timeout = setTimeout(() => {
  if (status === 'running') {
    setState({ ...prev, status: 'timeout', error: 'Execution timed out' });
  }
}, 300000);  // 5 minutes
```
