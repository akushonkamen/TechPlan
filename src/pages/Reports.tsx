import { useState, useEffect, useRef, type FC } from 'react';
import { FileText, Calendar, Trash2, ChevronDown, ChevronUp, Network, TrendingUp, AlertTriangle, Zap, Flag, Clock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import EmptyState from '../components/EmptyState';
import { fetchTopics } from '../services/topicService';
import { CARD, INPUT, SPINNER } from '../lib/design';

// ── Types ──

interface Signal {
  type: 'opportunity' | 'threat' | 'trend' | 'milestone';
  title: string;
  description: string;
  confidence: number;
}

interface ReportSection {
  id: string;
  title: string;
  thesis: string;
  content: string;
  highlights: string[];
  signals: Signal[];
  entityRefs: string[];
}

interface TimelineEntry {
  date: string;
  event: string;
  significance: string;
  entityRefs: string[];
}

interface ReportContent {
  executiveSummary: {
    overview: string;
    keyPoints: string[];
    confidence: 'high' | 'medium' | 'low';
    period: { start: string; end: string };
  };
  sections: ReportSection[];
  timeline: TimelineEntry[];
  metrics: {
    documentsAnalyzed: number;
    entitiesCovered: number;
    sourcesCredibility: string;
  };
}

interface Report {
  id: string;
  title: string;
  type: string;
  summary?: string;
  content?: ReportContent | string;
  generated_at?: string;
  topic_name?: string;
  topic_id?: string;
  period_start?: string;
  period_end?: string;
  metadata?: Record<string, any>;
}

// ── Signal Badge ──

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string; icon: typeof TrendingUp }> = {
  opportunity: { bg: 'bg-[#34c759]/10', text: 'text-[#34c759]', label: '机会', icon: TrendingUp },
  threat:      { bg: 'bg-[#ff3b30]/10', text: 'text-[#ff3b30]', label: '威胁', icon: AlertTriangle },
  trend:       { bg: 'bg-[#0071e3]/10', text: 'text-[#0071e3]', label: '趋势', icon: Zap },
  milestone:   { bg: 'bg-[#af52de]/10', text: 'text-[#af52de]', label: '里程碑', icon: Flag },
};

const SignalBadge: FC<{ signal: Signal }> = ({ signal }) => {
  const style = SIGNAL_STYLES[signal.type] ?? SIGNAL_STYLES.trend;
  const Icon = style.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <Icon className="w-3 h-3" />
      <span>{style.label}</span>
      <span className="opacity-60">·</span>
      <span>{signal.title}</span>
    </div>
  );
}

// ── Confidence Badge ──

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-[#34c759]/10', text: 'text-[#34c759]', label: '高置信度' },
  medium: { bg: 'bg-[#ff9f0a]/10', text: 'text-[#ff9f0a]', label: '中置信度' },
  low:    { bg: 'bg-[#ff3b30]/10', text: 'text-[#ff3b30]', label: '低置信度' },
};

