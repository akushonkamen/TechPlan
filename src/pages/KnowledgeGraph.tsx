import { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import GraphVisualization, {
  GraphNode,
  GraphEdge,
  GraphNodeType,
} from '../components/GraphVisualization';

// Mock data for evidence graph
const mockEvidenceNodes: GraphNode[] = [
  {
    id: 'topic-1',
    type: 'custom',
    position: { x: 400, y: 300 },
    data: {
      label: '端侧大模型',
      type: 'topic' as GraphNodeType,
      description: '运行在终端设备上的轻量化大语言模型',
    },
  },
  {
    id: 'entity-1',
    type: 'custom',
    position: { x: 200, y: 200 },
    data: {
      label: 'Apple',
      type: 'entity' as GraphNodeType,
      description: '苹果公司，端侧AI领导者',
      url: 'https://machinelearning.apple.com/',
    },
  },
  {
    id: 'entity-2',
    type: 'custom',
    position: { x: 600, y: 200 },
    data: {
      label: 'Google',
      type: 'entity' as GraphNodeType,
      description: '谷歌，Gemini Nano模型',
      url: 'https://ai.google.dev/',
    },
  },
  {
    id: 'entity-3',
    type: 'custom',
    position: { x: 400, y: 150 },
    data: {
      label: 'Qualcomm',
      type: 'entity' as GraphNodeType,
      description: '高通，端侧AI芯片提供商',
    },
  },
  {
    id: 'document-1',
    type: 'custom',
    position: { x: 150, y: 400 },
    data: {
      label: 'arXiv:2310.01222',
      type: 'document' as GraphNodeType,
      description: 'LLM in a Flash: Efficient Large Language Model Inference',
      url: 'https://arxiv.org/abs/2310.01222',
    },
  },
  {
    id: 'document-2',
    type: 'custom',
    position: { x: 650, y: 400 },
    data: {
      label: 'Gemini Nano',
      type: 'document' as GraphNodeType,
      description: 'Google的端侧大模型技术报告',
      url: 'https://blog.google/technology/ai/google-gemini-ai/',
    },
  },
  {
    id: 'claim-1',
    type: 'custom',
    position: { x: 300, y: 450 },
    data: {
      label: '内存占用降低40%',
      type: 'claim' as GraphNodeType,
      description: '通过闪存存储优化，内存占用显著降低',
    },
  },
  {
    id: 'claim-2',
    type: 'custom',
    position: { x: 500, y: 450 },
    data: {
      label: '推理速度提升2x',
      type: 'claim' as GraphNodeType,
      description: '硬件加速和模型优化使推理速度翻倍',
    },
  },
  {
    id: 'event-1',
    type: 'custom',
    position: { x: 700, y: 300 },
    data: {
      label: 'WWDC 2024',
      type: 'event' as GraphNodeType,
      description: 'Apple发布端侧AI新功能',
    },
  },
];

const mockEvidenceEdges: GraphEdge[] = [
  {
    id: 'e1',
    source: 'topic-1',
    target: 'entity-1',
    data: { type: 'has_entity', label: '相关' },
  },
  {
    id: 'e2',
    source: 'topic-1',
    target: 'entity-2',
    data: { type: 'has_entity', label: '相关' },
  },
  {
    id: 'e3',
    source: 'topic-1',
    target: 'entity-3',
    data: { type: 'has_entity', label: '相关' },
  },
  {
    id: 'e4',
    source: 'topic-1',
    target: 'document-1',
    data: { type: 'related_to', label: '支持' },
  },
  {
    id: 'e5',
    source: 'topic-1',
    target: 'document-2',
    data: { type: 'related_to', label: '支持' },
  },
  {
    id: 'e6',
    source: 'document-1',
    target: 'claim-1',
    data: { type: 'supports', label: '支持' },
  },
  {
    id: 'e7',
    source: 'document-2',
    target: 'claim-2',
    data: { type: 'supports', label: '支持' },
  },
  {
    id: 'e8',
    source: 'entity-1',
    target: 'event-1',
    data: { type: 'related_to', label: '发布' },
  },
  {
    id: 'e9',
    source: 'claim-1',
    target: 'claim-2',
    data: { type: 'supports', label: '互补' },
  },
];

// Mock data for planning graph
const mockPlanningNodes: GraphNode[] = [
  {
    id: 'plan-1',
    type: 'custom',
    position: { x: 400, y: 300 },
    data: {
      label: '端侧AI规划',
      type: 'topic' as GraphNodeType,
      description: '端侧AI技术战略规划',
    },
  },
  {
    id: 'action-1',
    type: 'custom',
    position: { x: 200, y: 200 },
    data: {
      label: '跟踪Apple',
      type: 'claim' as GraphNodeType,
      description: '持续跟踪Apple的端侧AI进展',
    },
  },
  {
    id: 'action-2',
    type: 'custom',
    position: { x: 600, y: 200 },
    data: {
      label: '评估Gemini',
      type: 'claim' as GraphNodeType,
      description: '评估Google Gemini Nano的可用性',
    },
  },
  {
    id: 'action-3',
    type: 'custom',
    position: { x: 400, y: 450 },
    data: {
      label: '技术验证',
      type: 'event' as GraphNodeType,
      description: '开展端侧AI技术验证项目',
    },
  },
  {
    id: 'doc-1',
    type: 'custom',
    position: { x: 150, y: 400 },
    data: {
      label: '技术报告',
      type: 'document' as GraphNodeType,
      description: '端侧AI技术调研报告',
    },
  },
];

const mockPlanningEdges: GraphEdge[] = [
  {
    id: 'p1',
    source: 'plan-1',
    target: 'action-1',
    data: { type: 'has_claim', label: '包含' },
  },
  {
    id: 'p2',
    source: 'plan-1',
    target: 'action-2',
    data: { type: 'has_claim', label: '包含' },
  },
  {
    id: 'p3',
    source: 'action-1',
    target: 'action-3',
    data: { type: 'supports', label: '推动' },
  },
  {
    id: 'p4',
    source: 'action-2',
    target: 'action-3',
    data: { type: 'supports', label: '推动' },
  },
  {
    id: 'p5',
    source: 'action-3',
    target: 'doc-1',
    data: { type: 'related_to', label: '产出' },
  },
];

export default function KnowledgeGraph() {
  const [activeTab, setActiveTab] = useState<'evidence' | 'planning'>('evidence');
  const [searchQuery, setSearchQuery] = useState('');
  const [nodeFilters, setNodeFilters] = useState<Set<GraphNodeType>>(
    new Set(['topic', 'entity', 'event', 'claim', 'document'])
  );

  const currentNodes = activeTab === 'evidence' ? mockEvidenceNodes : mockPlanningNodes;
  const currentEdges = activeTab === 'evidence' ? mockEvidenceEdges : mockPlanningEdges;

  // Filter nodes based on search query and type filters
  const filteredNodes = currentNodes.filter(node => {
    const matchesSearch = !searchQuery ||
      node.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.data.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = nodeFilters.has(node.data.type);
    return matchesSearch && matchesFilter;
  });

  // Filter edges to only include connections between filtered nodes
  const filteredEdges = currentEdges.filter(edge => {
    const sourceNode = filteredNodes.find(n => n.id === edge.source);
    const targetNode = filteredNodes.find(n => n.id === edge.target);
    return sourceNode && targetNode;
  });

  const toggleNodeFilter = (type: GraphNodeType) => {
    const newFilters = new Set(nodeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setNodeFilters(newFilters);
  };

  const handleNodeClick = (node: GraphNode) => {
    console.log('Node clicked:', node);
    // TODO: Show node details in a sidebar or modal
  };

  const handleNodeDoubleClick = (node: GraphNode) => {
    console.log('Node double clicked:', node);
    if (node.data.url) {
      window.open(node.data.url, '_blank');
    }
  };

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

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索实体、关系或主张..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                <Filter className="w-4 h-4" />
                节点类型
              </button>
              {/* Filter Dropdown */}
              <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20 min-w-[140px]">
                {[
                  { value: 'topic' as GraphNodeType, label: '主题 (Topic)', color: 'bg-indigo-600' },
                  { value: 'entity' as GraphNodeType, label: '实体 (Entity)', color: 'bg-blue-500' },
                  { value: 'event' as GraphNodeType, label: '事件 (Event)', color: 'bg-purple-500' },
                  { value: 'claim' as GraphNodeType, label: '主张 (Claim)', color: 'bg-amber-500' },
                  { value: 'document' as GraphNodeType, label: '文献 (Document)', color: 'bg-emerald-500' },
                ].map(({ value, label, color }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={nodeFilters.has(value)}
                      onChange={() => toggleNodeFilter(value)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className={`w-3 h-3 rounded-full ${color}`}></div>
                    <span className="text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {filteredNodes.length} 节点, {filteredEdges.length} 关系
          </div>
        </div>

        {/* Graph Area */}
        <div className="flex-1 relative">
          <GraphVisualization
            nodes={filteredNodes}
            edges={filteredEdges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        </div>
      </div>
    </div>
  );
}
