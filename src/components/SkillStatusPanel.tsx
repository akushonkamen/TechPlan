// Skill execution status panel - shows real-time progress from Claude Code

import React, { useRef, useEffect, useState } from 'react';
import type { SkillExecutionState } from '../hooks/useSkillExecutor';

interface SkillStatusPanelProps {
  state: SkillExecutionState;
  skillName: string;
  onCancel?: () => void;
  onReset?: () => void;
}

function formatElapsedTime(startedAt: string | null): string {
  if (!startedAt) return '0s';
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return '0s';
  const now = Date.now();
  const seconds = Math.floor((now - start) / 1000);
  if (seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function parseProgressMessage(raw: string): { label: string; detail: string } | null {
  try {
    const parsed = JSON.parse(raw);
    switch (parsed.type) {
      case 'tool_start':
        return { label: `准备调用工具: ${parsed.tool || ''}`, detail: '' };
      case 'tool_use':
        return {
          label: `使用工具: ${parsed.tool}`,
          detail: parsed.detail ? ` — ${parsed.detail.slice(0, 100)}` : '',
        };
      case 'tool_done':
        return { label: '工具执行完成', detail: '' };
      case 'text':
        return { label: 'Claude 正在分析...', detail: parsed.preview ? parsed.preview.slice(0, 100) : '' };
      default:
        return null;
    }
  } catch {
    return { label: raw.slice(0, 100), detail: '' };
  }
}

export function SkillStatusPanel({ state, skillName, onCancel, onReset }: SkillStatusPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Re-render every second to update elapsed time
  useEffect(() => {
    if (state.status !== 'running') return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [state.status]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.progress]);

  if (state.status === 'idle') return null;

  const lastProgress = state.progress.length > 0
    ? parseProgressMessage(state.progress[state.progress.length - 1])
    : null;

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {state.status === 'running' && (
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          )}
          {state.status === 'completed' && (
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
          )}
          {state.status === 'failed' && (
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
          {state.status === 'timeout' && (
            <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full" />
          )}
          <span className="font-medium text-sm">
            {skillName === 'research' ? '情报采集' :
             skillName === 'extract' ? '知识抽取' :
             skillName === 'report' ? '报告生成' :
             skillName === 'track-competitor' ? '友商追踪' :
             skillName === 'sync-graph' ? '图谱同步' :
             skillName === 'optimize' ? '优化循环' :
             skillName}
          </span>
          <span className="text-xs text-gray-400">
            {state.status === 'running' ? '执行中...' :
             state.status === 'completed' ? '完成' :
             state.status === 'failed' ? '失败' :
             '超时'}
          </span>
          {state.executionId && (
            <span className="text-xs text-gray-300 font-mono">#{state.executionId.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {state.status === 'running' && (
            <span className="text-xs text-gray-400">
              已耗时 {formatElapsedTime(state.startedAt)}
            </span>
          )}
          {state.status === 'running' && onCancel && (
            <button onClick={onCancel} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded">
              取消
            </button>
          )}
          {state.status !== 'running' && onReset && (
            <button onClick={onReset} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded">
              关闭
            </button>
          )}
        </div>
      </div>

      {/* Current activity */}
      {state.status === 'running' && lastProgress && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
          <span className="text-xs text-blue-700 truncate">
            {lastProgress.label}{lastProgress.detail}
          </span>
        </div>
      )}

      {/* Running indicator (no progress yet) */}
      {state.status === 'running' && !lastProgress && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse shrink-0" />
          <span className="text-xs text-gray-500">正在启动 Claude Code...</span>
        </div>
      )}

      {/* Progress log */}
      {state.progress.length > 0 && (
        <div ref={logRef} className="bg-gray-900 text-gray-100 rounded-lg p-3 max-h-48 overflow-y-auto mb-3">
          <div className="text-xs text-gray-400 mb-2 font-mono">
            ── Claude Code 实时输出 ({state.progress.length} 条) ──
          </div>
          {state.progress.map((raw, i) => {
            const parsed = parseProgressMessage(raw);
            if (!parsed) return null;
            return (
              <div key={i} className="text-xs font-mono py-0.5 flex items-start gap-2">
                <span className="text-gray-500 shrink-0 select-none">{String(i + 1).padStart(3, ' ')}│</span>
                <span className={
                  parsed.label.includes('工具') ? 'text-cyan-300' :
                  parsed.label.includes('Claude') ? 'text-green-300' :
                  'text-gray-300'
                }>
                  {parsed.label}
                  {parsed.detail && <span className="text-gray-500">{parsed.detail}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm border border-red-100">
          <span className="font-medium">错误: </span>{state.error}
        </div>
      )}

      {/* Result summary */}
      {state.status === 'completed' && state.result && (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm border border-green-100">
          {typeof state.result === 'object'
            ? state.result.totalCollected
              ? `采集了 ${state.result.totalCollected} 篇文档`
              : state.result.extractionStats
                ? `抽取了 ${state.result.extractionStats.entities ?? 0} 个实体, ${state.result.extractionStats.relations ?? 0} 个关系`
                : state.result.title ?? '执行完成'
            : '执行完成'
          }
        </div>
      )}
    </div>
  );
}
