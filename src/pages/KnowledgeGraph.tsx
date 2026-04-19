import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';
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

interface ApiEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, any>;
}

interface GraphStatus {
  backend: string;
  nodeCount?: number;
  edgeCount?: number;
  lastSync?: string;
}

export default function KnowledgeGraph() {
  const [activeTab, setActiveTab] = useState<'evidence' | 'planning'>('evidence');
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

  useEffect(() => {
    fetchGraphStatus();
    fetchTopics();
  }, []);

  useEffect(() => {
    if (selectedTopic) {
      fetchTopicGraph(selectedTopic);
    }
  }, [selectedTopic]);

  async function fetchGraphStatus() {
    try {
      const res = await fetch('/api/graph/status');
      if (res.ok) {
        setGraphStatus(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch graph status:', error);
    }
  }

  async function fetchTopics() {
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        if (data.length > 0 && !selectedTopic) {
          setSelectedTopic(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    }
  }

  async function fetchTopicGraph(topicId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/graph/topic/${topicId}?depth=2`);
      if (res.ok) {
        const data = await res.json();
        
        const processedNodes: GraphNode[] = data.nodes.map((n: ApiNode, index: number) => ({
          id: n.id,
          type: 'custom',
          position: { 
            x: 400 + (index % 5) * 150, 
            y: 200 + Math.floor(index / 5) * 100 
          },
          data: {
            label: n.label,
            type: mapNodeType(n.type),
            description: n.properties?.description || n.properties?.title || '',
            url: n.properties?.url,
          },
        }));

        const processedEdges: GraphEdge[] = data.links.map((e: ApiEdge) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: {
            type: e.label.toLowerCase().replace(/_/g, '_'),
            label: e.label,
          },
        }));

        setNodes(processedNodes);
        setEdges(processedEdges);
      }
    } catch (error) {
      console.error('Failed to fetch topic graph:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncGraph() {
    try {
      const res = await fetch('/api/graph/sync', { method: 'POST' });
      if (res.ok) {
        await fetchGraphStatus();
        if (selectedTopic) {
          await fetchTopicGraph(selectedTopic);
        }
      }
    } catch (error) {
      console.error('Failed to sync graph:', error);
    }
  }

  function mapNodeType(type: string): GraphNodeType {
    const typeMap: Record<string, GraphNodeType> = {
      'topic': 'topic',
      'entity': 'entity',
      'event': 'event',
      'claim': 'claim',
      'document': 'document',
      'organization': 'entity',
      'person': 'entity',
      'technology': 'entity',
      'paper': 'document',
      'article': 'document',
    };
    return typeMap[type.toLowerCase()] || 'entity';
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
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setNodeFilters(newFilters);
  };

  const handleNodeClick = (node: GraphNode) => {
    console.log('Node clicked:', node);
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
        <div className="flex items-center gap-4">
          <select
            value={selectedTopic || ''}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSyncGraph}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            同步图谱
          </button>
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
      </div>

      {graphStatus && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>后端: <span className="font-medium text-gray-700">{graphStatus.backend}</span></span>
          {graphStatus.nodeCount !== undefined && (
            <span>节点: <span className="font-medium text-gray-700">{graphStatus.nodeCount}</span></span>
          )}
          {graphStatus.edgeCount !== undefined && (
            <span>关系: <span className="font-medium text-gray-700">{graphStatus.edgeCount}</span></span>
          )}
        </div>
      )}

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
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                <Filter className="w-4 h-4" />
                节点类型
              </button>
              {/* Filter Dropdown */}
              <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20 min-w-[140px] hidden group-hover:block">
                {[
                  { value: 'topic' as GraphNodeType, label: '主题', color: 'bg-indigo-600' },
                  { value: 'entity' as GraphNodeType, label: '实体', color: 'bg-blue-500' },
                  { value: 'event' as GraphNodeType, label: '事件', color: 'bg-purple-500' },
                  { value: 'claim' as GraphNodeType, label: '主张', color: 'bg-amber-500' },
                  { value: 'document' as GraphNodeType, label: '文献', color: 'bg-emerald-500' },
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
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              加载中...
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="mb-4">暂无图谱数据</p>
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
