// Global floating skill task bar — poll-based progress, no WS dependency

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle, X, Terminal } from 'lucide-react';

interface SkillExecution {
  id: string;
  skill_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
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

function getLogColor(line: string): string {
  if (line.startsWith('思考')) return 'text-purple-300';
  if (line.startsWith('调用')) return 'text-cyan-300';
  if (line.startsWith('结果')) return 'text-emerald-300';
  if (line.startsWith('错误') || line.startsWith('Error') || line.startsWith('[stderr]') || line.startsWith('启动失败')) return 'text-red-400';
  if (line.startsWith('超时') || line.startsWith('失败')) return 'text-red-400';
  if (line.includes('完成')) return 'text-green-400 font-medium';
  if (line.startsWith('系统')) return 'text-gray-500';
  return 'text-gray-300';
}

export default function SkillTaskBar() {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoSelected = useRef(false);

  // ---- Poll execution list ----
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

  // ---- Auto-expand & auto-select ----
  useEffect(() => {
    const running = executions.filter(e => e.status === 'running');

    // Auto-expand when running tasks first appear
    if (running.length > 0 && !autoSelected.current) {
      setExpanded(true);
      setActiveId(running[0].id);
      autoSelected.current = true;
    }

    // When selected task finishes, switch to first running or keep
    if (activeId) {
      const sel = executions.find(e => e.id === activeId);
      if (sel && sel.status !== 'running' && running.length > 0) {
        setActiveId(running[0].id);
      }
    }
  }, [executions]); // intentionally not including activeId

  // ---- Poll progress for active execution ----
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
      } catch { /* ignore */ }
    };

    // Initial fetch + polling
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeId]);

  // ---- Auto-scroll ----
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress, activeId]);

  // ---- Derived state ----
  const visible = executions.filter(e =>
    e.status === 'running' || !dismissed.has(e.id)
  );
  const running = visible.filter(e => e.status === 'running');
  const completed = visible.filter(e => e.status !== 'running');
  const hasRunning = running.length > 0;

  if (visible.length === 0) return null;

  const displayId = activeId || running[0]?.id || completed[0]?.id;
  const displayExec = executions.find(e => e.id === displayId);
  const displayLogs = displayId ? (progress[displayId] || []) : [];

  const handleTabClick = (id: string) => {
    setActiveId(id);
    // Reset auto-selected so it won't override future manual selections
    autoSelected.current = false;
  };

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  return (
    <div className="fixed bottom-0 right-4 z-50" style={{ width: 480 }}>
      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white rounded-t-xl border border-b-0 border-gray-200 shadow-2xl overflow-hidden">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-gray-300">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium truncate">
                {displayExec ? skillLabel(displayExec.skill_name) : '任务'}
              </span>
              {displayExec?.status === 'running' && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400 shrink-0" />
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatDuration(displayExec.started_at)}
                  </span>
                </>
              )}
              {displayExec?.status === 'completed' && (
                <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
              )}
              {displayExec?.status === 'failed' && (
                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {displayExec && (
                <span className="text-xs text-gray-500 font-mono">{displayExec.id.slice(0, 8)}</span>
              )}
              {hasRunning && displayExec?.status === 'running' && (
                <button
                  onClick={async () => {
                    if (displayExec) {
                      await fetch(`/api/skill/${displayExec.id}/cancel`, { method: 'POST' });
                      fetchExecutions();
                    }
                  }}
                  className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 border border-red-800 rounded transition-colors"
                >
                  取消
                </button>
              )}
            </div>
          </div>

          {/* Terminal body */}
          <div
            ref={logContainerRef}
            className="bg-gray-900 text-gray-200 px-4 py-2 overflow-y-auto font-mono text-xs"
            style={{ maxHeight: 280 }}
          >
            {displayLogs.length === 0 ? (
              <div className="text-gray-500 py-3 flex items-center gap-2">
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
                  <span className="text-gray-600 select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>
                  {line}
                </div>
              ))
            )}
          </div>

          {/* Tab bar for multiple executions */}
          {visible.length > 1 && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 border-t border-gray-100 overflow-x-auto">
              {running.map(exec => (
                <button
                  key={exec.id}
                  onClick={() => handleTabClick(exec.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                    displayId === exec.id
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
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
                  className={`group flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                    displayId === exec.id
                      ? 'bg-gray-200 text-gray-800 font-medium'
                      : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {exec.status === 'completed' ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  {skillLabel(exec.skill_name)}
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDismiss(exec.id); }}
                    className="ml-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Single completed item: dismiss */}
          {visible.length === 1 && completed.length === 1 && (
            <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => handleDismiss(completed[0].id)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> 关闭
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium
          border border-gray-200 shadow-lg transition-colors
          ${expanded ? 'rounded-b-xl' : 'rounded-xl'}
          ${hasRunning ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasRunning ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <span className="truncate">
            {hasRunning
              ? `${running.length} 个任务执行中`
              : completed.length > 0 ? '任务已完成' : '任务'}
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
