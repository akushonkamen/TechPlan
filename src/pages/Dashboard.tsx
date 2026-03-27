import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';

const stats = [
  { name: '活跃主题', value: '12', icon: Activity, change: '+2', changeType: 'positive' },
  { name: '本周新增文献', value: '1,240', icon: FileText, change: '+12%', changeType: 'positive' },
  { name: '待审核事实', value: '45', icon: CheckCircle2, change: '-5', changeType: 'negative' },
  { name: '高危预警', value: '3', icon: AlertTriangle, change: '+1', changeType: 'negative' },
];

const trendData = [
  { name: '周一', papers: 120, news: 45 },
  { name: '周二', papers: 132, news: 52 },
  { name: '周三', papers: 101, news: 38 },
  { name: '周四', papers: 145, news: 65 },
  { name: '周五', papers: 190, news: 85 },
  { name: '周六', papers: 85, news: 20 },
  { name: '周日', papers: 65, news: 15 },
];

const topicDistribution = [
  { name: '端侧大模型', value: 400 },
  { name: '固态电池', value: 300 },
  { name: '人形机器人', value: 300 },
  { name: '硅光芯片', value: 200 },
  { name: '脑机接口', value: 100 },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
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
            <div className="mt-4 flex items-center text-sm">
              <span className={stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'}>
                {stat.change}
              </span>
              <span className="ml-2 text-gray-500">较上周</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-6">采集趋势 (本周)</h3>
          <div className="h-72">
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
          </div>
        </div>

        {/* Topic Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-6">热门主题证据分布</h3>
          <div className="h-72">
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
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">最新预警</h3>
          <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">查看全部</button>
        </div>
        <div className="divide-y divide-gray-200">
          {[
            { title: 'Apple 发布新一代端侧推理框架', topic: '端侧大模型', time: '2小时前', type: '重大发布' },
            { title: '欧盟出台 AI 法案最终草案', topic: 'AI 监管政策', time: '5小时前', type: '政策调整' },
            { title: 'Nature 连发两篇固态电池突破性论文', topic: '固态电池', time: '1天前', type: '学术突破' },
          ].map((alert, i) => (
            <div key={i} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
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
      </div>
    </div>
  );
}
