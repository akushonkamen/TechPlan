import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, FileText, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { CARD, SPINNER, SECTION_TITLE } from '../lib/design';

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
  id: number;
  title: string;
  topic: string;
  time: string;
  type: string;
  url?: string;
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
        description="技术情报追踪全景视图"
        stats={stats ? [
          { label: '活跃主题', value: stats.activeTopics },
          { label: '本周文献', value: stats.weekDocs },
          { label: '待审核', value: stats.pendingReviews },
          { label: '预警', value: stats.highPriorityAlerts },
        ] : undefined}
      />

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="活跃主题"
            value={stats.activeTopics}
            icon={<Activity className="w-5 h-5" />}
          />
          <StatCard
            label="本周新增文献"
            value={stats.weekDocs.toLocaleString()}
            trend={stats.docsChange !== 0 ? {
              value: `${stats.docsChange >= 0 ? '+' : ''}${stats.docsChange}%`,
              positive: stats.docsChange >= 0,
            } : undefined}
            icon={<FileText className="w-5 h-5" />}
          />
          <StatCard
            label="待审核事实"
            value={stats.pendingReviews}
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <StatCard
            label="高危预警"
            value={stats.highPriorityAlerts}
            icon={<AlertTriangle className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <div className={`${CARD} p-8`}>
          <h3 className={`${SECTION_TITLE} mb-6`}>采集趋势</h3>
          <div className="h-64">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#86868b', fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#86868b', fontSize: 11 }}
                    dx={-5}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #d2d2d7',
                      boxShadow: 'none',
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="papers"
                    name="论文"
                    stroke="#0071e3"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="news"
                    name="新闻"
                    stroke="#34c759"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#aeaeb5] text-sm">
                暂无数据
              </div>
            )}
          </div>
        </div>

        {/* Topic Distribution */}
        <div className={`${CARD} p-8`}>
          <h3 className={`${SECTION_TITLE} mb-6`}>主题证据分布</h3>
          <div className="h-64">
            {topicDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicDistribution} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 40 }}>
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#86868b', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#1d1d1f', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip
                    cursor={{ fill: '#f5f5f7' }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #d2d2d7',
                      boxShadow: 'none',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" name="证据数量" fill="#0071e3" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[#aeaeb5] text-sm">
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-8 py-5 flex justify-between items-center">
          <h3 className={SECTION_TITLE}>最近活动</h3>
        </div>
        {alerts.length > 0 ? (
          <div className="divide-y divide-[#f5f5f7]">
            {alerts.map((alert) => (
              <div key={alert.id} className="px-8 py-4 flex items-center gap-4 hover:bg-[#f5f5f7] transition-colors">
                <div className="w-2 h-2 rounded-full bg-[#ff9f0a] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1d1d1f] truncate">{alert.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[#86868b]">
                    <span>{alert.topic}</span>
                    <span>{alert.type}</span>
                    <span>{alert.time}</span>
                  </div>
                </div>
                {alert.url && (
                  <a
                    href={alert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#aeaeb5] hover:text-[#0071e3] transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 py-12 text-center text-[#86868b] text-sm">
            暂无活动
          </div>
        )}
      </div>
    </div>
  );
}