const ConfidenceBadge: FC<{ level: string }> = ({ level }) => {
  const style = CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

// ── Freshness Badge ──

type FreshnessLevel = 'fresh' | 'ok' | 'stale';

interface FreshnessInfo {
  level: FreshnessLevel;
  hoursAgo: number;
  label: string;
  timeHorizon: string;
}

// Calculate freshness based on report generation time and type
function calculateFreshness(generatedAt: string | undefined, reportType: string): FreshnessInfo {
  if (!generatedAt) {
    return { level: 'stale', hoursAgo: Infinity, label: '未知时间', timeHorizon: 'Unknown' };
  }

  const generatedTime = new Date(generatedAt).getTime();
  const now = Date.now();
  const hoursAgo = (now - generatedTime) / (1000 * 60 * 60);

  // Define freshness thresholds based on report type
  const thresholds: Record<string, { fresh: number; ok: number }> = {
    daily: { fresh: 4, ok: 24 },      // Daily: fresh < 4h, ok < 24h
    weekly: { fresh: 12, ok: 72 },    // Weekly: fresh < 12h, ok < 3 days
    alert: { fresh: 2, ok: 12 },      // Alert: fresh < 2h, ok < 12h
    monthly: { fresh: 24, ok: 168 },  // Monthly: fresh < 1 day, ok < 1 week
    quarterly: { fresh: 48, ok: 336 }, // Quarterly: fresh < 2 days, ok < 2 weeks
    tech_topic: { fresh: 24, ok: 168 }, // Tech topic: fresh < 1 day, ok < 1 week
    competitor: { fresh: 24, ok: 168 }, // Competitor: fresh < 1 day, ok < 1 week
  };

  const threshold = thresholds[reportType] || thresholds.weekly;

  let level: FreshnessLevel;
  let label: string;

  if (hoursAgo <= threshold.fresh) {
    level = 'fresh';
    label = '最新';
  } else if (hoursAgo <= threshold.ok) {
    level = 'ok';
    label = '正常';
  } else {
    level = 'stale';
    label = '过期';
  }

  // Calculate time horizon label
  let timeHorizon: string;
  if (hoursAgo < 1) {
    timeHorizon = 'Past 24h';
  } else if (hoursAgo < 24) {
    timeHorizon = `Past 24h (${Math.round(hoursAgo)}h ago)`;
  } else if (hoursAgo < 168) {
    timeHorizon = `Past 7 days (${Math.round(hoursAgo / 24)}d ago)`;
  } else if (hoursAgo < 720) {
    timeHorizon = `Past 30 days (${Math.round(hoursAgo / 24)}d ago)`;
  } else {
    timeHorizon = `Older (${Math.round(hoursAgo / 24)}d ago)`;
  }

  return { level, hoursAgo, label, timeHorizon };
}

const FRESHNESS_STYLES: Record<FreshnessLevel, { bg: string; text: string; icon: typeof CheckCircle }> = {
  fresh: { bg: 'bg-[#34c759]/10', text: 'text-[#34c759]', icon: CheckCircle },
  ok: { bg: 'bg-[#ff9f0a]/10', text: 'text-[#ff9f0a]', icon: Clock },
  stale: { bg: 'bg-[#ff3b30]/10', text: 'text-[#ff3b30]', icon: AlertCircle },
};

const FreshnessBadge: FC<{ freshness: FreshnessInfo }> = ({ freshness }) => {
  const style = FRESHNESS_STYLES[freshness.level];
  const Icon = style.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <Icon className="w-3 h-3" />
      <span>{freshness.label}</span>
    </div>
  );
}

// ── Timeline ──

