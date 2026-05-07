import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid } from 'recharts';
import { Activity, FileText, CheckCircle2, AlertTriangle, ArrowRight, Network, TrendingUp, Zap } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { CARD, SPINNER, SECTION_TITLE } from '../lib/design';
import { axisStyle, ChartTooltip, CHART_TITLE, EmptyChart } from '../components/Charts.tsx';

interface DashboardStats {
  activeTopics: number;
  weekDocs: number;
  pendingReviews: number;
  highPriorityAlerts: number;
  docsChange: number;
}

interface TrendData {
  name: string;
  papers: number;
  news: number;
}

interface TopicDistribution {
  name: string;
  value: number;
}

interface Alert {
  id: string;
  title: string;
  topic: string;
  time: string;
  type: string;
  url?: string;
  category: 'breaking' | 'developing' | 'trending';
  relevanceScore: number;
  urgency: string;
}

interface InsightData {
  predictedLinks: Array<{ source: string; target: string; adamicAdar: number; topicId: string; topicName: string }>;
  anomalies: Array<{ id: string; label?: string; score: number; topicId: string; topicName: string }>;
  centralEntities: Array<{ id: string; label?: string; pagerank: number; topicId: string; topicName: string }>;
}

interface TrendSignal {
  topicId: string;
  topicName: string;
  latestDocs: number;
  previousDocs: number;
  docChange: number;
  sourcesChange: number;
  period: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [topicDistribution, setTopicDistribution] = useState<TopicDistribution[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [trendSignals, setTrendSignals] = useState<TrendSignal[]>([]);
  const [alertReports, setAlertReports] = useState<Array<{ id: string; topicId: string; title: string; alertType: string; summary: string; generatedAt: string }>>([]);
  const [scoringSummary, setScoringSummary] = useState<Array<{ topicId: string; topicName: string; overallScore: number; recommendation: string; docCount: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, trendRes, distRes, alertsRes, insightsRes, signalsRes, alertReportsRes, scoringRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/trend'),
          fetch('/api/dashboard/topic-distribution'),
          fetch('/api/dashboard/alerts'),
          fetch('/api/dashboard/insights'),
          fetch('/api/dashboard/trend-comparison'),
          fetch('/api/alerts'),
          fetch('/api/dashboard/scoring-summary'),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (trendRes.ok) setTrendData(await trendRes.json());
        if (distRes.ok) setTopicDistribution(await distRes.json());
        if (alertsRes.ok) setAlerts(await alertsRes.json());
        if (insightsRes.ok) setInsights(await insightsRes.json());
        if (signalsRes.ok) setTrendSignals(await signalsRes.json());
        if (alertReportsRes.ok) setAlertReports(await alertReportsRes.json());
        if (scoringRes.ok) setScoringSummary(await scoringRes.json());
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={SPINNER} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">
      <PageHeader
        title="概览"
        description="技术情报追踪 - 突发优先，时效相关"
        stats={stats ? [
          { label: '活跃主题', value: stats.activeTopics },
          { label: '本周文献', value: stats.weekDocs },
          { label: '待审核', value: stats.pendingReviews },
          { label: '预警', value: stats.highPriorityAlerts },
        ] : undefined}
      />

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            label="活跃主题"
            value={stats.activeTopics}
            color="blue"
            icon={<Activity className="w-5 h-5" />}
          />
          <StatCard
            label="本周新增文献"
            value={stats.weekDocs.toLocaleString()}
            color="green"
            trend={stats.docsChange !== 0 ? {
              value: `${stats.docsChange >= 0 ? '+' : ''}${stats.docsChange}%`,
              positive: stats.docsChange >= 0,
            } : undefined}
            icon={<FileText className="w-5 h-5" />}
          />
          <StatCard
            label="待审核事实"
            value={stats.pendingReviews}
            color="purple"
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <StatCard
            label="高危预警"
            value={stats.highPriorityAlerts}
            color="red"
            icon={<AlertTriangle className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Scoring Summary Cards */}
      {scoringSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {scoringSummary.map((s) => {
            const rec = s.recommendation === 'heavy_investment' ? { label: '重点投入', color: 'bg-[#5B7553]/10 text-[#5B7553]' } :
                        s.recommendation === 'small_pilot' ? { label: '小规模试点', color: 'bg-[#9C7B3C]/10 text-[#9C7B3C]' } :
                        { label: '持续跟踪', color: 'bg-[#1d1d1f]/5 text-[#888]' };
            return (
              <button
                key={s.topicId}
                onClick={() => navigate(`/decision?topicId=${s.topicId}`)}
                className={`${CARD} p-4 text-left hover:shadow-md transition-all group cursor-pointer`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#1d1d1f] truncate group-hover:text-[#0071e3] transition-colors">
                    {s.topicName}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#888] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-semibold ${
                    s.overallScore >= 60 ? 'text-[#5B7553]' : s.overallScore >= 30 ? 'text-[#9C7B3C]' : 'text-[#A0453A]'
                  }`}>
                    {s.overallScore}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${rec.color}`}>{rec.label}</span>
                </div>
                <p className="text-[10px] text-[#888] mt-1">{s.docCount} 篇文档</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Trend Chart */}
        <div className={`${CARD} p-6`}>
          <h3 className={`${CHART_TITLE}`}>采集趋势</h3>
          <div className="h-64">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                  onClick={(payload) => {
                    if (payload?.activePayload?.[0]?.payload?.name) {
                      const date = payload.activePayload[0].payload.name;
                      if (date) navigate(`/topics?date=${encodeURIComponent(date)}`);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="colorPapers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2A5A6B" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2A5A6B" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5B7553" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#5B7553" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    {...axisStyle}
                    dy={8}
                  />
                  <YAxis
                    {...axisStyle}
                    dx={-5}
                  />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1d1d1f/20" vertical={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="papers"
                    name="论文"
                    stroke="#2A5A6B"
                    strokeWidth={2.5}
                    fill="url(#colorPapers)"
                    dot={false}
                    activeDot={{ r: 5, stroke: '#F7F7F7', strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="news"
                    name="新闻"
                    stroke="#5B7553"
                    strokeWidth={2.5}
                    fill="url(#colorNews)"
                    dot={false}
                    activeDot={{ r: 5, stroke: '#F7F7F7', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        {/* Topic Distribution */}
        <div className={`${CARD} p-6`}>
          <h3 className={`${CHART_TITLE}`}>主题证据分布</h3>
          <div className="h-64">
            {topicDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicDistribution} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 50 }}
                  onClick={(payload) => {
                    if (payload?.activePayload?.[0]?.payload?.topicId) {
                      navigate(`/graph?topicId=${payload.activePayload[0].payload.topicId}`);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <XAxis type="number" {...axisStyle} />
                  <YAxis dataKey="name" type="category" {...axisStyle} tick={{ fill: '#1d1d1f', fontSize: 13, fontWeight: 500 }} width={50} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1d1d1f/20" horizontal={true} vertical={false} />
                  <Tooltip
                    cursor={{ fill: '#F7F7F7' }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #1d1d1f/30',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" name="证据数量" fill="#2A5A6B" radius={[0, 8, 8, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#888] text-sm">
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intelligence Highlights & Trend Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Intelligence Highlights */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-[#1d1d1f]/20 flex items-center gap-2">
            <Network className="w-4 h-4 text-[#2A5A6B]" />
            <h3 className={`${SECTION_TITLE} !mb-0`}>情报亮点</h3>
          </div>
          <div className="divide-y divide-[#1d1d1f]/10">
            {/* Predicted Links */}
            {insights?.predictedLinks && insights.predictedLinks.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide mb-2">预测关联</p>
                {insights.predictedLinks.slice(0, 3).map((link, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/graph?topicId=${link.topicId}`)}
                    className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-[#F7F7F7] rounded px-2 -mx-2 transition-colors"
                  >
                    <Zap className="w-3 h-3 text-[#9C7B3C] shrink-0" />
                    <span className="text-sm text-[#1d1d1f] truncate">
                      {link.source} <span className="text-[#888]">→</span> {link.target}
                    </span>
                    <span className="ml-auto text-[10px] text-[#888] shrink-0">{link.topicName}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Anomalies */}
            {insights?.anomalies && insights.anomalies.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide mb-2">异常实体</p>
                {insights.anomalies.slice(0, 2).map((a, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/graph?topicId=${a.topicId}`)}
                    className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-[#F7F7F7] rounded px-2 -mx-2 transition-colors"
                  >
                    <AlertTriangle className="w-3 h-3 text-[#A0453A] shrink-0" />
                    <span className="text-sm text-[#1d1d1f] truncate">{a.label || a.id}</span>
                    <span className="ml-auto text-[10px] text-[#888] shrink-0">{a.topicName}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Central Entities */}
            {insights?.centralEntities && insights.centralEntities.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide mb-2">核心实体</p>
                {insights.centralEntities.slice(0, 3).map((e, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/graph?topicId=${e.topicId}`)}
                    className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-[#F7F7F7] rounded px-2 -mx-2 transition-colors"
                  >
                    <Network className="w-3 h-3 text-[#2A5A6B] shrink-0" />
                    <span className="text-sm text-[#1d1d1f] truncate">{e.label || e.id}</span>
                    <span className="ml-auto text-[10px] text-[#888] shrink-0">{e.topicName}</span>
                  </button>
                ))}
              </div>
            )}
            {(!insights || (insights.predictedLinks.length === 0 && insights.anomalies.length === 0 && insights.centralEntities.length === 0)) && (
              <div className="px-6 py-8 text-center text-[#888] text-sm">
                需要更多数据才能生成情报亮点
              </div>
            )}
          </div>
        </div>

        {/* Trend Signals */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-[#1d1d1f]/20 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#5B7553]" />
            <h3 className={`${SECTION_TITLE} !mb-0`}>趋势信号</h3>
          </div>
          {trendSignals.length > 0 ? (
            <div className="divide-y divide-[#1d1d1f]/10">
              {trendSignals.map((signal) => (
                <button
                  key={signal.topicId}
                  onClick={() => navigate(`/topics`)}
                  className="w-full text-left px-6 py-3 flex items-center gap-3 hover:bg-[#F7F7F7] transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    signal.docChange > 0
                      ? 'bg-[#5B7553]/10 text-[#5B7553]'
                      : signal.docChange < 0
                      ? 'bg-[#A0453A]/10 text-[#A0453A]'
                      : 'bg-[#1d1d1f]/5 text-[#888]'
                  }`}>
                    {signal.docChange > 0 ? '+' : ''}{signal.docChange}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1d1d1f] truncate">{signal.topicName}</p>
                    <p className="text-xs text-[#888]">
                      {signal.latestDocs} 篇 · {signal.period === 'daily' ? '日' : signal.period === 'weekly' ? '周' : signal.period === 'monthly' ? '月' : '季'}报
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#888] shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[#888] text-sm">
              生成首次报告后将显示趋势对比
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity - NYTimes Style */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-8 py-5 flex justify-between items-center border-b border-[#1d1d1f]/20">
          <h3 className={SECTION_TITLE}>活动动态</h3>
          <div className="flex gap-4 text-xs">
            {alertReports.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                智能告警
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#A0453A]" />
              突发
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#9C7B3C]" />
              发展中
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2A5A6B]" />
              热门
            </span>
          </div>
        </div>
        {alertReports.length > 0 ? (
          <div className="divide-y divide-[#1d1d1f]/20 border-b border-purple-200">
            {alertReports.slice(0, 5).map((report) => (
              <div
                key={report.id}
                className="px-8 py-4 flex items-center gap-4 hover:bg-purple-50/50 transition-colors bg-purple-50/30"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  report.alertType === 'breakthrough' ? 'bg-purple-600' :
                  report.alertType === 'risk' ? 'bg-[#A0453A]' :
                  report.alertType === 'opportunity' ? 'bg-[#5B7553]' :
                  'bg-[#9C7B3C]'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                      report.alertType === 'breakthrough' ? 'bg-purple-600 text-white' :
                      report.alertType === 'risk' ? 'bg-[#A0453A] text-white' :
                      report.alertType === 'opportunity' ? 'bg-[#5B7553] text-white' :
                      'bg-[#9C7B3C] text-white'
                    }`}>
                      {report.alertType === 'breakthrough' ? '突破' :
                       report.alertType === 'risk' ? '风险' :
                       report.alertType === 'opportunity' ? '机会' : '异常'}
                    </span>
                    <p className="text-sm text-[#1d1d1f] truncate font-medium">{report.title}</p>
                  </div>
                  {report.summary && (
                    <p className="text-xs text-[#888] truncate">{report.summary}</p>
                  )}
                </div>
                <span className="text-[10px] text-[#888] shrink-0">
                  {report.generatedAt ? new Date(report.generatedAt).toLocaleDateString('zh-CN') : ''}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {alerts.length > 0 ? (
          <div className="divide-y divide-[#1d1d1f]/20">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`px-8 py-4 flex items-center gap-4 hover:bg-[#F7F7F7] transition-colors ${
                  alert.category === 'breaking' ? 'bg-[#A0453A]/5' : ''
                }`}
              >
                {/* Category indicator */}
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    alert.category === 'breaking'
                      ? 'bg-[#A0453A]'
                      : alert.category === 'developing'
                      ? 'bg-[#9C7B3C]'
                      : 'bg-[#2A5A6B]'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  {/* Category badge for breaking news */}
                  <div className="flex items-center gap-2 mb-1">
                    {alert.category === 'breaking' && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#A0453A] text-white rounded">
                        突发
                      </span>
                    )}
                    {alert.category === 'developing' && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-[#9C7B3C] text-white rounded">
                        发展中
                      </span>
                    )}
                    <p className="text-sm text-[#1d1d1f] truncate font-medium">{alert.title}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[#888]">
                    <span className="font-medium">{alert.topic}</span>
                    <span>·</span>
                    <span>{alert.type}</span>
                    <span>·</span>
                    <span>{alert.time}</span>
                    {/* Relevance score indicator */}
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-[#F7F7F7] rounded">
                      {Math.round(alert.relevanceScore * 100)}% 相关
                    </span>
                  </div>
                </div>
                {alert.url && (
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#888] hover:text-[#1d1d1f] transition-colors shrink-0"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 py-12 text-center text-[#888] text-sm">
            暂无活动
          </div>
        )}
      </div>
    </div>
  );
}
