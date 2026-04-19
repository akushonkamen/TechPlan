# TechPlan React Components

## Overview

UI components built with React 19, TypeScript, and Tailwind CSS v4. Uses lucide-react for icons and recharts for data visualization.

## Component Architecture

### Layout Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `Layout.tsx` | App shell with sidebar | `children: ReactNode` |
| `PageHeader.tsx` | Page title with actions | `title`, `description`, `stats`, `children` |
| `SkillTaskBar.tsx` | Global skill status bar | - |

### Form Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `TopicForm.tsx` | Create/edit topic modal | `isOpen`, `onClose`, `onSubmit`, `formData`, `onFormDataChange`, `isSubmitting`, `mode` |
| `OptimizationConfigForm.tsx` | Optimization settings | `topic`, `onClose` |

### Skill Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `SkillButton.tsx` | Execute skill button | `onClick`, `status`, `children`, `disabled`, `variant` |
| `SkillStatusPanel.tsx` | Live skill progress | `executionId`, `onClose` |
| `SkillDetailPanel.tsx` | Skill execution details | `execution`, `onClose` |
| `ExecutionHistory.tsx` | Past executions list | `skillName`, `limit` |
| `SkillVersionHistory.tsx` | Skill version history | `skillName` |
| `SkillCard.tsx` | Skill catalog card | `skill`, `onExecute` |

### Data Display

| Component | Purpose | Props |
|-----------|---------|-------|
| `StatCard.tsx` | Metric display | `label`, `value`, `icon`, `trend` |
| `EmptyState.tsx` | No data placeholder | `icon`, `title`, `description`, `action` |
| `GraphVisualization.tsx` | Knowledge graph viewer | `nodes`, `edges`, `onNodeClick` |

## Design System

### Colors (Apple-style)

```typescript
const COLORS = {
  blue: '#0071e3',        // Primary action
  green: '#34c759',       // Success
  orange: '#ff9f0a',      // Warning
  red: '#ff3b30',         // Error
  gray: {
    50: '#f5f5f7',        // Background
    200: '#e8e8ed',       // Border
    400: '#aeaeb5',       // Muted text
    600: '#86868b',       // Secondary text
    900: '#1d1d1f',       // Primary text
  }
};
```

### Components

```typescript
// Card
className="bg-white rounded-2xl shadow-sm"

// Button (primary)
className="bg-[#0071e3] text-white px-5 py-2 rounded-[980px] font-medium hover:bg-[#0062cc]"

// Spinner
className="w-5 h-5 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin"
```

## Component Patterns

### Skill Status Tracking

Components track skill execution status:

```typescript
type SkillStatus = 'idle' | 'running' | 'completed' | 'failed';

// Status mapping
const statusMap = {
  idle: { label: '采集', icon: null, color: 'blue' },
  running: { label: '采集中...', icon: Loader2, color: 'gray' },
  completed: { label: '已完成', icon: CheckCircle2, color: 'green' },
  failed: { label: '重试', icon: RefreshCw, color: 'red' }
};
```

### Modal Pattern

```typescript
const [isOpen, setIsOpen] = useState(false);

return (
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>标题</DialogTitle>
      </DialogHeader>
      {/* Content */}
    </DialogContent>
  </Dialog>
);
```

### Data Fetching Pattern

```typescript
const [data, setData] = useState<T[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function fetchData() {
    try {
      const res = await fetch('/api/endpoint');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }
  fetchData();
}, []);
```

## Icon Usage (lucide-react)

```typescript
import { Activity, FileText, Tags, Network, Settings } from 'lucide-react';

<Activity className="w-5 h-5" />
```

## Animation

Uses `motion` from Framer Motion:

```typescript
className="animate-fade-in"
```

Custom animations in `index.css`:

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
```