const Timeline: FC<{ entries: TimelineEntry[] }> = ({ entries }) => {
  if (!entries?.length) return null;
  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-[#d2d2d7]" />
      <div className="space-y-4">
        {entries.map((entry, i) => (
          <div key={i} className="relative animate-fade-in">
            {/* Dot */}
            <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#0071e3] bg-white" />
            <div className="ml-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-[#0071e3]">{entry.date}</span>
                {entry.entityRefs?.map((ref, j) => (
                  <Link
                    key={j}
                    to={`/graph?highlight=${encodeURIComponent(ref)}`}
                    className="text-xs text-[#86868b] hover:text-[#0071e3] transition-colors"
                  >
                    @{ref}
                  </Link>
                ))}
              </div>
              <p className="text-sm text-[#1d1d1f] font-medium">{entry.event}</p>
              {entry.significance && (
                <p className="text-xs text-[#86868b] mt-1">So What? {entry.significance}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section Block ──

const SectionBlock: FC<{ section: ReportSection; topicId?: string }> = ({ section, topicId }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[#f5f5f7] rounded-2xl overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-start justify-between gap-4 text-left hover:bg-[#f5f5f7]/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-[#1d1d1f]">{section.title}</h4>
            {section.signals?.length > 0 && (
              <span className="text-xs text-[#86868b]">{section.signals.length} 信号</span>
            )}
          </div>
          <p className="text-sm text-[#0071e3] font-medium">{section.thesis}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#aeaeb5] shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-[#aeaeb5] shrink-0 mt-1" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 animate-fade-in border-t border-[#f5f5f7] pt-4">
          {/* Markdown content */}
          {section.content && (
            <div className="prose prose-sm max-w-none text-sm text-[#1d1d1f]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {section.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Highlights */}
          {section.highlights?.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-[#86868b] mb-2">关键要点</h5>
              <ul className="space-y-1.5">
                {section.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-[#1d1d1f] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3] mt-1.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Signals */}
          {section.signals?.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-[#86868b] mb-2">信号标记</h5>
              <div className="flex flex-wrap gap-2">
                {section.signals.map((s, i) => (
                  <SignalBadge key={i} signal={s} />
                ))}
              </div>
            </div>
          )}

          {/* Entity refs + graph link */}
          {section.entityRefs?.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              {topicId && (
                <Link
                  to={`/graph?topicId=${topicId}&highlight=${encodeURIComponent(section.entityRefs.join(','))}`}
                  className="inline-flex items-center gap-1.5 text-xs text-[#0071e3] hover:text-[#0062cc] hover:underline transition-colors"
                >
                  <Network className="w-3.5 h-3.5" />
                  查看相关图谱
                </Link>
              )}
              <span className="text-xs text-[#aeaeb5]">
                关联实体: {section.entityRefs.join('、')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [reportType, setReportType] = useState<string>('weekly');
  const [timeRangePreset, setTimeRangePreset] = useState<string>('auto'); // auto, 24h, 7d, 30d, custom
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skillStatus, setSkillStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(60); // seconds
  const mountedRef = useRef(true);
  const pollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      return;
    }

    const scheduleRefresh = () => {
      if (!mountedRef.current) return;
      refreshTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && autoRefresh) {
          loadData();
          scheduleRefresh();
        }
      }, refreshInterval * 1000);
    };

    scheduleRefresh();
  }, [autoRefresh, refreshInterval]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportsRes, topicsData] = await Promise.all([fetch('/api/reports'), fetchTopics()]);
      if (reportsRes.ok) {
        const raw: Report[] = await reportsRes.json();
        // Parse content if it's a string
        const parsed = raw.map(r => {
          if (typeof r.content === 'string') {
            try {
              return { ...r, content: JSON.parse(r.content) as ReportContent };
            } catch {
              return r;
            }
          }
          return r;
        });
        setReports(parsed);
      } else {
        setReports([]);
      }
      setTopics(topicsData);
      if (topicsData.length > 0 && !selectedTopicId) setSelectedTopicId(topicsData[0].id);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedTopicId || skillStatus === 'running') return;
    const topic = topics.find(t => t.id === selectedTopicId);
    if (!topic) return;

    // Build period parameter based on selection
    let period: { start: string; end: string } | undefined;
    if (timeRangePreset === 'custom' && customStartDate && customEndDate) {
      period = { start: customStartDate, end: customEndDate };
    } else if (timeRangePreset !== 'auto') {
      // Calculate preset ranges
      const now = new Date();
      const end = now.toISOString().split('T')[0];
      let start: string;
      switch (timeRangePreset) {
        case '24h':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case '7d':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case '30d':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        default:
          start = end;
      }
      period = { start, end };
    }

    setSkillStatus('running');
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopicId,
          reportType,
          period,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || '启动失败');

      const { executionId } = await res.json();

      const poll = async () => {
        let attempts = 0;
        const MAX_ATTEMPTS = 120;
        const doPoll = async () => {
          if (!mountedRef.current) return;
          attempts++;
          if (attempts > MAX_ATTEMPTS) {
            if (mountedRef.current) setSkillStatus('failed');
            return;
          }
          try {
            const statusRes = await fetch(`/api/skill/${executionId}/status`);
            if (statusRes.ok) {
              const status = await statusRes.json();
              if (status.status === 'completed') {
                if (mountedRef.current) {
                  setSkillStatus('completed');
                  await loadData();
                  setTimeout(() => { if (mountedRef.current) setSkillStatus('idle'); }, 3000);
                }
                return;
              } else if (status.status === 'failed') {
                if (mountedRef.current) setSkillStatus('failed');
                return;
              }
            }
          } catch { /* ignore */ }
          pollTimeoutRef.current = setTimeout(doPoll, 3000);
        };
        pollTimeoutRef.current = setTimeout(doPoll, 2000);
      };
      poll();
    } catch (error: unknown) {
      setSkillStatus('failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此报告？')) return;
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      await loadData();
    } catch {
      alert('删除报告失败');
    }
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      daily: '日报', weekly: '周报', monthly: '月报', quarterly: '季报',
      tech_topic: '技术专题', competitor: '友商分析', alert: '预警',
    };
    return map[type] || type;
  };

  const reportTypeOptions = [
    { value: 'daily', label: '日报' },
    { value: 'weekly', label: '周报' },
    { value: 'monthly', label: '月报' },
    { value: 'quarterly', label: '季报' },
    { value: 'tech_topic', label: '技术专题' },
    { value: 'competitor', label: '友商分析' },
    { value: 'alert', label: '预警' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="分析报告"
        description="选择时间范围和主题，系统将自动采集数据并生成报告（已自动去重）"
      >
        <select
          value={selectedTopicId}
          onChange={e => setSelectedTopicId(e.target.value)}
          className={INPUT}
        >
          <option value="">选择主题...</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={reportType}
          onChange={e => setReportType(e.target.value)}
          className={`${INPUT} w-auto`}
        >
          {reportTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={timeRangePreset}
          onChange={e => {
            setTimeRangePreset(e.target.value);
            if (e.target.value !== 'custom') {
              setCustomStartDate('');
              setCustomEndDate('');
            }
          }}
          className={`${INPUT} w-auto`}
        >
          <option value="auto">自动（根据报告类型）</option>
          <option value="24h">过去24小时</option>
          <option value="7d">过去7天</option>
          <option value="30d">过去30天</option>
          <option value="custom">自定义</option>
        </select>
        {timeRangePreset === 'custom' && (
          <>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className={INPUT}
              placeholder="开始日期"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className={INPUT}
              placeholder="结束日期"
            />
          </>
        )}
        <SkillButton onClick={handleGenerateReport} status={skillStatus} disabled={!selectedTopicId}>
          {skillStatus === 'running' ? '采集中...' : `生成${getTypeLabel(reportType)}`}
        </SkillButton>
        <div className="w-px h-8 bg-[#d2d2d7] mx-2" />
        {/* Auto-refresh controls */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
            autoRefresh
              ? 'bg-[#0071e3]/10 text-[#0071e3]'
              : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5e7]'
          }`}
          title={autoRefresh ? '关闭自动刷新' : '开启自动刷新'}
        >
          <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
          <span>自动刷新</span>
        </button>
        {autoRefresh && (
          <select
            value={refreshInterval.toString()}
            onChange={e => setRefreshInterval(Number(e.target.value))}
            className={`${INPUT} w-auto`}
            title="刷新间隔"
          >
            <option value="30">30秒</option>
            <option value="60">1分钟</option>
            <option value="120">2分钟</option>
            <option value="300">5分钟</option>
          </select>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className={SPINNER} />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="暂无报告"
          description="选择时间范围和主题后，系统将自动采集最新数据并生成报告（自动去重）"
        />
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const isExpanded = expandedId === report.id;
            const content = typeof report.content === 'object' ? report.content as ReportContent : null;
            const freshness = calculateFreshness(report.generated_at, report.type);

            return (
              <div key={report.id} className={`${CARD} overflow-hidden transition-all duration-200`}>
                {/* Header */}
                <div
                  className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-[#f5f5f7]/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-[#0071e3]/10 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-[#0071e3]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-[#1d1d1f] truncate">{report.title}</h4>
                        <FreshnessBadge freshness={freshness} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-[#86868b]">
                        <span className="px-2 py-0.5 bg-[#f5f5f7] rounded-full">{getTypeLabel(report.type)}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {report.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : '-'}
                        </span>
                        <span className="text-[#aeaeb5]">·</span>
                        <span className="text-[#86868b]">{freshness.timeHorizon}</span>
                        {report.topic_name && <span>{report.topic_name}</span>}
                        {content?.executiveSummary?.confidence && (
                          <ConfidenceBadge level={content.executiveSummary.confidence} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                      className="p-2 text-[#aeaeb5] hover:text-[#ff3b30] rounded-full hover:bg-[#ff3b30]/5 transition-all"
                      aria-label="删除报告"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#aeaeb5]" /> : <ChevronDown className="w-4 h-4 text-[#aeaeb5]" />}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-[#f5f5f7] animate-fade-in space-y-6">

                    {/* Executive Summary */}
                    {content?.executiveSummary ? (
                      <div>
                        <h5 className="text-xs font-medium text-[#86868b] mb-3">执行摘要</h5>
                        <div className="bg-[#0071e3]/5 rounded-2xl p-5 space-y-3">
                          <p className="text-sm text-[#1d1d1f] leading-relaxed">{content.executiveSummary.overview}</p>
                          {content.executiveSummary.keyPoints?.length > 0 && (
                            <ul className="space-y-1.5">
                              {content.executiveSummary.keyPoints.map((point, i) => (
                                <li key={i} className="text-sm text-[#1d1d1f] flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">{i + 1}</span>
                                  {point}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-4 pt-1 text-xs text-[#86868b]">
                            {content.executiveSummary.period?.start && (
                              <span>
                                覆盖周期: {content.executiveSummary.period.start} ~ {content.executiveSummary.period.end}
                              </span>
                            )}
                            <ConfidenceBadge level={content.executiveSummary.confidence ?? 'medium'} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      report.summary && (
                        <div>
                          <h5 className="text-xs font-medium text-[#86868b] mb-1.5">概要</h5>
                          <p className="text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line">{report.summary}</p>
                          {/* For old markdown reports, attempt to render raw content */}
                          {typeof report.content === 'string' && report.content.length > 100 && (
                            <div className="mt-4 text-sm text-[#1d1d1f] leading-relaxed whitespace-pre-line border-t border-[#f5f5f7] pt-4">
                              {report.content}
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {/* Data Timestamp & Staleness Warning */}
                    {report.generated_at && (
                      <div className={`rounded-xl p-4 ${freshness.level === 'stale' ? 'bg-[#ff3b30]/5 border border-[#ff3b30]/20' : 'bg-[#f5f5f7]'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-[#86868b]" />
                            <div className="text-xs text-[#86868b]">
                              <span>数据时间: </span>
                              <span className="font-medium text-[#1d1d1f]">
                                {new Date(report.generated_at).toLocaleString('zh-CN')}
                              </span>
                              <span className="mx-2">·</span>
                              <span>{freshness.timeHorizon}</span>
                            </div>
                          </div>
                          <FreshnessBadge freshness={freshness} />
                        </div>
                        {freshness.level === 'stale' && (
                          <div className="mt-3 flex items-start gap-2 text-xs text-[#ff3b30]">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                              数据已过期 (
                              {freshness.hoursAgo < 24
                                ? `${Math.round(freshness.hoursAgo)} 小时前`
                                : `${Math.round(freshness.hoursAgo / 24)} 天前`}
                              )。建议重新生成报告以获取最新情报。
                            </span>
                          </div>
                        )}
                        {freshness.level === 'ok' && report.type === 'daily' && freshness.hoursAgo > 12 && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-[#ff9f0a]">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>日报数据较旧，建议关注最新动态。</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sections */}
                    {content?.sections?.length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-[#86868b] mb-3">分析章节</h5>
                        <div className="space-y-3">
                          {content.sections.map(section => (
                            <SectionBlock key={section.id} section={section} topicId={report.topic_id} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline */}
                    {content?.timeline?.length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-[#86868b] mb-3">事件时间线</h5>
                        <Timeline entries={content.timeline} />
                      </div>
                    )}

                    {/* Metrics + Graph link */}
                    <div className="flex items-center gap-4 pt-2">
                      {content?.metrics && (
                        <div className="flex items-center gap-3">
                          <div className="bg-[#f5f5f7] rounded-xl px-4 py-2.5 text-xs text-[#86868b]">
                            文档 {content.metrics.documentsAnalyzed ?? '-'} · 实体 {content.metrics.entitiesCovered ?? '-'} · {content.metrics.sourcesCredibility ?? ''}
                          </div>
                        </div>
                      )}
                      {report.topic_id && (
                        <Link
                          to={`/graph?topicId=${report.topic_id}`}
                          className="flex items-center gap-1.5 text-xs text-[#0071e3] hover:text-[#0062cc] hover:underline transition-colors"
                        >
                          <Network className="w-3.5 h-3.5" />
                          查看完整图谱
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
