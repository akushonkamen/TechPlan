import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Terminal, Clock, Activity, GitBranch, SkipForward, Circle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { PipelineDag, MiniPipelineDag, type PipelineStepInfo, type PipelineInfo } from '../components/PipelineDag';
import { CARD, SPINNER } from '../lib/design';

// ── Types ──

interface SkillExecution {
  id: string;
  skill_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  result?: string;
  params?: string;
  pipeline_id?: string | null;
  pipeline_step?: string | null;
}

interface PipelineDetail {
  pipelineId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  steps: Array<{
    executionId: string;
    skillName: string;
    stepName: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    result?: any;
  }>;
}

type FilterTab = 'all' | 'running' | 'completed' | 'failed';

// ── Helpers ──

function formatDuration(start: string, end?: string | null): string {
  const s = new Date(start).getTime();
  if (isNaN(s)) return '?';
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s2 = sec % 60;
  if (m < 60) return `${m}m ${s2}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SKILL_LABELS: Record<string, string> = {
  research: '情报采集',
  extract: '知识抽取',
  report: '报告生成',
  'report-daily': '日报生成',
  'report-monthly': '月报生成',
  'report-quarterly': '季报生成',
  'report-competitor': '友商分析',
  'report-tech-topic': '技术专题',
  'report-alert': '情报预警',
  'track-competitor': '友商追踪',
  'sync-graph': '图谱同步',
  'image-gen': '图片生成',
  'ppt-export': 'PPT 导出',
  optimize: '优化循环',
};

function skillLabel(name: string): string {
  return SKILL_LABELS[name] || name;
}

function formatJson(val: any): string {
  try {
    return JSON.stringify(typeof val === 'string' ? JSON.parse(val) : val, null, 2);
  } catch { return String(val); }
}

function getLogColor(line: string): string {
  if (line.startsWith('思考')) return 'text-[#7A5C6B]';
  if (line.startsWith('调用')) return 'text-[#4A6670]';
  if (line.startsWith('结果')) return 'text-[#5B7553]';
  if (line.startsWith('错误') || line.startsWith('Error') || line.startsWith('[stderr]') || line.startsWith('启动失败')) return 'text-[#A0453A]';
  if (line.startsWith('超时') || line.startsWith('失败')) return 'text-[#A0453A]';
  if (line.includes('完成')) return 'text-[#5B7553] font-medium';
  if (line.startsWith('系统')) return 'text-[#888]';
  return 'text-[#1d1d1f]/10';
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof Activity }> = {
  running:   { bg: 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20', text: 'text-[#1d1d1f]', icon: Loader2 },
  completed: { bg: 'bg-[#5B7553]/10', text: 'text-[#5B7553]', icon: CheckCircle2 },
  failed:    { bg: 'bg-[#A0453A]/10', text: 'text-[#A0453A]', icon: XCircle },
  timeout:   { bg: 'bg-[#9C7B3C]/10', text: 'text-[#9C7B3C]', icon: Clock },
  skipped:   { bg: 'bg-[#888]/5', text: 'text-[#888]', icon: SkipForward },
  pending:   { bg: 'bg-[#888]/5', text: 'text-[#888]', icon: Circle },
};

const STATUS_LABELS: Record<string, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  cancelled: '已取消',
  pending: '等待中',
  skipped: '已跳过',
};

// ── Main Component ──

export default function Tasks() {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [pipelineDetails, setPipelineDetails] = useState<Record<string, PipelineDetail>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [activeStepName, setActiveStepName] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPipelineId, setExpandedPipelineId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch standalone executions (pipeline children filtered by backend)
  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/skill/executions');
      if (res.ok) {
        const data = await res.json();
        setExecutions(data);
        setIsLoading(false);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch pipelines list
  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch('/api/pipelines');
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        setIsLoading(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchExecutions();
    fetchPipelines();
    const id = setInterval(() => { fetchExecutions(); fetchPipelines(); }, 2000);
    return () => clearInterval(id);
  }, [fetchExecutions, fetchPipelines]);

  // Fetch detail for running/active pipeline
  useEffect(() => {
    const runningPipelines = pipelines.filter(p => p.status === 'running');
    const target = activePipelineId
      ? pipelines.find(p => p.pipelineId === activePipelineId)
      : runningPipelines[0];

    if (!target) return;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/pipeline/${target.pipelineId}`);
        if (res.ok) {
          const data = await res.json();
          setPipelineDetails(prev => ({ ...prev, [data.pipelineId]: data }));
        }
      } catch { /* ignore */ }
    };

    fetchDetail();
  }, [pipelines, activePipelineId]);

  // Auto-select first running pipeline or execution
  useEffect(() => {
    if (!activePipelineId && !activeId) {
      const runningPipeline = pipelines.find(p => p.status === 'running');
      if (runningPipeline) {
        setActivePipelineId(runningPipeline.pipelineId);
        return;
      }
      const runningExec = executions.find(e => e.status === 'running');
      if (runningExec) setActiveId(runningExec.id);
    }
  }, [pipelines, executions, activePipelineId, activeId]);

  // Get the active step's executionId for progress polling
  const activeStepExecId = (() => {
    if (!activePipelineId || !activeStepName) return null;
    const detail = pipelineDetails[activePipelineId];
    if (!detail) return null;
    const step = detail.steps.find(s => s.stepName === activeStepName);
    return step?.executionId ?? null;
  })();

  // Poll progress for active step execution
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    const pollId = activePipelineId ? activeStepExecId : activeId;
    if (!pollId) return;

    // Check if the execution is still running
    const exec = executions.find(e => e.id === pollId);
    if (exec && exec.status !== 'running') return;

    let totalKnown = progress[pollId]?.length || 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/skill/${pollId}/progress?after=${totalKnown}`);
        if (res.ok) {
          const data = await res.json();
          if (data.total < totalKnown) totalKnown = 0;
          if (data.lines?.length > 0) {
            setProgress(prev => ({
              ...prev,
              [pollId!]: [...(prev[pollId!] || []), ...data.lines],
            }));
          }
          totalKnown = data.total || totalKnown;
        }
      } catch { /* ignore */ }
    };

    poll();
    progressIntervalRef.current = setInterval(poll, 1000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [activeStepExecId, activeId, activePipelineId, executions]);

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress, activeId, activeStepExecId]);

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/skill/${id}/cancel`, { method: 'POST' });
      if (!res.ok) alert('取消任务失败');
    } catch {
      alert('取消任务失败');
    }
    fetchExecutions();
    fetchPipelines();
  };

  // Build combined display list for history
  const runningPipelines = pipelines.filter(p => p.status === 'running');
  const runningExecutions = executions.filter(e => e.status === 'running');

  // Filter pipelines for history
  const filteredPipelines = pipelines.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'running') return p.status === 'running' || p.status === 'pending';
    return p.status === filter;
  });
  const filteredExecutions = executions.filter(e => {
    if (filter === 'all') return true;
    return e.status === filter;
  });

  // Determine active log execution and logs
  const displayLogExecId = activePipelineId ? activeStepExecId : activeId;
  const displayLogs = displayLogExecId ? (progress[displayLogExecId] || []) : [];

  // Force re-render every second for duration timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (runningPipelines.length === 0 && runningExecutions.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [runningPipelines.length, runningExecutions.length]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <PageHeader title="任务中心" description="查看和管理所有任务执行状态" />

      {/* Running pipelines */}
      {runningPipelines.length > 0 && (
        <div className="space-y-3">
          {runningPipelines.map(pipe => {
            const isActive = activePipelineId === pipe.pipelineId;
            const detail = pipelineDetails[pipe.pipelineId];
            const steps: PipelineStepInfo[] = detail
              ? detail.steps.map(s => ({
                  stepName: s.stepName,
                  status: s.status as PipelineStepInfo['status'],
                  executionId: s.executionId,
                }))
              : Object.entries(pipe.steps).map(([name, status]) => ({
                  stepName: name,
                  status: status as PipelineStepInfo['status'],
                  executionId: null,
                }));
            const currentRunningStep = detail?.steps.find(s => s.status === 'running');

            return (
              <div key={pipe.pipelineId} className={`${CARD} overflow-hidden`}>
                {/* Card header with DAG */}
                <div
                  className="px-4 py-4 cursor-pointer hover:bg-[#F7F7F7]/50 transition-colors sm:px-5"
                  onClick={() => {
                    setActivePipelineId(isActive ? null : pipe.pipelineId);
                    setActiveId(null);
                    if (!isActive && currentRunningStep) {
                      setActiveStepName(currentRunningStep.stepName);
                    }
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1d1d1f]/5 border border-[#1d1d1f]/20">
                        <GitBranch className="w-4.5 h-4.5 text-[#1d1d1f]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#1d1d1f]">{pipe.title || '报告生成流水线'}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#1d1d1f]/5 text-[#1d1d1f]">
                            执行中
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[#888]">
                          <Clock className="w-3 h-3" />
                          <span>{formatDuration(pipe.startedAt ?? '')}</span>
                          <span className="text-[#888]">·</span>
                          <span className="font-mono">{pipe.pipelineId.slice(0, 12)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {currentRunningStep && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(currentRunningStep.executionId); }}
                          className="text-xs text-[#A0453A] hover:text-[#A0453A]/80 px-3 py-1.5 rounded-[980px] border border-[#A0453A]/30 transition-colors"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </div>

                  {/* DAG visualization */}
                  <div className="mt-3">
                    <PipelineDag
                      steps={steps}
                      activeStepName={isActive ? activeStepName : null}
                      onStepClick={(step) => {
                        if (step.executionId) {
                          setActiveStepName(step.stepName);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Terminal log for active step */}
                {isActive && displayLogExecId && (
                  <div className="border-t border-[#1d1d1f]/20">
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1d1d1f]">
                      <Terminal className="w-3.5 h-3.5 text-[#888]" />
                      <span className="text-xs font-medium text-[#888]">
                        {activeStepName ? SKILL_LABELS[activeStepName] || activeStepName : '实时输出'}
                      </span>
                    </div>
                    <div
                      ref={logContainerRef}
                      className="bg-[#1d1d1f] text-[#1d1d1f/10] px-4 py-2 overflow-y-auto font-mono text-xs"
                      style={{ maxHeight: 320 }}
                    >
                      {displayLogs.length === 0 ? (
                        <div className="text-[#888] py-4 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>正在启动...</span>
                        </div>
                      ) : (
                        displayLogs.map((line, i) => (
                          <div key={i} className={`py-0.5 leading-relaxed ${getLogColor(line)}`}>
                            <span className="text-[#888] select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Running standalone executions */}
      {!activePipelineId && runningExecutions.length > 0 && (
        <div className="space-y-3">
          {runningExecutions.map(exec => {
            const isActive = activeId === exec.id;
            const logs = isActive ? displayLogs : (progress[exec.id] || []);
            const style = STATUS_STYLES[exec.status] || STATUS_STYLES.running;
            const Icon = style.icon;

            return (
              <div key={exec.id} className={`${CARD} overflow-hidden`}>
                <div
                  className="px-4 py-4 flex flex-col gap-3 cursor-pointer hover:bg-[#F7F7F7]/50 transition-colors sm:px-5 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => { setActiveId(isActive ? null : exec.id); setActivePipelineId(null); }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${style.bg}`}>
                      <Icon className={`w-4.5 h-4.5 ${style.text} ${exec.status === 'running' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#1d1d1f]">{skillLabel(exec.skill_name)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                          {STATUS_LABELS[exec.status] || exec.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-[#888]">
                        <Clock className="w-3 h-3" />
                        <span>{formatDuration(exec.started_at)}</span>
                        <span className="text-[#888]">·</span>
                        <span className="font-mono">{exec.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancel(exec.id); }}
                      className="text-xs text-[#A0453A] hover:text-[#A0453A]/80 px-3 py-1.5 rounded-[980px] border border-[#A0453A]/30 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>

                {isActive && (
                  <div className="border-t border-[#1d1d1f]/20">
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1d1d1f]">
                      <Terminal className="w-3.5 h-3.5 text-[#888]" />
                      <span className="text-xs font-medium text-[#888]">实时输出</span>
                    </div>
                    <div
                      ref={isActive ? logContainerRef : null}
                      className="bg-[#1d1d1f] text-[#1d1d1f/10] px-4 py-2 overflow-y-auto font-mono text-xs"
                      style={{ maxHeight: 320 }}
                    >
                      {logs.length === 0 ? (
                        <div className="text-[#888] py-4 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>正在启动...</span>
                        </div>
                      ) : (
                        logs.map((line, i) => (
                          <div key={i} className={`py-0.5 leading-relaxed ${getLogColor(line)}`}>
                            <span className="text-[#888] select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History section */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-[#1d1d1f]">历史记录</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'running', 'completed', 'failed'] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-[980px] text-xs font-medium transition-all ${
                  filter === tab
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-[#F7F7F7] text-[#888] hover:bg-[#1d1d1f]/10'
                }`}
              >
                {tab === 'all' ? '全部' : STATUS_LABELS[tab] || tab}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className={SPINNER} />
          </div>
        ) : filteredPipelines.length === 0 && filteredExecutions.length === 0 ? (
          <EmptyState
            icon={<Activity className="w-12 h-12" />}
            title="暂无任务"
            description="在报告或主题页面触发技能后，任务将在此显示"
          />
        ) : (
          <div className="space-y-2">
            {/* Pipeline history entries */}
            {filteredPipelines.map(pipe => {
              const detail = pipelineDetails[pipe.pipelineId];
              const pipeStyle = STATUS_STYLES[pipe.status] || STATUS_STYLES.running;
              const Icon = pipeStyle.icon;

              return (
                <div key={pipe.pipelineId} className={`${CARD} overflow-hidden`}>
                  <div
                    className="px-4 py-3.5 flex flex-col gap-3 cursor-pointer hover:bg-[#F7F7F7]/50 transition-colors sm:px-5 lg:flex-row lg:items-center lg:justify-between"
                    onClick={() => {
                      const isExpanding = expandedPipelineId !== pipe.pipelineId;
                      setExpandedPipelineId(isExpanding ? pipe.pipelineId : null);
                      if (isExpanding && !detail) {
                        fetch(`/api/pipeline/${pipe.pipelineId}`).then(r => r.json()).then(d => {
                          setPipelineDetails(prev => ({ ...prev, [d.pipelineId]: d }));
                        }).catch(() => {});
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 ${pipeStyle.text} ${pipe.status === 'running' ? 'animate-spin' : ''}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-[#1d1d1f]">{pipe.title || '报告流水线'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pipeStyle.bg} ${pipeStyle.text}`}>
                            {STATUS_LABELS[pipe.status] || pipe.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#888]">
                          <span>{new Date(pipe.startedAt ?? '').toLocaleString('zh-CN')}</span>
                          <span className="text-[#888]">·</span>
                          <span>{formatDuration(pipe.startedAt ?? '', pipe.completedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <MiniPipelineDag steps={pipe.steps} />
                  </div>
                  {/* Expanded step details */}
                  {expandedPipelineId === pipe.pipelineId && pipelineDetails[pipe.pipelineId] && (
                    <div className="px-4 pb-4 pt-2 border-t border-[#1d1d1f]/10 animate-fade-in">
                      {pipelineDetails[pipe.pipelineId].steps.map(step => {
                        const stepStyle = STATUS_STYLES[step.status] || STATUS_STYLES.pending;
                        const StepIcon = stepStyle.icon;
                        return (
                          <div key={step.executionId} className="py-2 border-b border-[#1d1d1f]/5 last:border-0">
                            <div className="flex items-center gap-2">
                              <StepIcon className={`w-3.5 h-3.5 ${stepStyle.text}`} />
                              <span className="text-sm text-[#1d1d1f]">{SKILL_LABELS[step.stepName] || step.stepName}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stepStyle.bg} ${stepStyle.text}`}>
                                {STATUS_LABELS[step.status] || step.status}
                              </span>
                              {step.startedAt && step.completedAt && (
                                <span className="text-[10px] text-[#888]">
                                  {formatDuration(step.startedAt, step.completedAt)}
                                </span>
                              )}
                            </div>
                            {step.error && (
                              <div className="mt-1 text-xs text-[#A0453A] bg-[#A0453A]/5 rounded px-2 py-1">{step.error}</div>
                            )}
                            {step.result && (
                              <pre className="mt-1 text-[11px] bg-[#f5f5f7] rounded-lg p-2 max-h-40 overflow-auto font-mono whitespace-pre-wrap break-all">
                                {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2).slice(0, 800)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone execution history entries */}
            {filteredExecutions.map(exec => {
              const isExpanded = expandedId === exec.id;
              const style = STATUS_STYLES[exec.status] || STATUS_STYLES.running;
              const Icon = style.icon;

              return (
                <div key={exec.id} className={`${CARD} overflow-hidden`}>
                  <div
                    className="px-4 py-3.5 flex flex-col gap-3 cursor-pointer hover:bg-[#F7F7F7]/50 transition-colors sm:px-5 lg:flex-row lg:items-center lg:justify-between"
                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 ${style.text} ${exec.status === 'running' ? 'animate-spin' : ''}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-[#1d1d1f]">{skillLabel(exec.skill_name)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                            {STATUS_LABELS[exec.status] || exec.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#888]">
                          <span>{new Date(exec.started_at).toLocaleString('zh-CN')}</span>
                          <span className="text-[#888]">·</span>
                          <span>{formatDuration(exec.started_at, exec.completed_at)}</span>
                          <span className="text-[#888]">·</span>
                          <span className="font-mono text-[#888]">{exec.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </div>

                    {exec.status === 'completed' && exec.result && (
                      <span className="text-xs text-[#5B7553] font-medium truncate lg:max-w-xs">
                        执行成功
                      </span>
                    )}
                    {exec.status === 'failed' && exec.error && (
                      <span className="text-xs text-[#A0453A] truncate lg:max-w-xs">
                        {exec.error.slice(0, 60)}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[#1d1d1f]/20 animate-fade-in space-y-3 pt-3 sm:px-5">
                      {exec.params && (
                        <div>
                          <h5 className="text-xs font-medium text-[#888] mb-1">参数</h5>
                          <pre className="text-xs bg-[#F7F7F7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f]">
                            {formatJson(exec.params)}
                          </pre>
                        </div>
                      )}
                      {exec.error && (
                        <div>
                          <h5 className="text-xs font-medium text-[#A0453A] mb-1">错误信息</h5>
                          <pre className="text-xs bg-[#A0453A]/5 rounded-xl p-3 text-[#A0453A] overflow-x-auto">
                            {exec.error}
                          </pre>
                        </div>
                      )}
                      {exec.result && (
                        <div>
                          <h5 className="text-xs font-medium text-[#888] mb-1">执行结果</h5>
                          <pre className="text-xs bg-[#F7F7F7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f] max-h-48 overflow-y-auto">
                            {formatJson(exec.result)}
                          </pre>
                        </div>
                      )}
                      {progress[exec.id] && progress[exec.id].length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-[#888] mb-1">执行日志</h5>
                          <div className="bg-[#1d1d1f] rounded-xl p-3 max-h-48 overflow-y-auto">
                            {progress[exec.id].map((line, i) => (
                              <div key={i} className={`text-xs py-0.5 font-mono ${getLogColor(line)}`}>
                                <span className="text-[#888] select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
