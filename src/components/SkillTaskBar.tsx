// Global floating skill task bar — Apple aesthetic
// Supports task archiving and result presentation

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle, X, Terminal, Archive, Clock } from 'lucide-react';

interface SkillExecution {
  id: string;
  skill_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

interface ArchivedTask {
  id: string;
  skillName: string;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  duration: string;
  resultSummary: string;
  logs: string[];
}

function formatDuration(start: string, end?: string | null): string {
  const s = new Date(start).getTime();
  if (isNaN(s)) return '?';
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function skillLabel(name: string): string {
  const map: Record<string, string> = {
    research: '情报采集',
    extract: '知识抽取',
    report: '报告生成',
    'track-competitor': '友商追踪',
    'sync-graph': '图谱同步',
    optimize: '优化循环',
  };
  return map[name] || name;
}

function getResultSummary(skillName: string, logs: string[]): string {
  // Try to extract result summary from logs
  for (let i = logs.length - 1; i >= 0; i--) {
    const line = logs[i];
    if (line.includes('完成') || line.includes('采集') || line.includes('抽取') || line.includes('同步') || line.includes('生成')) {
      return line.slice(0, 80);
    }
  }
  // Default summaries by skill type
  const defaults: Record<string, string> = {
    research: '情报采集完成',
    extract: '知识抽取完成',
    report: '报告生成完成',
    'track-competitor': '友商追踪完成',
    'sync-graph': '图谱同步完成',
    optimize: '优化循环完成',
  };
  return defaults[skillName] || '执行完成';
}

function getLogColor(line: string): string {
  if (line.startsWith('思考')) return 'text-purple-300';
  if (line.startsWith('调用')) return 'text-cyan-300';
  if (line.startsWith('结果')) return 'text-[#34c759]';
  if (line.startsWith('错误') || line.startsWith('Error') || line.startsWith('[stderr]') || line.startsWith('启动失败')) return 'text-[#ff3b30]';
  if (line.startsWith('超时') || line.startsWith('失败')) return 'text-[#ff3b30]';
  if (line.includes('完成')) return 'text-[#34c759] font-medium';
  if (line.startsWith('系统')) return 'text-[#86868b]';
  return 'text-[#e8e8ed]';
}

export default function SkillTaskBar() {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoSelected = useRef(false);
  const archivedIds = useRef(new Set<string>());

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/skill/executions');
      if (res.ok) setExecutions(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchExecutions();
    const id = setInterval(fetchExecutions, 2000);
    return () => clearInterval(id);
  }, [fetchExecutions]);

  // Auto-archive completed tasks after 5 seconds
  useEffect(() => {
    const completedExecs = executions.filter(e =>
      (e.status === 'completed' || e.status === 'failed') &&
      !archivedIds.current.has(e.id)
    );

    if (completedExecs.length === 0) return;

    const timers = completedExecs.map(exec => {
      archivedIds.current.add(exec.id);
      return setTimeout(() => {
        const logs = progress[exec.id] || [];
        setArchivedTasks(prev => {
          const entry: ArchivedTask = {
            id: exec.id,
            skillName: exec.skill_name,
            status: exec.status as 'completed' | 'failed',
            startedAt: exec.started_at,
            completedAt: exec.completed_at || new Date().toISOString(),
            duration: formatDuration(exec.started_at, exec.completed_at),
            resultSummary: exec.status === 'completed'
              ? getResultSummary(exec.skill_name, logs)
              : exec.error || '执行失败',
            logs: logs.slice(-20), // Keep last 20 log lines
          };
          return [entry, ...prev].slice(0, 10); // Max 10 archived
        });
      }, 5000);
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, [executions, progress]);

  useEffect(() => {
    const running = executions.filter(e => e.status === 'running');
    if (running.length > 0 && !autoSelected.current) {
      setExpanded(true);
      setActiveId(running[0].id);
      autoSelected.current = true;
    }
    if (activeId) {
      const sel = executions.find(e => e.id === activeId);
      if (sel && sel.status !== 'running' && running.length > 0) {
        setActiveId(running[0].id);
      }
    }
  }, [executions, activeId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let totalKnown = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/skill/${activeId}/progress?after=${totalKnown}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.lines && data.lines.length > 0) {
            setProgress(prev => ({
              ...prev,
              [activeId]: [...(prev[activeId] || []), ...data.lines],
            }));
            totalKnown = data.total;
          } else {
            totalKnown = data.total || totalKnown;
          }
        }
      } catch (err) {
        console.error('Failed to poll progress:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress, activeId]);

  const visible = executions.filter(e =>
    e.status === 'running' || !dismissed.has(e.id)
  );
  const running = visible.filter(e => e.status === 'running');
  const completed = visible.filter(e => e.status !== 'running');
  const hasRunning = running.length > 0;

  const showBar = visible.length > 0 || archivedTasks.length > 0;

  if (!showBar) return null;

  const displayId = activeId || running[0]?.id || completed[0]?.id;
  const displayExec = executions.find(e => e.id === displayId);
  const displayLogs = displayId ? (progress[displayId] || []) : [];

  const handleTabClick = (id: string) => {
    setActiveId(id);
    autoSelected.current = false;
  };

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50" style={{ width: 460 }}>
      {expanded && (
        <div className="bg-white/95 backdrop-blur-xl rounded-[18px] shadow-2xl overflow-hidden border border-[#d2d2d7] animate-slide-up">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#1d1d1f] text-[#e8e8ed]">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium truncate">
                {displayExec ? skillLabel(displayExec.skill_name) : '任务'}
              </span>
              {displayExec?.status === 'running' && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#0071e3] shrink-0" />
                  <span className="text-xs text-[#86868b] shrink-0">
                    {formatDuration(displayExec.started_at)}
                  </span>
                </>
              )}
              {displayExec?.status === 'completed' && (
                <CheckCircle2 className="w-3 h-3 text-[#34c759] shrink-0" />
              )}
              {displayExec?.status === 'failed' && (
                <XCircle className="w-3 h-3 text-[#ff3b30] shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {displayExec && (
                <span className="text-xs text-[#86868b] font-mono">{displayExec.id.slice(0, 8)}</span>
              )}
              {hasRunning && displayExec?.status === 'running' && (
                <button
                  onClick={async () => {
                    if (displayExec) {
                      await fetch(`/api/skill/${displayExec.id}/cancel`, { method: 'POST' });
                      fetchExecutions();
                    }
                  }}
                  className="text-xs text-[#ff3b30] hover:text-[#ff3b30]/80 px-2 py-0.5 rounded-[980px] border border-[#ff3b30]/30 transition-colors"
                >
                  取消
                </button>
              )}
            </div>
          </div>

          {/* Terminal body */}
          <div
            ref={logContainerRef}
            className="bg-[#1d1d1f] text-[#e8e8ed] px-4 py-2 overflow-y-auto font-mono text-xs rounded-none"
            style={{ maxHeight: 260 }}
          >
            {displayLogs.length === 0 ? (
              <div className="text-[#86868b] py-3 flex items-center gap-2">
                {hasRunning ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>正在启动 Claude Code...</span>
                  </>
                ) : (
                  <span>暂无输出</span>
                )}
              </div>
            ) : (
              displayLogs.map((line, i) => (
                <div key={i} className={`py-0.5 leading-relaxed ${getLogColor(line)}`}>
                  <span className="text-[#86868b] select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                  {line}
                </div>
              ))
            )}
          </div>

          {/* Tab bar */}
          {visible.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f5f7] overflow-x-auto">
              {running.map(exec => (
                <button
                  key={exec.id}
                  onClick={() => handleTabClick(exec.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-[980px] text-xs whitespace-nowrap transition-all ${
                    displayId === exec.id
                      ? 'bg-[#0071e3] text-white font-medium'
                      : 'bg-white text-[#86868b] hover:bg-white/80'
                  }`}
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {skillLabel(exec.skill_name)}
                </button>
              ))}
              {completed.slice(0, 5).map(exec => (
                <button
                  key={exec.id}
                  onClick={() => handleTabClick(exec.id)}
                  className={`group flex items-center gap-1 px-3 py-1 rounded-[980px] text-xs whitespace-nowrap transition-all ${
                    displayId === exec.id
                      ? 'bg-[#d2d2d7] text-[#1d1d1f] font-medium'
                      : 'bg-white text-[#86868b] hover:bg-white/80'
                  }`}
                >
                  {exec.status === 'completed' ? (
                    <CheckCircle2 className="w-3 h-3 text-[#34c759]" />
                  ) : (
                    <XCircle className="w-3 h-3 text-[#ff3b30]" />
                  )}
                  {skillLabel(exec.skill_name)}
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDismiss(exec.id); }}
                    className="ml-0.5 text-[#aeaeb5] hover:text-[#ff3b30] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {visible.length === 1 && completed.length === 1 && (
            <div className="px-4 py-2 bg-[#f5f5f7] flex justify-end">
              <button
                onClick={() => handleDismiss(completed[0].id)}
                className="text-xs text-[#86868b] hover:text-[#1d1d1f] flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> 关闭
              </button>
            </div>
          )}

          {/* Archived tasks section */}
          {archivedTasks.length > 0 && (
            <div className="border-t border-[#f5f5f7]">
              <button
                onClick={() => setShowArchive(!showArchive)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-[#86868b] hover:text-[#1d1d1f] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" />
                  已归档 ({archivedTasks.length})
                </span>
                {showArchive ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
              {showArchive && (
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  <div className="space-y-2">
                    {archivedTasks.map(task => (
                      <div key={task.id} className="group">
                        <button
                          onClick={() => setExpandedArchiveId(expandedArchiveId === task.id ? null : task.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] rounded-xl text-left hover:bg-[#e8e8ed] transition-colors"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#34c759] shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-[#ff3b30] shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[#1d1d1f]">{skillLabel(task.skillName)}</span>
                              <span className="flex items-center gap-1 text-[10px] text-[#aeaeb5]">
                                <Clock className="w-2.5 h-2.5" />
                                {task.duration}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#86868b] truncate mt-0.5">{task.resultSummary}</p>
                          </div>
                          <span className="text-[10px] text-[#aeaeb5] shrink-0">
                            {new Date(task.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </button>
                        {expandedArchiveId === task.id && task.logs.length > 0 && (
                          <div className="mt-1 bg-[#1d1d1f] text-[#e8e8ed] rounded-xl p-2 max-h-32 overflow-y-auto">
                            {task.logs.map((line, i) => (
                              <div key={i} className={`text-[10px] py-0.5 font-mono ${getLogColor(line)}`}>
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium
          transition-all duration-200
          ${expanded ? 'rounded-b-[18px]' : 'rounded-[18px]'}
          ${hasRunning
            ? 'bg-[#0071e3] text-white shadow-lg shadow-[#0071e3]/20'
            : 'bg-white/95 backdrop-blur-xl text-[#1d1d1f] shadow-lg border border-[#d2d2d7]'
          }
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasRunning ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#34c759] shrink-0" />
          )}
          <span className="truncate">
            {hasRunning
              ? `${running.length} 个任务执行中`
              : completed.length > 0 ? '任务已完成' : archivedTasks.length > 0 ? `${archivedTasks.length} 个已归档` : '任务'}
          </span>
          {hasRunning && running[0] && (
            <span className="text-xs opacity-75 shrink-0">
              {skillLabel(running[0].skill_name)} · {formatDuration(running[0].started_at)}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronUp className="w-4 h-4 shrink-0" />}
      </button>
    </div>
  );
}
