import { useState, useEffect } from 'react';
import { Search, X, ArrowRight, Activity, Clock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
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
    sourceName: string;
    targetName: string;
    relationType: string;
    confidence: number;
    firstSeenDate: string;
  }>;
  timeRange: { hours: number; cutoffDate: string };
  counts: { documents: number; entities: number; emergingRelations: number };
}

const EDGE_LABELS: Record<string, string> = {
  'HAS_ENTITY': '实体', 'ABOUT': '关于', 'HAS_EVENT': '事件',
  'HAS_CLAIM': '主张', 'PARTICIPATED_IN': '参与', 'RELATED_TO': '相关',
  'DEVELOPS': '研发', 'COMPETES_WITH': '竞争', 'USES': '使用',
  'INVESTS_IN': '投资', 'PARTNERS_WITH': '合作', 'PUBLISHED_BY': '发布',
  'SUPPORTS': '支持', 'CONTRADICTS': '反驳', 'MENTIONS': '提及',
};

const NODE_FILTERS: Array<{ value: GraphNodeType; label: string; color: string }> = [
  { value: 'topic', label: 'TOPIC', color: '#4A8B9E' },
  { value: 'entity', label: 'ENTITY', color: '#9A7DA8' },
  { value: 'event', label: 'EVENT', color: '#C49A5C' },
  { value: 'claim', label: 'CLAIM', color: '#C46B5C' },
  { value: 'document', label: 'DOC', color: '#6B9E7A' },
];

