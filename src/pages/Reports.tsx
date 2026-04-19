import { FileText, Download, Calendar, ArrowRight, Play } from 'lucide-react';

const reports = [
  { id: 1, title: '端侧大模型技术研判专题报告', type: '专题研判', topic: '端侧大模型', date: '2026-03-25', status: 'ready', author: '系统自动生成' },
  { id: 2, title: '固态电池产业化进展周报 (第12周)', type: '周报', topic: '固态电池', date: '2026-03-22', status: 'ready', author: '系统自动生成' },
  { id: 3, title: '硅光芯片竞争格局分析', type: '专题研判', topic: '硅光芯片', date: '2026-03-20', status: 'ready', author: '系统自动生成' },
  { id: 4, title: '脑机接口最新突破与风险提示', type: '预警报告', topic: '脑机接口', date: '2026-03-18', status: 'ready', author: '系统自动生成' },
];

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">分析与报告</h2>
          <p className="mt-1 text-sm text-gray-500">查看自动生成的周期性报告，或触发按需专题分析。</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
          <Play className="w-4 h-4" />
          生成专题报告
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-medium text-gray-900">最近报告</h3>
            <div className="flex gap-2">
              <select className="text-sm border-gray-300 rounded-md py-1.5 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500">
                <option>所有类型</option>
                <option>周报</option>
                <option>专题研判</option>
                <option>预警报告</option>
              </select>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {reports.map((report) => (
              <div key={report.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-1">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">{report.title}</h4>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{report.type}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {report.date}</span>
                      <span>{report.author}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="下载 PDF">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="在线查看">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions & Templates */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-4">按需分析模板</h3>
            <div className="space-y-3">
              <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                <div className="font-medium text-sm text-gray-900 group-hover:text-indigo-700">技术路线对比分析</div>
                <div className="text-xs text-gray-500 mt-1">对比多个候选技术方向的成熟度、热度与风险。</div>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                <div className="font-medium text-sm text-gray-900 group-hover:text-indigo-700">竞争态势深度研判</div>
                <div className="text-xs text-gray-500 mt-1">分析核心玩家的专利、论文、产品发布时间线。</div>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
                <div className="font-medium text-sm text-gray-900 group-hover:text-indigo-700">进入时机与资源建议</div>
                <div className="text-xs text-gray-500 mt-1">基于图谱证据链生成具体的规划动作建议。</div>
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-5">
            <h3 className="font-medium text-indigo-900 mb-2">报告生成引擎状态</h3>
            <div className="space-y-2 text-sm text-indigo-800">
              <div className="flex justify-between">
                <span>LLM 推理服务</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span> 正常</span>
              </div>
              <div className="flex justify-between">
                <span>图谱检索服务</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span> 正常</span>
              </div>
              <div className="flex justify-between">
                <span>排队任务</span>
                <span className="font-medium">0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
