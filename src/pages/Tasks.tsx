import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Terminal, Clock, Activity } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
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
  optimize: '优化循环',
};

function skillLabel(name: string): string {
  return SKILL_LABELS[name] || name;
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
};

const STATUS_LABELS: Record<string, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  cancelled: '已取消',
};

// ── Main Component ──

export default function Tasks() {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch executions list every 2s
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

  useEffect(() => {
    fetchExecutions();
    const id = setInterval(fetchExecutions, 2000);
    return () => clearInterval(id);
  }, [fetchExecutions]);

  // Auto-select first running task
  useEffect(() => {
    if (!activeId) {
      const running = executions.find(e => e.status === 'running');
      if (running) setActiveId(running.id);
    }
  }, [executions, activeId]);

  // Poll progress for active running task
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (!activeId) return;

    const exec = executions.find(e => e.id === activeId);
    if (!exec || exec.status !== 'running') return;

    let totalKnown = progress[activeId]?.length || 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/skill/${activeId}/progress?after=${totalKnown}`);
        if (res.ok) {
          const data = await res.json();
          if (data.total < totalKnown) totalKnown = 0;
          if (data.lines?.length > 0) {
            setProgress(prev => ({
              ...prev,
              [activeId]: [...(prev[activeId] || []), ...data.lines],
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
  }, [activeId, executions]);

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress, activeId]);

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/skill/${id}/cancel`, { method: 'POST' });
      if (!res.ok) alert('取消任务失败');
    } catch {
      alert('取消任务失败');
    }
    fetchExecutions();
  };

  // Filtered lists
  const running = executions.filter(e => e.status === 'running');
  const filtered = executions.filter(e => {
    if (filter === 'all') return true;
    return e.status === filter;
  });

  const displayLogs = activeId ? (progress[activeId] || []) : [];

  // Force re-render every second for duration timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (running.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [running.length]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <PageHeader title="任务中心" description="查看和管理所有任务执行状态" />

      {/* Running tasks */}
      {running.length > 0 && (
        <div className="space-y-3">
          {running.map(exec => {
            const isActive = activeId === exec.id;
            const logs = isActive ? displayLogs : (progress[exec.id] || []);
            const style = STATUS_STYLES[exec.status] || STATUS_STYLES.running;
            const Icon = style.icon;

            return (
              <div key={exec.id} className={`${CARD} overflow-hidden`}>
                {/* Card header */}
                <div
                  className="px-4 py-4 flex flex-col gap-3 cursor-pointer hover:bg-[#F7F7F7]/50 transition-colors sm:px-5 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setActiveId(isActive ? null : exec.id)}
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

                {/* Terminal log */}
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
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Activity className="w-12 h-12" />}
            title="暂无任务"
            description="在报告或主题页面触发技能后，任务将在此显示"
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(exec => {
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

                    {/* Quick result summary for completed */}
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

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[#1d1d1f]/20 animate-fade-in space-y-3 pt-3 sm:px-5">
                      {/* Params */}
                      {exec.params && (
                        <div>
                          <h5 className="text-xs font-medium text-[#888] mb-1">参数</h5>
                          <pre className="text-xs bg-[#F7F7F7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f]">
                            {(() => { try { return JSON.stringify(JSON.parse(exec.params), null, 2); } catch { return exec.params; } })()}
                          </pre>
                        </div>
                      )}

                      {/* Error */}
                      {exec.error && (
                        <div>
                          <h5 className="text-xs font-medium text-[#A0453A] mb-1">错误信息</h5>
                          <pre className="text-xs bg-[#A0453A]/5 rounded-xl p-3 text-[#A0453A] overflow-x-auto">
                            {exec.error}
                          </pre>
                        </div>
                      )}

                      {/* Result */}
                      {exec.result && (
                        <div>
                          <h5 className="text-xs font-medium text-[#888] mb-1">执行结果</h5>
                          <pre className="text-xs bg-[#F7F7F7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f] max-h-48 overflow-y-auto">
                            {(() => { try { return JSON.stringify(JSON.parse(exec.result), null, 2); } catch { return exec.result; } })()}
                          </pre>
                        </div>
                      )}

                      {/* Logs */}
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