const TIME_FILTERS: TimeFilter[] = [
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '3D', hours: 72 },
  { label: '7D', hours: 168 },
  { label: '30D', hours: 720 },
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

  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilter>(TIME_FILTERS[1]);
  const [showRecent, setShowRecent] = useState(false);
  const [recentData, setRecentData] = useState<RecentDevelopment | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    fetchGraphStatus();
    fetchTopics();
    const urlTopicId = new URLSearchParams(location.search).get('topicId');
    if (urlTopicId) setSelectedTopic(urlTopicId);
  }, []);

  useEffect(() => {
    if (selectedTopic) fetchTopicGraph(selectedTopic);
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic && showRecent) fetchRecent(selectedTopic, selectedTimeFilter.hours);
  }, [selectedTimeFilter, showRecent, selectedTopic]);

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
      topic: 'topic', entity: 'entity', event: 'event', claim: 'claim', document: 'document',
      organization: 'entity', person: 'entity', technology: 'entity',
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

        setNodes(apiNodes.map((n) => {
          const label = n.label.length > 25 ? n.label.substring(0, 25) + '...' : n.label;
          const isHighlighted = highlightEntities.length > 0 &&
            highlightEntities.some(h => n.label.toLowerCase().includes(h));
          return {
            id: n.id, type: 'custom' as const,
            position: { x: 0, y: 0 },
            data: {
              label, type: mapNodeType(n.type),
              description: n.properties?.description || n.properties?.title || n.label,
              url: n.properties?.url, topicId,
              highlighted: highlightEntities.length > 0 ? isHighlighted : undefined,
            },
          };
        }));

        setEdges(apiLinks.map(e => {
          const labelLower = e.label.toLowerCase();
          let edgeType: 'has_entity' | 'has_claim' | 'supports' | 'contradicts' | 'related_to' = 'related_to';
          if (labelLower.includes('has_entity') || labelLower.includes('实体')) edgeType = 'has_entity';
          else if (labelLower.includes('has_claim') || labelLower.includes('主张')) edgeType = 'has_claim';
          else if (labelLower.includes('supports') || labelLower.includes('支持')) edgeType = 'supports';
          else if (labelLower.includes('contradicts') || labelLower.includes('反驳')) edgeType = 'contradicts';
          return {
            id: e.id, source: e.source, target: e.target,
            data: { type: edgeType, label: EDGE_LABELS[e.label] || e.label },
          };
        }));
      }
    } catch { setNodes([]); setEdges([]); }
    finally { setLoading(false); }
  }

  async function fetchRecent(topicId: string, hours: number) {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/graph/recent/${topicId}?hours=${hours}`);
      if (res.ok) setRecentData(await res.json());
    } catch {}
    finally { setRecentLoading(false) }
  }

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = !searchQuery ||
      node.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.data.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && nodeFilters.has(node.data.type);
  });

  const filteredEdges = edges.filter(edge =>
    filteredNodes.find(n => n.id === edge.source) && filteredNodes.find(n => n.id === edge.target)
  );

  const toggleFilter = (type: GraphNodeType) => {
    const next = new Set(nodeFilters);
    next.has(type) ? next.delete(type) : next.add(type);
    setNodeFilters(next);
  };

  // Current topic name for display
  const currentTopic = topics.find(t => t.id === selectedTopic);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#F7F7F7] text-[#1d1d1f]">
      {/* ── Header ── */}
      <div className="px-8 py-4 flex items-center justify-between border-b border-[#1d1d1f]">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-extrabold tracking-tight leading-none">
            KNOWLEDGE<br />GRAPH
          </h1>
          <div className="h-8 w-px bg-[#1d1d1f]/20" />
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value)}
            className="bg-transparent border border-[#1d1d1f] rounded-full px-4 py-1.5 text-sm font-semibold cursor-pointer hover:bg-[#D1D1D1] transition-colors"
          >
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRecent(!showRecent)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all ${
              showRecent
                ? 'bg-[#1d1d1f] text-[#F7F7F7] border-[#1d1d1f]'
                : 'bg-[#D1D1D1] border-[#1d1d1f] hover:bg-[#b8b8b8]'
            }`}
          >
            <Clock className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            Recent
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph Canvas */}
        <div className="flex-1 flex flex-col p-6 pb-6">
          {/* Search & Filter Bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888]" />
              <input
                type="text"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-[#F7F7F7] border border-[#1d1d1f] rounded-full pl-9 pr-4 py-1.5 text-sm font-medium placeholder:text-[#888] focus:outline-none focus:ring-2 focus:ring-[#1d1d1f]/20 w-56"
              />
            </div>
            <div className="flex items-center gap-1">
              {NODE_FILTERS.map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => toggleFilter(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    nodeFilters.has(value)
                      ? 'border-[#1d1d1f] bg-[#F7F7F7] text-[#1d1d1f]'
                      : 'border-[#1d1d1f]/20 text-[#888] bg-transparent hover:border-[#1d1d1f]/40'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: nodeFilters.has(value) ? color : '#ccc' }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Viewport */}
          <div className="flex-1 bg-[#1d1d1f] rounded-3xl border border-[#1d1d1f] relative overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[#F7F7F7]/40">
                <div className="w-5 h-5 border-2 border-[#F7F7F7]/30 border-t-[#F7F7F7] rounded-full animate-spin mr-3" />
                <span className="text-sm font-medium">Loading...</span>
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#F7F7F7]/40">
                <p className="text-lg font-bold mb-2">NO DATA</p>
                <p className="text-sm mb-4">Collect documents first to build the graph</p>
                <Link
                  to="/topics"
                  className="px-5 py-2 bg-[#D1D1D1] text-[#1d1d1f] rounded-full text-sm font-bold border border-[#1d1d1f] hover:bg-[#b8b8b8] transition-colors"
                >
                  Go to Topics →
                </Link>
              </div>
            ) : (
              <GraphVisualization
                nodes={filteredNodes}
                edges={filteredEdges}
                onNodeClick={node => console.log('Node:', node)}
                onNodeDoubleClick={node => { if (node.data.url) window.open(node.data.url, '_blank'); }}
                focusNodeIds={highlightEntities.length > 0 ? nodes.filter(n => n.data.highlighted).map(n => n.id) : undefined}
              />
            )}

            {/* Stats overlay — like MNEMOSYNE coordinate-tag */}
            {!loading && filteredNodes.length > 0 && (
              <div className="absolute bottom-5 left-5 z-10 pointer-events-none">
                <div className="font-mono text-[10px] bg-white/10 backdrop-blur-sm text-white/60 px-3 py-1.5 rounded inline-block">
                  {filteredNodes.length} NODES · {filteredEdges.length} EDGES
                  {currentTopic ? ` · ${currentTopic.name.toUpperCase()}` : ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-80 border-l border-[#1d1d1f] flex flex-col overflow-hidden">
          {/* Recent Developments */}
          {showRecent ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1d1d1f]">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">Time Range</div>
                <div className="flex gap-1">
                  {TIME_FILTERS.map(f => (
                    <button
                      key={f.hours}
                      onClick={() => setSelectedTimeFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        selectedTimeFilter.hours === f.hours
                          ? 'bg-[#1d1d1f] text-[#F7F7F7]'
                          : 'bg-[#D1D1D1] text-[#1d1d1f] hover:bg-[#b8b8b8]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {recentLoading ? (
                  <div className="flex items-center justify-center py-8 text-[#888]">
                    <div className="w-4 h-4 border-2 border-[#888]/30 border-t-[#888] rounded-full animate-spin mr-2" />
                    <span className="text-xs font-medium">Loading...</span>
                  </div>
                ) : recentData ? (
                  <div className="space-y-6">
                    {/* Emerging Relations */}
                    {recentData.emergingRelations.length > 0 && (
                      <div>
                        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">New Connections</div>
                        <div className="space-y-2">
                          {recentData.emergingRelations.map((rel, i) => (
                            <div key={i} className="flex items-start gap-2 py-2 border-b border-[#1d1d1f]/10 last:border-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#C46B5C] mt-1.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold flex items-center gap-1">
                                  <span className="truncate">{rel.sourceName}</span>
                                  <ArrowRight className="w-3 h-3 text-[#888] shrink-0" />
                                  <span className="truncate">{rel.targetName}</span>
                                </div>
                                <div className="mt-0.5 font-mono text-[9px] text-[#888]">
                                  {rel.relationType} · {Math.round(rel.confidence * 100)}%
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Active Entities */}
                    {recentData.entities.length > 0 && (
                      <div>
                        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">Active Entities</div>
                        <div className="flex flex-wrap gap-1.5">
                          {recentData.entities.map(ent => (
                            <span
                              key={ent.id}
                              className="px-2.5 py-1 bg-[#1d1d1f] text-[#F7F7F7] rounded-full text-[10px] font-bold"
                            >
                              {ent.name}
                              <span className="ml-1 opacity-50 font-mono">{ent.documentCount}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Documents */}
                    {recentData.documents.length > 0 && (
                      <div>
                        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">Latest Documents</div>
                        <div className="space-y-2">
                          {recentData.documents.slice(0, 8).map(doc => (
                            <div key={doc.id} className="py-2 border-b border-[#1d1d1f]/10 last:border-0">
                              <p className="text-xs font-medium text-[#1d1d1f] truncate">{doc.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 font-mono text-[9px] text-[#888]">
                                <span>{doc.source}</span>
                                {doc.freshnessHours < 6 && (
                                  <span className="px-1 py-0.5 bg-[#A0453A] text-white rounded text-[8px] font-bold">NEW</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty */}
                    {recentData.counts.documents === 0 && recentData.counts.entities === 0 && recentData.counts.emergingRelations === 0 && (
                      <div className="text-center py-8 text-[#888]">
                        <p className="text-sm font-medium">No activity</p>
                        <p className="text-xs mt-1">Try a wider time range</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#888] text-xs">Select time range</div>
                )}
              </div>
            </div>
          ) : (
            /* Default sidebar: Entity List + System Health */
            <div className="flex-1 overflow-y-auto">
              {/* Entity Index */}
              <div className="px-5 py-4 border-b border-[#1d1d1f]">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">Entity Index</div>
                <ul className="space-y-0">
                  {nodes
                    .filter(n => n.data.type === 'entity')
                    .sort((a, b) => (b.data.description?.length || 0) - (a.data.description?.length || 0))
                    .slice(0, 20)
                    .map(node => (
                      <li key={node.id} className="flex justify-between items-center py-2 border-b border-[#1d1d1f]/8 last:border-0 text-xs">
                        <span className="font-medium truncate">{node.data.label}</span>
                        <span className="font-mono text-[9px] text-[#888] shrink-0 ml-2">
                          {node.data.description && node.data.description !== node.data.label
                            ? node.data.description.slice(0, 12)
                            : '—'}
                        </span>
                      </li>
                    ))
                  }
                  {nodes.filter(n => n.data.type === 'entity').length === 0 && (
                    <li className="py-4 text-[#888] text-xs text-center">No entities loaded</li>
                  )}
                </ul>
              </div>

              {/* System Health */}
              <div className="px-5 py-4">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-3">System Health</div>
                <div className="font-mono text-[10px] text-[#1d1d1f] space-y-1">
                  <div>Backend: {graphStatus?.backend || '—'}</div>
                  <div>Nodes: {graphStatus?.nodeCount ?? nodes.length}</div>
                  <div>Edges: {graphStatus?.relationshipCount ?? edges.length}</div>
                  {graphStatus?.lastSyncAt && (
                    <div>Sync: {new Date(graphStatus.lastSyncAt).toLocaleString('zh-CN')}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
