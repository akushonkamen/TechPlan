import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart, CartesianGrid } from 'recharts';
import { Activity, FileText, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { CARD, SPINNER, SECTION_TITLE } from '../lib/design';
import { axisStyle, CHART_COLORS, ChartTooltip, CHART_TITLE, EmptyChart } from '../lib/charts.tsx';

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

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [topicDistribution, setTopicDistribution] = useState<TopicDistribution[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, trendRes, distRes, alertsRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/trend'),
          fetch('/api/dashboard/topic-distribution'),
          fetch('/api/dashboard/alerts'),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (trendRes.ok) setTrendData(await trendRes.json());
        if (distRes.ok) setTopicDistribution(await distRes.json());
        if (alertsRes.ok) setAlerts(await alertsRes.json());
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
    <div className="space-y-5 animate-fade-in">
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Trend Chart */}
        <div className={`${CARD} p-6`}>
          <h3 className={`${CHART_TITLE}`}>采集趋势</h3>
          <div className="h-64">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
                <BarChart data={topicDistribution} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 50 }}>
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

      {/* Recent Activity - NYTimes Style */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-8 py-5 flex justify-between items-center border-b border-[#1d1d1f]/20">
          <h3 className={SECTION_TITLE}>活动动态</h3>
          <div className="flex gap-4 text-xs">
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
