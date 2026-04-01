import { useState, useEffect } from 'react';
import { Search, Info, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { CARD, INPUT, SPINNER } from '../lib/design';
import PageHeader from '../components/PageHeader';
import GraphVisualization, {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphEdgeData,
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

interface TimeFilter {
  label: string;
  hours: number;
}

interface RecentDevelopment {
  documents: Array<{
    id: string;
    title: string;
    source: string;
    url: string;
    publishedDate: string;
    collectedDate: string;
    relevanceScore: number;
    urgency: string;
    freshnessHours: number;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    documentCount: number;
    firstSeenDate: string;
  }>;
  emergingRelations: Array<{
    sourceId: string;
    targetId: string;
    relationType: string;
    confidence: number;
    sourceName: string;
    targetName: string;
    firstSeenDate: string;
  }>;
  timeRange: {
    hours: number;
    cutoffDate: string;
  };
  counts: {
    documents: number;
    entities: number;
    emergingRelations: number;
  };
}

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

const NODE_TYPE_OPTIONS: Array<{ value: GraphNodeType; label: string; color: string }> = [
  { value: 'topic', label: '主题', color: 'bg-[#0071e3]' },
  { value: 'entity', label: '实体/组织', color: 'bg-blue-500' },
  { value: 'event', label: '事件', color: 'bg-purple-500' },
  { value: 'claim', label: '主张', color: 'bg-amber-500' },
  { value: 'document', label: '文献', color: 'bg-emerald-500' },
];

const TIME_FILTER_OPTIONS: TimeFilter[] = [
  { label: '6小时', hours: 6 },
  { label: '24小时', hours: 24 },
  { label: '3天', hours: 72 },
  { label: '7天', hours: 168 },
  { label: '30天', hours: 720 },
];

export default function KnowledgeGraph() {
  const location = useLocation();
  const highlightParam = new URLSearchParams(location.search).get('highlight') ?? '';
  const highlightEntities = highlightParam ? highlightParam.split(',').map(e => e.trim().toLowerCase()) : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [nodeFilters, setNodeFilters] = useState<Set<GraphNodeType>>(new Set(['topic', 'entity', 'event', 'claim', 'document']));
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topics, setTopics] = useState<Array<{ id: string; name: string }>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Time-aware features
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilter>(TIME_FILTER_OPTIONS[1]); // Default 24 hours
  const [showRecentDevelopments, setShowRecentDevelopments] = useState(false);
  const [recentDevelopments, setRecentDevelopments] = useState<RecentDevelopment | null>(null);
  const [recentDevLoading, setRecentDevLoading] = useState(false);

  useEffect(() => {
    fetchGraphStatus();
    fetchTopics();
    // Read topicId from URL params for report-graph integration
    const urlTopicId = new URLSearchParams(location.search).get('topicId');
    if (urlTopicId) setSelectedTopic(urlTopicId);
  }, []);

  useEffect(() => {
    if (selectedTopic) fetchTopicGraph(selectedTopic);
  }, [selectedTopic]);

  async function fetchGraphStatus() {
    try {
      const res = await fetch('/api/graph/status');
      if (res.ok) setGraphStatus(await res.json());
    } catch (err) {
      console.error('Failed to fetch graph status:', err);
      setFetchError('图谱状态加载失败');
    }
  }

  async function fetchTopics() {
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        if (data.length > 0 && !selectedTopic) setSelectedTopic(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch topics:', err);
      setFetchError('主题列表加载失败');
    }
  }

  function mapNodeType(type: string): GraphNodeType {
    const m: Record<string, GraphNodeType> = {
      topic: 'topic', entity: 'entity', event: 'event', claim: 'claim', document: 'document',
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

        setNodes(apiNodes.map((n, index) => {
          const label = n.label.length > 25 ? n.label.substring(0, 25) + '...' : n.label;
          const isHighlighted = highlightEntities.length > 0 &&
            highlightEntities.some(h => n.label.toLowerCase().includes(h));
          return {
            id: n.id,
            type: 'custom' as const,
            position: { x: 400 + (index % 5) * 150, y: 200 + Math.floor(index / 5) * 100 },
            data: {
              label,
              type: mapNodeType(n.type),
              description: n.properties?.description || n.properties?.title || n.label,
              url: n.properties?.url,
              topicId: topicId,
              highlighted: highlightEntities.length > 0 ? isHighlighted : undefined,
            },
          };
        }));

        setEdges(apiLinks.map(e => {
          // Map edge labels to valid types
          const labelLower = e.label.toLowerCase();
          let edgeType: 'has_entity' | 'has_claim' | 'supports' | 'contradicts' | 'related_to' = 'related_to';
          if (labelLower.includes('has_entity') || labelLower.includes('实体')) {
            edgeType = 'has_entity';
          } else if (labelLower.includes('has_claim') || labelLower.includes('主张')) {
            edgeType = 'has_claim';
          } else if (labelLower.includes('supports') || labelLower.includes('支持')) {
            edgeType = 'supports';
          } else if (labelLower.includes('contradicts') || labelLower.includes('反驳')) {
            edgeType = 'contradicts';
          }
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            data: {
              type: edgeType,
              label: EDGE_LABELS[e.label] || e.label,
            },
          };
        }));
      }
    } catch {
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch recent developments with time filter
  async function fetchRecentDevelopments(topicId: string, hours: number) {
    setRecentDevLoading(true);
    try {
      const res = await fetch(`/api/graph/recent/${topicId}?hours=${hours}`);
      if (res.ok) {
        const data = await res.json();
        setRecentDevelopments(data);
      }
    } catch (err) {
      console.error('Failed to fetch recent developments:', err);
    } finally {
      setRecentDevLoading(false);
    }
  }

  // Auto-fetch recent developments when time filter changes
  useEffect(() => {
    if (selectedTopic && showRecentDevelopments) {
      fetchRecentDevelopments(selectedTopic, selectedTimeFilter.hours);
    }
  }, [selectedTimeFilter, showRecentDevelopments, selectedTopic]);

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = !searchQuery ||
      node.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.data.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = nodeFilters.has(node.data.type);
    return matchesSearch && matchesFilter;
  });

  const filteredEdges = edges.filter(edge => {
    return filteredNodes.find(n => n.id === edge.source) && filteredNodes.find(n => n.id === edge.target);
  });

  const toggleNodeFilter = (type: GraphNodeType) => {
    const newFilters = new Set(nodeFilters);
    if (newFilters.has(type)) newFilters.delete(type);
    else newFilters.add(type);
    setNodeFilters(newFilters);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col space-y-4 animate-fade-in">
      {fetchError && (
        <div className="bg-[#ff3b30]/10 text-[#ff3b30] text-sm px-4 py-2 rounded-xl flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="text-[#ff3b30]/60 hover:text-[#ff3b30]">✕</button>
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <PageHeader
          title="知识图谱"
          description={showRecentDevelopments ? "时间感知的最近发展动态" : "可视化展示技术实体、组织和文献之间的关联网络"}
          stats={graphStatus ? [
            ...(graphStatus.nodeCount !== undefined ? [{ label: '节点', value: graphStatus.nodeCount }] : []),
            ...(graphStatus.relationshipCount !== undefined ? [{ label: '关系', value: graphStatus.relationshipCount }] : []),
          ] : undefined}
        />
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value)}
            className={INPUT}
          >
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            onClick={() => setShowRecentDevelopments(!showRecentDevelopments)}
            className={`px-3.5 py-2 rounded-[980px] text-sm font-medium transition-all ${showRecentDevelopments ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}
          >
            ⏱ 最近动态
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`px-3.5 py-2 rounded-[980px] text-sm font-medium transition-all ${showHelp ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="bg-[#0071e3]/5 rounded-[18px] p-5 text-sm text-[#1d1d1f] animate-fade-in">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium mb-2">图谱含义</h4>
              <ul className="space-y-1 text-[#86868b]">
                <li>主题节点 — 追踪的技术方向</li>
                <li>实体节点 — 关键技术、组织、人物</li>
                <li>文献节点 — 采集到的论文和新闻</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">交互操作</h4>
              <ul className="space-y-1 text-[#86868b]">
                <li>拖拽 — 移动节点位置</li>
                <li>滚轮 — 缩放图谱</li>
                <li>单击 — 查看节点详情</li>
                <li>双击 — 打开关联链接</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">数据来源</h4>
              <ul className="space-y-1 text-[#86868b]">
                <li>采集文档后图谱会自动同步</li>
                <li>在「主题追踪」页点击「采集」触发全流程</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Graph Container */}
      <div className={`flex-1 ${CARD} overflow-hidden flex flex-col`}>
        {/* Toolbar */}
        {!showRecentDevelopments ? (
          <>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb5]" />
                  <input
                    type="text"
                    placeholder="搜索实体、组织或文献..."
                    className={`${INPUT} pl-9 pr-3 w-64`}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {NODE_TYPE_OPTIONS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => toggleNodeFilter(value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                        nodeFilters.has(value)
                          ? 'bg-[#f5f5f7] text-[#1d1d1f]'
                          : 'text-[#aeaeb5] hover:text-[#86868b]'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${nodeFilters.has(value) ? color : 'bg-[#d2d2d7]'}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-[#86868b]">{filteredNodes.length} 节点, {filteredEdges.length} 关系</span>
            </div>

            {/* Graph Area */}
            <div className="flex-1 relative">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[#aeaeb5]">
                  <div className={`${SPINNER} mr-3`} />
                  加载中...
                </div>
              ) : filteredNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#aeaeb5]">
                  <p className="mb-2 text-lg">暂无图谱数据</p>
                  <p className="mb-4 text-sm">请先在「主题追踪」采集文档，图谱将自动同步</p>
                  <Link
                    to="/topics"
                    className="px-5 py-2 bg-[#0071e3] text-white rounded-[980px] text-sm font-medium hover:bg-[#0062cc] transition-all"
                  >
                    前往主题追踪
                  </Link>
                </div>
              ) : (
                <GraphVisualization
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  onNodeClick={node => console.log('Node clicked:', node)}
                  onNodeDoubleClick={node => { if (node.data.url) window.open(node.data.url, '_blank'); }}
                  focusNodeIds={highlightEntities.length > 0 ? nodes.filter(n => n.data.highlighted).map(n => n.id) : undefined}
                />
              )}
            </div>
          </>
        ) : (
          /* Recent Developments View */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Time Filter Toolbar */}
            <div className="px-6 py-4 border-b border-[#f5f5f7] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#86868b]">时间范围:</span>
                {TIME_FILTER_OPTIONS.map((filter) => (
                  <button
                    key={filter.hours}
                    onClick={() => setSelectedTimeFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedTimeFilter.hours === filter.hours
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {recentDevelopments && (
                <div className="text-xs text-[#86868b]">
                  {recentDevelopments.counts.documents} 文献 · {recentDevelopments.counts.entities} 实体 · {recentDevelopments.counts.emergingRelations} 新连接
                </div>
              )}
            </div>

            {/* Recent Developments Content */}
            <div className="flex-1 overflow-y-auto">
              {recentDevLoading ? (
                <div className="flex items-center justify-center h-full text-[#aeaeb5]">
                  <div className={`${SPINNER} mr-3`} />
                  加载最近动态...
                </div>
              ) : recentDevelopments ? (
                <div className="p-6 space-y-6">
                  {/* Emerging Connections */}
                  {recentDevelopments.emergingRelations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#ff9f0a]" />
                        新兴连接
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {recentDevelopments.emergingRelations.map((rel, idx) => (
                          <div key={idx} className="bg-[#f5f5f7] rounded-xl p-4">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium text-[#0071e3]">{rel.sourceName}</span>
                              <span className="text-[#86868b]">→</span>
                              <span className="font-medium text-[#0071e3]">{rel.targetName}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-3 text-xs text-[#86868b]">
                              <span>{rel.relationType}</span>
                              <span>置信度: {Math.round(rel.confidence * 100)}%</span>
                              <span>首次: {new Date(rel.firstSeenDate).toLocaleDateString('zh-CN')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Documents */}
                  {recentDevelopments.documents.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#34c759]" />
                        最新文献
                      </h3>
                      <div className="space-y-2">
                        {recentDevelopments.documents.map((doc) => (
                          <div key={doc.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                            doc.urgency === 'breaking' ? 'bg-[#ff3b30]/5' : 'bg-[#f5f5f7]'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                              doc.urgency === 'breaking' ? 'bg-[#ff3b30]' :
                              doc.urgency === 'developing' ? 'bg-[#ff9f0a]' :
                              'bg-[#34c759]'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#1d1d1f] truncate">{doc.title}</p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-[#86868b]">
                                <span>{doc.source}</span>
                                <span>·</span>
                                <span>相关度: {Math.round(doc.relevanceScore * 100)}%</span>
                                {doc.freshnessHours < 6 && (
                                  <span className="px-1.5 py-0.5 bg-[#ff3b30]/10 text-[#ff3b30] rounded">最新</span>
                                )}
                              </div>
                            </div>
                            {doc.url && (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#0071e3] hover:underline text-xs shrink-0"
                              >
                                查看
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Entities */}
                  {recentDevelopments.entities.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#0071e3]" />
                        活跃实体
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {recentDevelopments.entities.map((entity) => (
                          <div
                            key={entity.id}
                            className="px-3 py-2 bg-[#f5f5f7] rounded-xl flex items-center gap-2 hover:bg-[#e8e8ed] transition-colors"
                          >
                            <span className="text-sm text-[#1d1d1f]">{entity.name}</span>
                            <span className="text-xs text-[#86868b]">{entity.documentCount} 文献</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {recentDevelopments.counts.documents === 0 &&
                   recentDevelopments.counts.entities === 0 &&
                   recentDevelopments.counts.emergingRelations === 0 && (
                    <div className="text-center py-12 text-[#86868b]">
                      <p>该时间段内暂无活动数据</p>
                      <p className="text-sm mt-1">尝试选择更长的时间范围</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[#86868b]">
                  <p>选择时间范围查看最近动态</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
