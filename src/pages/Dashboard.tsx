import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, FileText, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';

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

        if (statsRes.ok) {
          setStats(await statsRes.json());
        }
        if (trendRes.ok) {
          setTrendData(await trendRes.json());
        }
        if (distRes.ok) {
          setTopicDistribution(await distRes.json());
        }
        if (alertsRes.ok) {
          setAlerts(await alertsRes.json());
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const statCards = stats ? [
    { name: '活跃主题', value: stats.activeTopics.toString(), icon: Activity, change: '', changeType: 'neutral' as const },
    { name: '本周新增文献', value: stats.weekDocs.toLocaleString(), icon: FileText, change: `${stats.docsChange >= 0 ? '+' : ''}${stats.docsChange}%`, changeType: stats.docsChange >= 0 ? 'positive' as const : 'negative' as const },
    { name: '待审核事实', value: stats.pendingReviews.toString(), icon: CheckCircle2, change: '', changeType: 'neutral' as const },
    { name: '高危预警', value: stats.highPriorityAlerts.toString(), icon: AlertTriangle, change: '', changeType: 'negative' as const },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg">
                <stat.icon className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            {stat.change && (
              <div className="mt-4 flex items-center text-sm">
                {stat.changeType === 'positive' ? (
                  <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                ) : stat.changeType === 'negative' ? (
                  <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                ) : null}
                <span className={stat.changeType === 'positive' ? 'text-green-600' : stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-500'}>
                  {stat.change}
                </span>
                <span className="ml-2 text-gray-500">较上周</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-6">采集趋势 (本周)</h3>
          <div className="h-72">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="papers" name="论文" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="news" name="新闻" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                暂无数据
              </div>
            )}
          </div>
        </div>

        {/* Topic Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-6">热门主题证据分布</h3>
          <div className="h-72">
            {topicDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicDistribution} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip 
                    cursor={{ fill: '#F3F4F6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" name="证据数量" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">最新预警</h3>
          <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">查看全部</button>
        </div>
        {alerts.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {alerts.map((alert) => (
              <div key={alert.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="mt-1 p-2 bg-red-50 rounded-full">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-md font-medium text-gray-600">{alert.topic}</span>
                    <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md font-medium">{alert.type}</span>
                    <span>{alert.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-gray-400">
            暂无预警信息
          </div>
        )}
      </div>
    </div>
  );
}
