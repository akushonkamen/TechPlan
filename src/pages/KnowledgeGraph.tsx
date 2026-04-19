import { useState } from 'react';
import { Network, Search, Filter, ZoomIn, ZoomOut, Maximize, ExternalLink } from 'lucide-react';

export default function KnowledgeGraph() {
  const [activeTab, setActiveTab] = useState<'evidence' | 'planning'>('evidence');

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">知识图谱探索</h2>
          <p className="mt-1 text-sm text-gray-500">探索事实证据链与规划建议网络。</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'evidence' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('evidence')}
          >
            证据图谱 (事实层)
          </button>
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'planning' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('planning')}
          >
            规划图谱 (业务层)
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
        {/* Toolbar */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="搜索实体、关系或主张..." 
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none w-64"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
              <Filter className="w-4 h-4" />
              筛选节点
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-md"><ZoomIn className="w-4 h-4" /></button>
            <button className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-md"><ZoomOut className="w-4 h-4" /></button>
            <button className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-md"><Maximize className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Graph Area (Mocked) */}
        <div className="flex-1 bg-gray-50 relative overflow-hidden flex items-center justify-center">
          {/* Background Grid */}
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#E5E7EB 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          {/* Mock Nodes */}
          <div className="relative w-full h-full max-w-4xl max-h-[600px]">
            {/* SVG Lines - Placed first so they render behind nodes */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              {/* Center (50,50) to Top-Left Org (25,25) */}
              <line x1="50%" y1="50%" x2="25%" y2="25%" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4" />
              
              {/* Center (50,50) to Bottom-Right Doc (75,75) */}
              <line x1="50%" y1="50%" x2="75%" y2="75%" stroke="#9CA3AF" strokeWidth="2" />
              
              {/* Center (50,50) to Top-Right Claim (66.6,33.3) */}
              <line x1="50%" y1="50%" x2="66.6%" y2="33.3%" stroke="#9CA3AF" strokeWidth="2" />
              
              {/* Bottom-Right Doc (75,75) to Top-Right Claim (66.6,33.3) */}
              <line x1="75%" y1="75%" x2="66.6%" y2="33.3%" stroke="#FCA5A5" strokeWidth="2" strokeDasharray="4" />
            </svg>

            {/* Center Node: Topic */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
              <div className="w-16 h-16 bg-indigo-600 rounded-full shadow-lg flex items-center justify-center text-white border-4 border-indigo-100">
                <Network className="w-8 h-8" />
              </div>
              <span className="mt-2 font-medium text-gray-900 bg-white/80 px-2 py-0.5 rounded backdrop-blur-sm">端侧大模型</span>
            </div>

            {/* Top-Left Node: Organization */}
            <a href="https://machinelearning.apple.com/" target="_blank" rel="noopener noreferrer" className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 group cursor-pointer">
              <div className="w-12 h-12 bg-blue-500 rounded-full shadow-md flex items-center justify-center text-white border-2 border-white group-hover:scale-110 group-hover:shadow-lg transition-all">Org</div>
              <span className="mt-1 text-xs font-medium text-gray-700 bg-white/80 px-1 rounded group-hover:text-blue-600 flex items-center gap-0.5 transition-colors">Apple <ExternalLink className="w-3 h-3" /></span>
            </a>
            
            {/* Bottom-Right Node: Document */}
            <a href="https://arxiv.org/abs/2310.11453" target="_blank" rel="noopener noreferrer" className="absolute top-[75%] left-[75%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 group cursor-pointer">
              <div className="w-12 h-12 bg-emerald-500 rounded-full shadow-md flex items-center justify-center text-white border-2 border-white group-hover:scale-110 group-hover:shadow-lg transition-all">Doc</div>
              <span className="mt-1 text-xs font-medium text-gray-700 bg-white/80 px-1 rounded group-hover:text-emerald-600 flex items-center gap-0.5 transition-colors">arXiv:2310.xxx <ExternalLink className="w-3 h-3" /></span>
            </a>

            {/* Top-Right Node: Claim */}
            <div className="absolute top-[33.3%] left-[66.6%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 group cursor-pointer">
              <div className="w-12 h-12 bg-amber-500 rounded-full shadow-md flex items-center justify-center text-white border-2 border-white group-hover:scale-110 transition-transform">Claim</div>
              <span className="mt-1 text-xs font-medium text-gray-700 bg-white/80 px-1 rounded">内存占用降低40%</span>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-sm border border-gray-200 text-xs space-y-2 z-20">
            <div className="font-medium text-gray-700 mb-1">图例</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-600"></div><span>主题 (Topic)</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span>机构 (Organization)</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span>文献 (Document)</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span>主张 (Claim)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
