import { type FC } from 'react';
import { CheckCircle, XCircle, Loader2, Circle, SkipForward } from 'lucide-react';

// ── Types ──

export interface PipelineStepInfo {
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  executionId: string | null;
  skillName?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

export interface PipelineInfo {
  pipelineId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  steps: Record<string, string>;  // stepName -> status
  title?: string;
}

// ── Step metadata ──

const STEP_ORDER = ['research', 'extract', 'sync-graph', 'report', 'image-gen', 'ppt-export'] as const;

const STEP_LABELS: Record<string, string> = {
  research: '情报采集',
  extract: '知识抽取',
  'sync-graph': '图谱同步',
  report: '报告生成',
  'image-gen': '图片生成',
  'ppt-export': 'PPT 导出',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
};

// ── Status styles ──

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof Circle }> = {
  pending:   { border: 'border-[#888]/30', bg: 'bg-transparent', text: 'text-[#888]', icon: Circle },
  running:   { border: 'border-[#1d1d1f]', bg: 'bg-[#1d1d1f]/5', text: 'text-[#1d1d1f]', icon: Loader2 },
  completed: { border: 'border-[#5B7553]/40', bg: 'bg-[#5B7553]/10', text: 'text-[#5B7553]', icon: CheckCircle },
  failed:    { border: 'border-[#A0453A]/40', bg: 'bg-[#A0453A]/10', text: 'text-[#A0453A]', icon: XCircle },
  skipped:   { border: 'border-[#888]/20 border-dashed', bg: 'bg-transparent', text: 'text-[#888]/60', icon: SkipForward },
};

// ── DAG Node ──

interface DagNodeProps {
  stepName: string;
  status: PipelineStepInfo['status'];
  active?: boolean;
  onClick?: () => void;
}

const DagNode: FC<DagNodeProps> = ({ stepName, status, active, onClick }) => {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const Icon = style.icon;
  const label = STEP_LABELS[stepName] ?? stepName;

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center px-3 py-2 rounded-xl border cursor-pointer transition-all min-w-[72px]
        ${style.border} ${style.bg}
        ${active ? 'ring-2 ring-[#0071e3]/40' : ''}
        ${status === 'running' ? 'animate-pulse' : ''}
        ${status === 'skipped' ? 'line-through opacity-60' : ''}
      `}
    >
      <Icon className={`w-3.5 h-3.5 mb-1 ${style.text} ${status === 'running' ? 'animate-spin' : ''}`} />
      <span className={`text-[11px] font-medium whitespace-nowrap ${style.text}`}>{label}</span>
    </button>
  );
};

// ── DAG Arrow ──

const DagArrow: FC<{ fromSkipped?: boolean }> = ({ fromSkipped }) => (
  <div className="flex items-center shrink-0">
    <div className={`w-4 h-px ${fromSkipped ? 'border-t border-dashed border-[#888]/30' : 'bg-[#1d1d1f]/20'}`} />
    <div className={`w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-transparent ${fromSkipped ? 'border-l-[#888]/30' : 'border-l-[#1d1d1f]/20'}`} />
  </div>
);

// ── Full Pipeline DAG ──

interface PipelineDagProps {
  steps: PipelineStepInfo[];
  activeStepName?: string | null;
  onStepClick?: (step: PipelineStepInfo) => void;
}

export const PipelineDag: FC<PipelineDagProps> = ({ steps, activeStepName, onStepClick }) => {
  // Build ordered list — steps may not include all 4 if some were skipped early
  const stepMap = new Map(steps.map(s => [s.stepName, s]));
  const orderedSteps = STEP_ORDER.map(name => stepMap.get(name) ?? { stepName: name, status: 'pending' as const, executionId: null });

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {orderedSteps.map((step, i) => (
        <div key={step.stepName} className="flex items-center">
          {i > 0 && <DagArrow fromSkipped={orderedSteps[i - 1].status === 'skipped'} />}
          <DagNode
            stepName={step.stepName}
            status={step.status}
            active={activeStepName === step.stepName}
            onClick={() => onStepClick?.(step)}
          />
        </div>
      ))}
    </div>
  );
};

// ── Mini DAG for history list ──

interface MiniDagProps {
  steps: Record<string, string>;  // stepName -> status
}

export const MiniPipelineDag: FC<MiniDagProps> = ({ steps }) => {
  const dotStyles: Record<string, string> = {
    pending: 'bg-[#888]/30',
    running: 'bg-[#1d1d1f] animate-pulse',
    completed: 'bg-[#5B7553]',
    failed: 'bg-[#A0453A]',
    skipped: 'bg-[#888]/20',
  };

  return (
    <div className="flex items-center gap-1">
      {STEP_ORDER.map((name, i) => {
        const status = steps[name] ?? 'pending';
        return (
          <div key={name} className="flex items-center">
            {i > 0 && <div className="w-2 h-px bg-[#888]/20" />}
            <div className={`w-2 h-2 rounded-full ${dotStyles[status] ?? dotStyles.pending}`} title={`${STEP_LABELS[name]}: ${STATUS_LABELS[status]}`} />
          </div>
        );
      })}
    </div>
  );
};

export default PipelineDag;
