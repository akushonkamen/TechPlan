import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { CARD, SPINNER } from '../lib/design';

const SKILL_NAMES: Record<string, string> = {
  research: '采集',
  extract: '抽取',
  report: '报告生成',
  'track-competitor': '友商追踪',
  'sync-graph': '图谱同步',
  optimize: '技能优化',
};

const STATUS_COLORS: Record<string, string> = {
  completed: '#34c759',
  failed: '#ff3b30',
  running: '#0071e3',
  timeout: '#ff9f0a',
};

interface Execution {
  id: string;
  skill_name: string;
  params: Record<string, unknown> | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  result: unknown;
  error: string | null;
}

type StatusFilter = 'all' | 'completed' | 'failed';

export default function ExecutionHistory() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    loadExecutions();
  }, []);

  const loadExecutions = async () => {
    try {
      const res = await fetch('/api/skill/executions');
      if (res.ok) {
        setExecutions(await res.json());
      }
    } catch (err) {
      console.error('Failed to load executions:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? executions
    : executions.filter(e => e.status === filter);

  if (loading) {
    return (
      <div className={`${CARD} p-12 flex items-center justify-center`}>
        <div className={SPINNER} />
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className={`${CARD} p-12 text-center text-sm text-[#86868b]`}>
        暂无执行记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#86868b]" />
        {(['all', 'completed', 'failed'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-[980px] text-xs font-medium transition-all ${
              filter === f
                ? 'bg-[#1d1d1f] text-white'
                : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
            }`}
          >
            {f === 'all' ? '全部' : f === 'completed' ? '已完成' : '失败'}
          </button>
        ))}
        <span className="text-xs text-[#86868b] ml-2">{filtered.length} 条记录</span>
      </div>

      {/* Execution list */}
      <div className={`${CARD} divide-y divide-[#f5f5f7]`}>
        {filtered.map(exec => (
          <div key={exec.id}>
            <button
              onClick={() => setExpanded(expanded === exec.id ? null : exec.id)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#f5f5f7]/50 transition-colors text-left"
            >
              {expanded === exec.id
                ? <ChevronDown className="w-4 h-4 text-[#86868b] shrink-0" />
                : <ChevronRight className="w-4 h-4 text-[#86868b] shrink-0" />
              }
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[exec.status] ?? '#aeaeb5' }}
              />
              <span className="text-sm font-medium text-[#1d1d1f]">
                {SKILL_NAMES[exec.skill_name] ?? exec.skill_name}
              </span>
              <span className="text-xs text-[#aeaeb5] font-mono">{exec.id.slice(0, 12)}</span>
              <span className="ml-auto text-xs text-[#86868b]">
                {exec.started_at ? new Date(exec.started_at).toLocaleString('zh-CN') : ''}
              </span>
            </button>

            {expanded === exec.id && (
              <div className="px-5 pb-5 space-y-3 animate-fade-in">
                {/* Params */}
                {exec.params && Object.keys(exec.params).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[#86868b] mb-1">参数</div>
                    <pre className="text-xs bg-[#f5f5f7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f] whitespace-pre-wrap">
                      {JSON.stringify(exec.params, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Error */}
                {exec.error && (
                  <div>
                    <div className="text-xs font-medium text-[#ff3b30] mb-1">错误</div>
                    <pre className="text-xs bg-[#ff3b30]/5 rounded-xl p-3 text-[#ff3b30] whitespace-pre-wrap">
                      {exec.error}
                    </pre>
                  </div>
                )}

                {/* Result */}
                {exec.result != null && (
                  <div>
                    <div className="text-xs font-medium text-[#86868b] mb-1">结果</div>
                    <pre className="text-xs bg-[#f5f5f7] rounded-xl p-3 overflow-x-auto text-[#1d1d1f] whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {typeof exec.result === 'string'
                        ? exec.result
                        : JSON.stringify(exec.result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Meta */}
                <div className="flex gap-6 text-xs text-[#aeaeb5]">
                  {exec.completed_at && (
                    <span>完成于 {new Date(exec.completed_at).toLocaleString('zh-CN')}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
