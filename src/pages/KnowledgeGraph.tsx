import { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRight, Activity, Clock, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import GraphVisualization, {
  GraphNode,
  GraphEdge,
  GraphNodeType,
} from '../components/GraphVisualization';
import { rankNodesByImportance } from '../lib/graphLayout';
import type { GraphLayoutMode } from '../lib/graphLayout';
import {
  DEFAULT_VISIBLE_RELATIONS,
  getEdgeVisualType,
  getGraphRelationLabel,
  normalizeGraphNodeType,
  normalizeGraphRelationType,
  type GraphSensemakingResult,
} from '../types/graph';

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
  nodeCount: number;
  relationshipCount: number;
  claimCount: number;
  eventCount: number;
  lastSyncAt?: string;
  sqliteNodeCount?: number;
  sqliteRelationshipCount?: number;
  kuzuNodeCount?: number;
  kuzuRelCount?: number;
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

// Bauhaus palette
const NODE_FILTERS: Array<{ value: GraphNodeType; label: string; color: string; shape: 'circle' | 'teardrop' | 'square' | 'diamond' }> = [
  { value: 'topic', label: 'TOPIC', color: '#1A1A1A', shape: 'circle' },
  { value: 'technology', label: 'TECH', color: '#D94F26', shape: 'circle' },
  { value: 'product', label: 'PRODUCT', color: '#5085A5', shape: 'teardrop' },
  { value: 'organization', label: 'ORG', color: '#F29F05', shape: 'square' },
  { value: 'entity', label: 'OTHER', color: '#9A7DA8', shape: 'circle' },
  { value: 'event', label: 'EVENT', color: '#C49A5C', shape: 'diamond' },
  { value: 'claim', label: 'CLAIM', color: '#C46B5C', shape: 'diamond' },
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
  const [searchMode, setSearchMode] = useState<'highlight' | 'filter'>('highlight');
  const [nodeFilters, setNodeFilters] = useState<Set<GraphNodeType>>(new Set(['topic', 'technology', 'product', 'organization', 'entity', 'event']));
  const [showTopicLinks, setShowTopicLinks] = useState(false);
  const [relFilters, setRelFilters] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_RELATIONS));
  const [showPulse, setShowPulse] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<GraphLayoutMode>('terrain');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [sensemaking, setSensemaking] = useState<GraphSensemakingResult | null>(null);
  const [sensemakingLoading, setSensemakingLoading] = useState(false);
  const [sensemakingRefreshing, setSensemakingRefreshing] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
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
    if (selectedTopic) {
      fetchTopicGraph(selectedTopic);
      if (showRecent) fetchRecent(selectedTopic, selectedTimeFilter.hours);
    }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic && showRecent) {
      fetchRecent(selectedTopic, selectedTimeFilter.hours);
    }
  }, [selectedTimeFilter, showRecent]);

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
        setTopics(data.map((t: any) => ({ id: t.id, name: t.name })));
        if (data.length > 0 && !selectedTopic) setSelectedTopic(data[0].id);
      }
    } catch {}
  }

  function mapNodeType(type: string): GraphNodeType {
    return normalizeGraphNodeType(type);
  }

  async function fetchTopicGraph(topicId: string) {
    setLoading(true);
    try {
      // Fetch with depth=1 for default spoke view (only direct connections)
      const res = await fetch(`/api/graph/topic/${topicId}?hop=1`);
      if (res.ok) {
        const data = await res.json();
        const apiNodes: ApiNode[] = data.nodes || [];
        const apiLinks: ApiLink[] = data.links || [];

        const mappedNodes = apiNodes.map((n) => {
          const fullLabel = n.label || n.id;
          const label = fullLabel.length > 25 ? fullLabel.substring(0, 25) + '...' : fullLabel;
          const isHighlighted = highlightEntities.length > 0 &&
            highlightEntities.some(h => fullLabel.toLowerCase().includes(h));
          return {
            id: n.id, type: 'custom' as const,
            position: { x: 0, y: 0 },
            data: {
              label, type: mapNodeType(n.type),
              fullLabel,
              canonicalName: n.properties?.canonicalName || n.properties?.name || fullLabel,
              description: n.properties?.description || n.properties?.title || fullLabel,
              url: n.properties?.url, topicId,
              metadata: n.properties,
              highlighted: highlightEntities.length > 0 ? isHighlighted : undefined,
              importance: n.properties?.importance,
            },
          };
        });

        const mappedEdges = apiLinks.map(e => {
          const relationType = normalizeGraphRelationType(e.label);
          return {
            id: e.id, source: e.source, target: e.target,
            data: {
              type: getEdgeVisualType(relationType),
              label: getGraphRelationLabel(relationType),
              relationType,
              confidence: e.properties?.confidence,
            },
          };
        });

        setNodes(mappedNodes);
        setEdges(mappedEdges);

        // Reset expanded state
        setExpandedNodes(new Set());
        setSelectedClusterId(null);
        fetchSensemaking(topicId);
      }
    } catch { setNodes([]); setEdges([]); }
    finally { setLoading(false); }
  }

  async function fetchSensemaking(topicId: string) {
    setSensemakingLoading(true);
    try {
      const res = await fetch(`/api/graph/sensemaking/${encodeURIComponent(topicId)}`);
      if (res.ok) setSensemaking(await res.json());
    } catch (error) {
      console.error('Failed to fetch graph sensemaking:', error);
    } finally {
      setSensemakingLoading(false);
    }
  }

  async function refreshSensemaking() {
    if (!selectedTopic) return;
    setSensemakingRefreshing(true);
    try {
      const res = await fetch(`/api/graph/sensemaking/${encodeURIComponent(selectedTopic)}/refresh`, { method: 'POST' });
      if (res.ok) setSensemaking(await res.json());
      window.setTimeout(() => fetchSensemaking(selectedTopic), 3000);
    } catch (error) {
      console.error('Failed to refresh graph sensemaking:', error);
    } finally {
      setSensemakingRefreshing(false);
    }
  }

  // Handle node double-click to expand neighbors
  async function handleNodeDoubleClick(node: GraphNode) {
    // Toggle expansion
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(node.id)) {
      newExpanded.delete(node.id);
    } else {
      newExpanded.add(node.id);
      // Fetch neighbors for this node
      await fetchNodeNeighbors(node.id, selectedTopic!);
    }
    setExpandedNodes(newExpanded);
  }

  // Fetch neighboring nodes for a given node
  async function fetchNodeNeighbors(nodeId: string, topicId: string) {
    try {
      // Find entity label from nodeId
      const entityNode = nodes.find(n => n.id === nodeId);
      if (!entityNode) return;
      const entityName = entityNode.data.canonicalName || entityNode.data.fullLabel || entityNode.data.label;
      const encoded = encodeURIComponent(entityName);
      const res = await fetch(`/api/graph/neighbor/${encoded}`);
      if (res.ok) {
        const data = await res.json();
        const graph = data.graph || data;
        const apiNodes: ApiNode[] = graph.nodes || [];
        const apiLinks: ApiLink[] = graph.links || [];
        const existingIds = new Set(nodes.map(n => n.id));
        const existingEdges = new Set(edges.map(e => e.id));

        const newNodes: GraphNode[] = apiNodes
          .filter((n: ApiNode) => !existingIds.has(n.id))
          .map((n: ApiNode) => {
            const fullLabel = n.label || n.id;
            return {
              id: n.id, type: 'custom' as const,
              position: { x: 0, y: 0 },
              data: {
                label: fullLabel.length > 25 ? fullLabel.substring(0, 25) + '...' : fullLabel,
                fullLabel,
                canonicalName: n.properties?.canonicalName || n.properties?.name || fullLabel,
                type: mapNodeType(n.type),
                description: n.properties?.description || fullLabel,
                metadata: n.properties,
                importance: n.properties?.importance,
                highlighted: false,
              },
            };
          });

        const newEdges: GraphEdge[] = apiLinks
          .filter((e: ApiLink) => !existingEdges.has(`nb-${e.id}`) && !existingEdges.has(e.id))
          .map((e: ApiLink) => {
            const relationType = normalizeGraphRelationType(e.label);
            return {
              id: `nb-${e.id}`,
              source: e.source, target: e.target,
              data: {
                type: getEdgeVisualType(relationType),
                label: getGraphRelationLabel(relationType),
                relationType,
                confidence: e.properties?.confidence,
              },
            };
          });

        setNodes(prev => [...prev, ...newNodes]);
        setEdges(prev => [...prev, ...newEdges]);
      }
    } catch (error) {
      console.error('Failed to fetch neighbors:', error);
    }
  }

  async function fetchRecent(topicId: string, hours: number) {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/graph/recent/${topicId}?hours=${hours}`);
      if (res.ok) setRecentData(await res.json());
    } catch {}
    finally { setRecentLoading(false) }
  }

  function relationKey(source: string, relation: string, target: string) {
    return `${source.trim().toLowerCase()}|${normalizeGraphRelationType(relation)}|${target.trim().toLowerCase()}`;
  }

  const search = searchQuery.trim().toLowerCase();
  const recentNodeIds = useMemo(() => new Set((recentData?.entities || []).map(ent => ent.id)), [recentData]);
  const recentRelationKeys = useMemo(() => new Set((recentData?.emergingRelations || []).map(rel =>
    relationKey(rel.sourceName, rel.relationType, rel.targetName)
  )), [recentData]);
  const terrainClusters = sensemaking?.clusters || [];
  const clusterById = useMemo(() => new Map(terrainClusters.map(cluster => [cluster.id, cluster])), [terrainClusters]);
  const assignmentByNodeId = useMemo(() => new Map((sensemaking?.assignments || []).map(item => [item.nodeId, item])), [sensemaking]);
  const nodesWithSensemaking = useMemo(() => nodes.map(node => {
    const assignment = assignmentByNodeId.get(node.id);
    const cluster = assignment ? clusterById.get(assignment.clusterId) : undefined;
    return {
      ...node,
      data: {
        ...node.data,
        clusterId: assignment?.clusterId,
        clusterLabel: cluster?.label,
        clusterRole: assignment?.role,
      },
    };
  }), [nodes, assignmentByNodeId, clusterById]);
  const nodesById = useMemo(() => new Map(nodesWithSensemaking.map(node => [node.id, node])), [nodesWithSensemaking]);

  const matchesSearch = (node: GraphNode) => {
    if (!search) return false;
    const haystack = [
      node.data.label,
      node.data.fullLabel,
      node.data.canonicalName,
      node.data.description,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search);
  };

  const coreNodeIds = useMemo(() => {
    const visible = new Set<string>();
    const sourceNodes = nodesWithSensemaking;
    sourceNodes.filter(node => node.data.type === 'topic').forEach(node => visible.add(node.id));
    expandedNodes.forEach(id => visible.add(id));

    if (viewMode === 'terrain' && terrainClusters.length > 0) {
      for (const cluster of terrainClusters.slice(0, 6)) {
        const clusterNodes = sourceNodes.filter(node => node.data.clusterId === cluster.id);
        const ranked = rankNodesByImportance(clusterNodes, edges).map(item => item.node);
        const selected = selectedClusterId === cluster.id;
        ranked
          .filter((node, index) => selected || node.data.clusterRole === 'anchor' || node.data.clusterRole === 'member' || index < 5)
          .slice(0, selected ? 18 : 7)
          .forEach(node => visible.add(node.id));
      }
    } else {
      const entityNodes = sourceNodes.filter(node => ['technology', 'product', 'organization', 'entity'].includes(node.data.type));
      rankNodesByImportance(entityNodes, edges).slice(0, 24).forEach(item => visible.add(item.node.id));
    }

    const eventNodes = sourceNodes.filter(node => node.data.type === 'event');
    rankNodesByImportance(eventNodes, edges).slice(0, 5).forEach(item => visible.add(item.node.id));

    if (nodeFilters.has('claim')) {
      const claimNodes = sourceNodes.filter(node => node.data.type === 'claim');
      rankNodesByImportance(claimNodes, edges).slice(0, 8).forEach(item => visible.add(item.node.id));
    }

    sourceNodes.filter(node => node.data.highlighted || recentNodeIds.has(node.id)).forEach(node => visible.add(node.id));
    return visible;
  }, [nodesWithSensemaking, edges, expandedNodes, nodeFilters, recentNodeIds, viewMode, terrainClusters, selectedClusterId]);

  const shouldUseCoreCap = !search && expandedNodes.size === 0;

  const filteredNodes = nodesWithSensemaking
    .filter(node => nodeFilters.has(node.data.type))
    .filter(node => searchMode === 'filter' && search ? matchesSearch(node) : true)
    .filter(node => shouldUseCoreCap ? coreNodeIds.has(node.id) : true)
    .map(node => {
      const searchMatched = search ? matchesSearch(node) : undefined;
      const recent = showRecent && recentNodeIds.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          searchMatched,
          dimmed: Boolean(
            (search && searchMode === 'highlight' && !searchMatched && node.data.type !== 'topic') ||
            (viewMode === 'terrain' && selectedClusterId && node.data.clusterId && node.data.clusterId !== selectedClusterId)
          ),
          recent: node.data.recent || recent,
        },
      };
    });

  const visibleNodeIds = new Set(filteredNodes.map(node => node.id));
  const candidateEdges = edges
    .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .filter(edge => {
      if (edge.data?.type === 'has_entity') return showTopicLinks;
      const structural = edge.data?.type === 'has_event' || edge.data?.type === 'has_claim';
      if (structural) return true;
      return edge.data?.relationType ? relFilters.has(edge.data.relationType) : true;
    })
    .filter(edge => {
      if (viewMode !== 'terrain') return true;
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      const sourceCluster = sourceNode?.data.clusterId;
      const targetCluster = targetNode?.data.clusterId;
      if (!sourceCluster || !targetCluster) return edge.data?.type === 'has_event';
      if (selectedClusterId) return sourceCluster === selectedClusterId || targetCluster === selectedClusterId;
      const relation = edge.data?.relationType;
      const sameCluster = sourceCluster === targetCluster;
      const cluster = sameCluster ? clusterById.get(sourceCluster) : undefined;
      const clusterFocus = Boolean(relation && cluster?.relationFocus.includes(relation));
      const highConfidence = (edge.data?.confidence ?? 0.5) >= 0.75;
      const bridge = sourceNode?.data.clusterRole === 'bridge' || targetNode?.data.clusterRole === 'bridge';
      const anchorPair = sourceNode?.data.clusterRole === 'anchor' || targetNode?.data.clusterRole === 'anchor';
      return sameCluster
        ? clusterFocus || highConfidence || anchorPair
        : highConfidence && (bridge || anchorPair);
    });

  const structuralEdges = candidateEdges.filter(edge =>
    edge.data?.type === 'has_entity' || edge.data?.type === 'has_event' || edge.data?.type === 'has_claim'
  );
  const semanticEdges = candidateEdges
    .filter(edge => !structuralEdges.includes(edge))
    .sort((a, b) => (b.data?.confidence ?? 0.5) - (a.data?.confidence ?? 0.5));

  const filteredEdges = [
    ...structuralEdges,
    ...(shouldUseCoreCap ? semanticEdges.slice(0, 40) : semanticEdges),
  ].map(edge => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourceMatched = sourceNode ? matchesSearch(sourceNode) : false;
    const targetMatched = targetNode ? matchesSearch(targetNode) : false;
    const outsideSelectedCluster = Boolean(
      viewMode === 'terrain' &&
      selectedClusterId &&
      sourceNode?.data.clusterId !== selectedClusterId &&
      targetNode?.data.clusterId !== selectedClusterId
    );
    const recent = showRecent && recentRelationKeys.has(relationKey(
      sourceNode?.data.canonicalName || sourceNode?.data.fullLabel || sourceNode?.data.label || '',
      edge.data?.relationType || edge.data?.label || '',
      targetNode?.data.canonicalName || targetNode?.data.fullLabel || targetNode?.data.label || ''
    ));
    return {
      ...edge,
      data: {
        ...edge.data!,
        dimmed: Boolean((search && searchMode === 'highlight' && !sourceMatched && !targetMatched) || outsideSelectedCluster),
        recent: edge.data?.recent || recent,
      },
    };
  });

  const toggleFilter = (type: GraphNodeType) => {
    const next = new Set(nodeFilters);
    next.has(type) ? next.delete(type) : next.add(type);
    setNodeFilters(next);
  };

  const toggleRelFilter = (relType: string) => {
    const next = new Set(relFilters);
    next.has(relType) ? next.delete(relType) : next.add(relType);
    setRelFilters(next);
  };

  // Current topic name for display
  const currentTopic = topics.find(t => t.id === selectedTopic);

  // Entity type counts
  const entityCounts = nodes.reduce((acc, n) => {
    acc[n.data.type] = (acc[n.data.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#F7F7F7] text-[#1A1A1A]"
      style={{ fontFamily: "'Inter', 'Lexend', sans-serif" }}>

      {/* ═══ Header — Bauhaus thick border ═══ */}
      <div className="px-8 py-3 flex items-center justify-between border-b-[3px] border-[#1A1A1A]">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Topology View</span>
            <h1 className="text-[26px] font-extrabold tracking-[-1px] leading-none lowercase mt-0.5">
              knowledge graph
            </h1>
          </div>
          <div className="h-8 w-px bg-[#1A1A1A]/15" />
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value)}
            className="bg-transparent border-[1.5px] border-[#1A1A1A] px-4 py-1.5 text-sm font-semibold cursor-pointer hover:bg-[#E6DBC6]/30 transition-colors"
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border-[1.5px] border-[#1A1A1A]/20 p-0.5" style={{ borderRadius: '0 12px 12px 12px' }}>
            {[
              { value: 'terrain', label: '地形图' },
              { value: 'focus', label: '聚焦' },
              { value: 'timeline', label: '时间线' },
              { value: 'grid', label: '网格' },
            ].map(item => (
              <button
                key={item.value}
                onClick={() => setViewMode(item.value as GraphLayoutMode)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] transition-all ${
                  viewMode === item.value ? 'bg-[#1A1A1A] text-[#F7F7F7]' : 'text-[#888] hover:text-[#1A1A1A]'
                }`}
                style={{ borderRadius: '0 8px 8px 8px' }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTopicLinks(!showTopicLinks)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.5px] border-[1.5px] transition-all ${
              showTopicLinks
                ? 'bg-[#1A1A1A] text-[#F7F7F7] border-[#1A1A1A]'
                : 'bg-transparent border-[#1A1A1A]/20 text-[#888] hover:border-[#1A1A1A]/50'
            }`}
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            <Network className="w-3 h-3" />
            {showTopicLinks ? 'LINKS ON' : 'LINKS OFF'}
          </button>
          <button
            onClick={() => setShowPulse(!showPulse)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.5px] border-[1.5px] transition-all ${
              showPulse
                ? 'bg-[#1A1A1A] text-[#F7F7F7] border-[#1A1A1A]'
                : 'bg-transparent border-[#1A1A1A]/20 text-[#888] hover:border-[#1A1A1A]/50'
            }`}
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            <Activity className="w-3 h-3" />
            {showPulse ? 'PULSE ON' : 'PULSE OFF'}
          </button>
          <button
            onClick={() => setShowRecent(!showRecent)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.5px] border-[1.5px] transition-all ${
              showRecent
                ? 'bg-[#1A1A1A] text-[#F7F7F7] border-[#1A1A1A]'
                : 'bg-transparent border-[#1A1A1A]/20 text-[#888] hover:border-[#1A1A1A]/50'
            }`}
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            <Clock className="w-3 h-3" />
            RECENT
          </button>
        </div>
      </div>

      {/* ═══ Main: 3-column Bauhaus grid ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Panel: Entity Index (collapsible) ── */}
        <div className={`border-r-[1.5px] border-[#1A1A1A] flex flex-col overflow-hidden shrink-0 transition-all duration-200 ${leftCollapsed ? 'w-10' : 'w-[280px]'}`}>
          {/* Toggle button */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="flex items-center justify-center h-10 border-b border-[#1A1A1A]/10 text-[#888] hover:text-[#1A1A1A] transition-colors"
            title={leftCollapsed ? '展开面板' : '收起面板'}
          >
            {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {!leftCollapsed && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Section title */}
              <div className="px-5 pt-5 pb-2 border-b-[3px] border-[#1A1A1A]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Terrain Clusters</span>
                    <p className="mt-1 text-[9px] font-mono uppercase text-[#aaa]">
                      {sensemakingLoading ? 'loading' : sensemaking?.status || 'fallback'}
                    </p>
                  </div>
                  <button
                    onClick={refreshSensemaking}
                    disabled={sensemakingRefreshing || !selectedTopic}
                    className="p-1.5 text-[#888] hover:text-[#1A1A1A] disabled:opacity-40"
                    title="刷新语义地形"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sensemakingRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

          {/* Search */}
              <div className="px-4 py-3 border-b border-[#1A1A1A]/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#888]" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-b-[1.5px] border-[#1A1A1A]/30 pl-8 pr-2 py-1.5 text-xs font-medium placeholder:text-[#aaa] focus:outline-none focus:border-[#1A1A1A]"
              />
            </div>
            <button
              onClick={() => setSearchMode(searchMode === 'highlight' ? 'filter' : 'highlight')}
              className="mt-2 text-[9px] font-bold uppercase tracking-wider text-[#888] hover:text-[#1A1A1A]"
            >
              Search: {searchMode}
            </button>
              </div>

          {/* Node type filters */}
              <div className="px-4 py-2.5 border-b border-[#1A1A1A]/10 flex flex-wrap gap-1">
            {NODE_FILTERS.map(({ value, label, color, shape }) => (
              <button
                key={value}
                onClick={() => toggleFilter(value)}
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border-[1px] transition-all ${
                  nodeFilters.has(value)
                    ? 'border-[#1A1A1A] bg-[#1A1A1A]/5 text-[#1A1A1A]'
                    : 'border-[#1A1A1A]/10 text-[#bbb] bg-transparent'
                }`}
              >
                <div
                  className="w-2 h-2 shrink-0"
                  style={{
                    background: nodeFilters.has(value) ? color : '#ccc',
                    borderRadius: shape === 'circle' ? '50%' : shape === 'teardrop' ? '0 50% 50% 50%' : shape === 'diamond' ? '2px' : '0',
                    transform: shape === 'diamond' ? 'rotate(45deg) scale(0.7)' : 'none',
                  }}
                />
                {label}
              </button>
            ))}
              </div>

          {/* Relation type filters */}
              <div className="px-4 py-2.5 border-b border-[#1A1A1A]/10">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#888] mb-2">Relations</div>
            <div className="flex flex-wrap gap-1">
              {DEFAULT_VISIBLE_RELATIONS.map(rel => (
                <button
                  key={rel}
                  onClick={() => toggleRelFilter(rel)}
                  className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border-[1px] transition-all ${
                    relFilters.has(rel)
                      ? 'border-[#1A1A1A] bg-[#1A1A1A]/5 text-[#1A1A1A]'
                      : 'border-[#1A1A1A]/10 text-[#bbb] bg-transparent'
                  }`}
                  style={{ borderRadius: '0 6px 6px 6px' }}
                >
                  {rel.toLowerCase()}
                </button>
              ))}
            </div>
              </div>

              {/* Cluster list */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {terrainClusters.length > 0 ? terrainClusters.slice(0, 6).map(cluster => {
                  const isSelected = selectedClusterId === cluster.id;
                  const nodeCount = cluster.nodeIds.length;
                  return (
                    <button
                      key={cluster.id}
                      onClick={() => setSelectedClusterId(isSelected ? null : cluster.id)}
                      onDoubleClick={() => {
                        // Enter ego focus mode: select cluster and switch to focus layout
                        setSelectedClusterId(cluster.id);
                        setViewMode('focus');
                      }}
                      className={`block w-full text-left py-3 border-b border-[#1A1A1A]/8 transition-colors ${
                        isSelected ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/70 hover:text-[#1A1A1A]'
                      }`}
                      title="单击高亮，双击进入聚焦模式"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12px] font-extrabold leading-snug">{cluster.label}</span>
                        <span className="font-mono text-[9px] text-[#888]">{nodeCount}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[#888]">{cluster.summary}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {cluster.relationFocus.slice(0, 3).map(rel => (
                          <span key={rel} className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-[#1A1A1A]/5 text-[#777]">
                            {rel.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                }) : (
                  <div className="py-8 text-[#aaa] text-[10px] text-center uppercase tracking-wider">
                    Building terrain
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Center: Graph Viewport ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Viewport */}
          <div className="flex-1 bg-[#F7F7F7] relative overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[#1A1A1A]/30">
                <div className="w-5 h-5 border-2 border-[#1A1A1A]/20 border-t-[#D94F26] rounded-full animate-spin mr-3" />
                <span className="text-xs font-medium uppercase tracking-wider">Loading...</span>
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#1A1A1A]/30">
                <p className="text-sm font-bold uppercase tracking-wider mb-2">No Data</p>
                <p className="text-xs mb-4 opacity-60">Collect documents first to build the graph</p>
                <Link
                  to="/topics"
                  className="px-5 py-2 bg-[#1A1A1A] text-[#F7F7F7] text-xs font-bold uppercase tracking-wider border-[1.5px] border-[#1A1A1A] hover:bg-[#333] transition-colors"
                  style={{ borderRadius: '0 12px 12px 12px' }}
                >
                  Go to Topics →
                </Link>
              </div>
            ) : (
              <GraphVisualization
                nodes={filteredNodes}
                edges={filteredEdges}
                onNodeClick={node => {}}
                onNodeDoubleClick={handleNodeDoubleClick}
                focusNodeIds={highlightEntities.length > 0 ? nodes.filter(n => n.data.highlighted).map(n => n.id) : undefined}
                showPulse={showPulse}
                layoutMode={viewMode}
                onLayoutModeChange={setViewMode}
                terrainClusters={terrainClusters}
                selectedClusterId={selectedClusterId}
              />
            )}

            {/* No stats overlay */}
          </div>
        </div>

        {/* ── Right Panel: Stats & Details (collapsible) ── */}
        <div className={`border-l-[1.5px] border-[#1A1A1A] flex flex-col overflow-hidden shrink-0 transition-all duration-200 ${rightCollapsed ? 'w-10' : 'w-[340px]'}`}>
          {/* Toggle button */}
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="flex items-center justify-center h-10 border-b border-[#1A1A1A]/10 text-[#888] hover:text-[#1A1A1A] transition-colors"
            title={rightCollapsed ? '展开面板' : '收起面板'}
          >
            {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
          </button>
          {!rightCollapsed && (showRecent ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Time Range */}
              <div className="px-5 pt-5 pb-3 border-b-[3px] border-[#1A1A1A]">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Time Range</span>
                  <span className="font-mono text-[9px] text-[#aaa]">{selectedTimeFilter.label}</span>
                </div>
                <div className="flex gap-1">
                  {TIME_FILTERS.map(f => (
                    <button
                      key={f.hours}
                      onClick={() => setSelectedTimeFilter(f)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider border-[1.5px] transition-all ${
                        selectedTimeFilter.hours === f.hours
                          ? 'bg-[#1A1A1A] text-[#F7F7F7] border-[#1A1A1A]'
                          : 'bg-transparent border-[#1A1A1A]/15 text-[#888] hover:border-[#1A1A1A]/40'
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
                    <div className="w-4 h-4 border-2 border-[#888]/20 border-t-[#D94F26] rounded-full animate-spin mr-2" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">Loading...</span>
                  </div>
                ) : recentData ? (
                  <div className="space-y-6">
                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-[#1A1A1A]/[0.03]">
                        <span className="font-mono text-[18px] font-extrabold block">{recentData.counts.documents}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#888]">Docs</span>
                      </div>
                      <div className="p-3 bg-[#1A1A1A]/[0.03]">
                        <span className="font-mono text-[18px] font-extrabold block">{recentData.counts.entities}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#888]">Entities</span>
                      </div>
                      <div className="p-3 bg-[#1A1A1A]/[0.03]">
                        <span className="font-mono text-[18px] font-extrabold block">{recentData.counts.emergingRelations}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#888]">Relations</span>
                      </div>
                    </div>

                    {/* Emerging Relations */}
                    {recentData.emergingRelations.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888] mb-3 pb-2 border-b-[3px] border-[#1A1A1A]">New Connections</div>
                        <div className="space-y-2">
                          {recentData.emergingRelations.map((rel, i) => (
                            <div key={i} className="py-2 border-b border-[#1A1A1A]/8 last:border-0">
                              <div className="text-[11px] font-semibold flex items-center gap-1">
                                <span className="truncate">{rel.sourceName}</span>
                                <ArrowRight className="w-3 h-3 text-[#D94F26] shrink-0" />
                                <span className="truncate">{rel.targetName}</span>
                              </div>
                              <div className="mt-0.5 font-mono text-[9px] text-[#888]">
                                {rel.relationType} · <span className="font-bold">{Math.round(rel.confidence * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Active Entities */}
                    {recentData.entities.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888] mb-3 pb-2 border-b-[3px] border-[#1A1A1A]">Active Entities</div>
                        <div className="flex flex-wrap gap-1.5">
                          {recentData.entities.map(ent => (
                            <span
                              key={ent.id}
                              className="px-2 py-1 bg-[#1A1A1A] text-[#F7F7F7] text-[10px] font-bold"
                              style={{ borderRadius: '0 8px 8px 8px' }}
                            >
                              {ent.name}
                              <span className="ml-1 opacity-40 font-mono">{ent.documentCount}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Documents */}
                    {recentData.documents.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888] mb-3 pb-2 border-b-[3px] border-[#1A1A1A]">Latest Documents</div>
                        <div className="space-y-2">
                          {recentData.documents.slice(0, 8).map(doc => (
                            <div key={doc.id} className="py-2 border-b border-[#1A1A1A]/8 last:border-0">
                              <p className="text-[11px] font-semibold truncate">{doc.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 font-mono text-[9px] text-[#888]">
                                <span>{doc.source}</span>
                                {doc.freshnessHours < 6 && (
                                  <span className="px-1 py-0.5 bg-[#D94F26] text-white text-[8px] font-bold">NEW</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {recentData.counts.documents === 0 && recentData.counts.entities === 0 && recentData.counts.emergingRelations === 0 && (
                      <div className="text-center py-8 text-[#888]">
                        <p className="text-xs font-medium uppercase tracking-wider">No activity</p>
                        <p className="text-[10px] mt-1 opacity-60">Try a wider time range</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">Select time range</div>
                )}
              </div>
            </div>
          ) : (
            /* Default right panel: Bauhaus stat blocks */
            <div className="flex-1 overflow-y-auto">
              {/* System Metrics */}
              <div className="px-5 pt-5 pb-2 border-b-[3px] border-[#1A1A1A]">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Path Metrics</span>
              </div>

              <div className="px-5">
                <div className="flex justify-between items-baseline py-3 border-b-[1.5px] border-[#1A1A1A]">
                  <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Nodes</span>
                  <span className="font-mono text-[20px] font-extrabold">{graphStatus?.nodeCount ?? nodes.length}</span>
                </div>
                <div className="flex justify-between items-baseline py-3 border-b-[1.5px] border-[#1A1A1A]">
                  <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Relations</span>
                  <span className="font-mono text-[20px] font-extrabold">{graphStatus?.relationshipCount ?? edges.length}</span>
                </div>
                <div className="flex justify-between items-baseline py-3 border-b-[1.5px] border-[#1A1A1A]">
                  <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Claims</span>
                  <span className="font-mono text-[20px] font-extrabold">{graphStatus?.claimCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-baseline py-3 border-b-[1.5px] border-[#1A1A1A]">
                  <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Events</span>
                  <span className="font-mono text-[20px] font-extrabold">{graphStatus?.eventCount ?? 0}</span>
                </div>
              </div>

              {/* Type Distribution */}
              <div className="px-5 pt-5 pb-2 border-b-[3px] border-[#1A1A1A] mt-4">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Node Distribution</span>
              </div>
              <div className="px-5 py-3">
                {NODE_FILTERS.filter(f => f.value !== 'topic').map(({ value, label, color }) => {
                  const count = entityCounts[value] || 0;
                  if (count === 0) return null;
                  const maxCount = Math.max(...Object.values(entityCounts), 1);
                  return (
                    <div key={value} className="py-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                        <span className="font-mono text-[11px] font-bold">{count}</span>
                      </div>
                      <div className="h-[10px] bg-[#1A1A1A]/5 w-full">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${(count / maxCount) * 100}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {sensemaking?.readingPath?.length ? (
                <>
                  <div className="px-5 pt-5 pb-2 border-b-[3px] border-[#1A1A1A] mt-4">
                    <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Reading Path</span>
                  </div>
                  <div className="px-5 py-3 space-y-2">
                    {sensemaking.readingPath.slice(0, 5).map((step, index) => (
                      <button
                        key={`${step.title}-${index}`}
                        onClick={() => {
                          const cluster = terrainClusters.find(item => step.nodeIds.some(nodeId => item.nodeIds.includes(nodeId)));
                          if (cluster) setSelectedClusterId(cluster.id);
                        }}
                        className="block w-full text-left py-2 border-b border-[#1A1A1A]/8 last:border-0"
                      >
                        <span className="font-mono text-[9px] text-[#888] mr-2">{index + 1}</span>
                        <span className="text-[11px] font-semibold">{step.title}</span>
                        <span className="block mt-0.5 text-[9px] text-[#aaa]">{step.nodeIds.length} nodes · {step.relationIds.length} links</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {/* Logic card */}
              {currentTopic && (
                <div className="px-5 mt-2">
                  <div className="bg-[#1A1A1A]/[0.04] p-4">
                    <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888] block mb-2">Active Topic</span>
                    <p className="text-xs font-medium leading-relaxed text-[#1A1A1A]/70">
                      {currentTopic.name}
                    </p>
                    {graphStatus?.lastSyncAt && (
                      <p className="font-mono text-[9px] text-[#888] mt-2">
                        Last sync: {new Date(graphStatus.lastSyncAt).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Footer — Bauhaus dark bar ═══ */}
      <div className="bg-[#1A1A1A] text-[#F7F7F7] px-8 py-2 flex justify-between items-center shrink-0">
        <div className="flex items-center">
          <div className="w-2 h-2 bg-[#F29F05] rounded-full mr-2 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-white/50">
            {graphStatus?.backend || 'SQLite'} · Graph Active — {filteredNodes.length} nodes loaded
          </span>
        </div>
        <div className="font-mono text-[9px] tracking-[2px] text-white/30">
          {currentTopic ? `TOPIC: ${currentTopic.id.slice(0, 8).toUpperCase()}` : 'NO TOPIC'}
        </div>
      </div>
    </div>
  );
}
