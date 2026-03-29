import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, Info } from 'lucide-react';
import GraphVisualization, {
  GraphNode,
  GraphEdge,
  GraphNodeType,
} from '../components/GraphVisualization';

interface ApiNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
}

interface ApiLink {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, any>;
}

interface GraphStatus {
  backend: string;
  nodeCount?: number;
  relationshipCount?: number;
  lastSyncAt?: string;
}

// 关系类型中文翻译
const EDGE_LABELS: Record<string, string> = {
  'HAS_ENTITY': '包含实体',
  'ABOUT': '相关文档',
  'HAS_KEYWORD': '关键词',
  'HAS_ORGANIZATION': '关联组织',
  'RELATED_TO': '相关',
  'MENTIONS': '提及',
  'SUPPORTS': '支持',
  'CONTRADICTS': '反驳',
  'DERIVED_FROM': '来源于',
  'CITES': '引用',
};

export default function KnowledgeGraph() {
  const [searchQuery, setSearchQuery] = useState('');
  const [nodeFilters, setNodeFilters] = useState<Set<GraphNodeType>>(
    new Set(['topic', 'entity', 'event', 'claim', 'document'])
  );
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topics, setTopics] = useState<Array<{ id: string; name: string }>>([]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    fetchGraphStatus();
    fetchTopics();
  }, []);

  useEffect(() => {
    if (selectedTopic) fetchTopicGraph(selectedTopic);
  }, [selectedTopic]);

  async function fetchGraphStatus() {
    try {
      const res = await fetch('/api/graph/status');
      if (res.ok) setGraphStatus(await res.json());
    } catch {}
  }

  async function fetchTopics() {
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        if (data.length > 0 && !selectedTopic) setSelectedTopic(data[0].id);
      }
    } catch {}
  }

  function mapNodeType(type: string): GraphNodeType {
    const m: Record<string, GraphNodeType> = {
      topic: 'topic', entity: 'entity', event: 'event',
      claim: 'claim', document: 'document',
      organization: 'entity', person: 'entity', technology: 'entity',
      paper: 'document', article: 'document',
    };
    return m[type.toLowerCase()] || 'entity';
  }

  async function fetchTopicGraph(topicId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/graph/topic/${topicId}?depth=2`);
      if (res.ok) {
        const data = await res.json();
        const apiNodes: ApiNode[] = data.nodes || [];
        const apiLinks: ApiLink[] = data.links || [];

        const processedNodes: GraphNode[] = apiNodes.map((n, index) => ({
          id: n.id,
          type: 'custom' as const,
          position: {
            x: 400 + (index % 5) * 150,
            y: 200 + Math.floor(index / 5) * 100,
          },
          data: {
            label: n.label.length > 25 ? n.label.substring(0, 25) + '...' : n.label,
            type: mapNodeType(n.type),
            description: n.properties?.description || n.properties?.title || n.label,
            url: n.properties?.url,
          },
        }));

        const processedEdges: GraphEdge[] = apiLinks.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: {
            type: e.label.toLowerCase(),
            label: EDGE_LABELS[e.label] || e.label,
          },
        }));

        setNodes(processedNodes);
        setEdges(processedEdges);
      }
    } catch {
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncGraph() {
    try {
      await fetch('/api/skill/sync-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: selectedTopic || '' }),
      });
      await fetchGraphStatus();
      if (selectedTopic) await fetchTopicGraph(selectedTopic);
    } catch {}
  }

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = !searchQuery ||
      node.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.data.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = nodeFilters.has(node.data.type);
    return matchesSearch && matchesFilter;
  });

  const filteredEdges = edges.filter(edge => {
    const sourceNode = filteredNodes.find(n => n.id === edge.source);
    const targetNode = filteredNodes.find(n => n.id === edge.target);
    return sourceNode && targetNode;
  });

  const toggleNodeFilter = (type: GraphNodeType) => {
    const newFilters = new Set(nodeFilters);
    if (newFilters.has(type)) newFilters.delete(type);
    else newFilters.add(type);
    setNodeFilters(newFilters);
  };

  const handleNodeClick = (node: GraphNode) => {
    console.log('Node clicked:', node);
  };

  const handleNodeDoubleClick = (node: GraphNode) => {
    if (node.data.url) window.open(node.data.url, '_blank');
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">知识图谱</h2>
          <p className="mt-1 text-sm text-gray-500">
            展示主题下的实体关系网络：技术实体、关联组织和采集文献之间的关联
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedTopic || ''}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.name}</option>
            ))}
          </select>
          <button
            onClick={handleSyncGraph}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            同步图谱
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 ${showHelp ? 'text-indigo-600 border-indigo-300 bg-indigo-50' : 'text-gray-600 border-gray-300'}`}
          >
            <Info className="w-4 h-4" />
            使用说明
          </button>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-blue-900 mb-1">图谱含义</h4>
              <ul className="space-y-1 text-blue-700">
                <li>🎯 <b>主题节点</b>：你追踪的技术方向</li>
                <li>🏢 <b>实体节点</b>：关键技术、组织、人物</li>
                <li>📄 <b>文献节点</b>：采集到的论文和新闻</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-1">交互操作</h4>
              <ul className="space-y-1 text-blue-700">
                <li>🖱️ <b>拖拽</b>：移动节点位置</li>
                <li>🔍 <b>滚轮</b>：缩放图谱</li>
                <li>👆 <b>单击</b>：查看节点详情</li>
                <li>👆👆 <b>双击</b>：打开关联链接</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-1">数据来源</h4>
              <ul className="space-y-1 text-blue-700">
                <li>从「数据采集」页面采集的文档自动提取实体</li>
                <li>点击「同步图谱」刷新最新数据</li>
                <li>右上角切换布局方式优化展示</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {graphStatus && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>存储: <span className="font-medium text-gray-700">{graphStatus.backend}</span></span>
          {graphStatus.nodeCount !== undefined && (
            <span>节点: <span className="font-medium text-gray-700">{graphStatus.nodeCount}</span></span>
          )}
          {graphStatus.relationshipCount !== undefined && (
            <span>关系: <span className="font-medium text-gray-700">{graphStatus.relationshipCount}</span></span>
          )}
        </div>
      )}

      {/* Graph Container */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索实体、组织或文献..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                <Filter className="w-4 h-4" />
                节点类型
              </button>
              <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20 min-w-[140px] hidden group-hover:block">
                {([
                  { value: 'topic' as GraphNodeType, label: '主题', color: 'bg-indigo-600' },
                  { value: 'entity' as GraphNodeType, label: '实体/组织', color: 'bg-blue-500' },
                  { value: 'event' as GraphNodeType, label: '事件', color: 'bg-purple-500' },
                  { value: 'claim' as GraphNodeType, label: '主张', color: 'bg-amber-500' },
                  { value: 'document' as GraphNodeType, label: '文献', color: 'bg-emerald-500' },
                ]).map(({ value, label, color }) => (
                  <label key={value} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
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
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="mb-2 text-lg">暂无图谱数据</p>
              <p className="mb-4 text-sm">请先在「数据采集」页面采集文档，然后点击同步</p>
              <button
                onClick={handleSyncGraph}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                同步数据到图谱
              </button>
            </div>
          ) : (
            <GraphVisualization
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
