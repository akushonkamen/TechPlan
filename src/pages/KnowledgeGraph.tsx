import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, ArrowRight, Clock, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw, BarChart3 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import GraphVisualization from '../components/GraphVisualization';
import { rankNodesByImportance } from '../lib/graphLayout';
import type { GraphLayoutMode } from '../lib/graphLayout';
import {
  DEFAULT_VISIBLE_RELATIONS,
  getEdgeVisualType,
  getGraphRelationLabel,
  normalizeGraphNodeType,
  normalizeGraphRelationType,
  type GraphEdge,
  type GraphNode,
  type GraphNodeType,
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
  const [nodeFilters, setNodeFilters] = useState<Set<GraphNodeType>>(new Set(['technology', 'product', 'organization', 'entity', 'event']));
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [relFilters, setRelFilters] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_RELATIONS));
  const [viewMode, setViewMode] = useState<GraphLayoutMode>('terrain');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [sensemaking, setSensemaking] = useState<GraphSensemakingResult | null>(null);
  const [sensemakingLoading, setSensemakingLoading] = useState(false);
  const [sensemakingRefreshing, setSensemakingRefreshing] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [rightCollapsed, setRightCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
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
  // Analysis state
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<'stats' | 'path' | 'centrality' | 'communities' | 'predictions' | 'anomalies'>('stats');
  const [graphStats, setGraphStats] = useState<any>(null);
  const [pathResult, setPathResult] = useState<any>(null);
  const [pathSource, setPathSource] = useState('');
  const [pathTarget, setPathTarget] = useState('');
  const [centralityData, setCentralityData] = useState<any[]>([]);
  const [communityData, setCommunityData] = useState<any[]>([]);
  const [predictionData, setPredictionData] = useState<any[]>([]);
  const [anomalyData, setAnomalyData] = useState<any[]>([]);
  const [leftWidth, setLeftWidth] = useState(() => Math.min(280, Math.round(window.innerWidth * 0.2)));
  const [rightWidth, setRightWidth] = useState(() => Math.min(340, Math.round(window.innerWidth * 0.25)));
  const resizing = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { side, startX: e.clientX, startWidth: side === 'left' ? leftWidth : rightWidth };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const vw = window.innerWidth;
      const dx = ev.clientX - resizing.current.startX;
      const lo = side === 'left' ? Math.max(200, Math.round(vw * 0.14)) : Math.max(260, Math.round(vw * 0.18));
      const hi = side === 'left' ? Math.min(420, Math.round(vw * 0.28)) : Math.min(500, Math.round(vw * 0.32));
      const raw = side === 'left' ? resizing.current.startWidth + dx : resizing.current.startWidth - dx;
      const clamped = Math.max(lo, Math.min(hi, raw));
      side === 'left' ? setLeftWidth(clamped) : setRightWidth(clamped);
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth, rightWidth]);

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
              url: n.properties?.url || n.properties?.latestDocUrl, topicId,
              metadata: n.properties,
              highlighted: highlightEntities.length > 0 ? isHighlighted : undefined,
              importance: n.properties?.importance,
              latestDocUrl: n.properties?.latestDocUrl,
              latestPubDate: n.properties?.latestPubDate,
              docCount: n.properties?.docCount,
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
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          setSensemaking(await res.json());
        } else {
          console.warn('Graph sensemaking returned non-JSON response:', contentType);
        }
      }
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
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          setSensemaking(await res.json());
        } else {
          console.warn('Graph sensemaking refresh returned non-JSON response:', contentType);
        }
      }
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
      await fetchNodeNeighbors(node.id);
    }
    setExpandedNodes(newExpanded);
  }

  // Fetch neighboring nodes for a given node
  async function fetchNodeNeighbors(nodeId: string) {
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
                latestDocUrl: n.properties?.latestDocUrl,
                latestPubDate: n.properties?.latestPubDate,
                docCount: n.properties?.docCount,
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

  async function fetchAnalysis() {
    if (!selectedTopic) return;
    const base = `/api/graph`;
    try {
      const [statsRes, centralityRes, communitiesRes, predictionsRes, anomaliesRes] = await Promise.all([
        fetch(`${base}/stats/${selectedTopic}`),
        fetch(`${base}/centrality/${selectedTopic}?top=20`),
        fetch(`${base}/communities/${selectedTopic}`),
        fetch(`${base}/predictions/${selectedTopic}?top=15`),
        fetch(`${base}/anomalies/${selectedTopic}`),
      ]);
      if (statsRes.ok) setGraphStats(await statsRes.json());
      if (centralityRes.ok) setCentralityData(await centralityRes.json());
      if (communitiesRes.ok) setCommunityData(await communitiesRes.json());
      if (predictionsRes.ok) setPredictionData(await predictionsRes.json());
      if (anomaliesRes.ok) setAnomalyData(await anomaliesRes.json());
    } catch (error) {
      console.error('Failed to fetch analysis:', error);
    }
  }

  async function fetchPath() {
    if (!selectedTopic || !pathSource || !pathTarget) return;
    try {
      const res = await fetch(`/api/graph/path/${selectedTopic}/${encodeURIComponent(pathSource)}/${encodeURIComponent(pathTarget)}`);
      if (res.ok) setPathResult(await res.json());
    } catch (error) {
      console.error('Failed to find path:', error);
    }
  }

  useEffect(() => {
    if (showAnalysis && selectedTopic) fetchAnalysis();
  }, [showAnalysis, selectedTopic]);

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
    const topEvents = rankNodesByImportance(eventNodes, edges).slice(0, 5);
    topEvents.forEach(item => visible.add(item.node.id));

    // Include entities connected to visible events via PARTICIPATED_IN
    const topEventIds = new Set(topEvents.map(item => item.node.id));
    edges
      .filter(e => e.data?.relationType === 'PARTICIPATED_IN' && topEventIds.has(e.target))
      .forEach(e => visible.add(e.source));

    if (nodeFilters.has('claim')) {
      const claimNodes = sourceNodes.filter(node => node.data.type === 'claim');
      const topClaims = rankNodesByImportance(claimNodes, edges).slice(0, 8);
      topClaims.forEach(item => visible.add(item.node.id));
      // Include entities connected to visible claims via MENTIONS
      const topClaimIds = new Set(topClaims.map(item => item.node.id));
      edges
        .filter(e => e.data?.relationType === 'MENTIONS' && topClaimIds.has(e.target))
        .forEach(e => visible.add(e.source));
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
            (search && searchMode === 'highlight' && !searchMatched) ||
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
      return edge.data?.relationType ? relFilters.has(edge.data.relationType) : true;
    })
    .filter(edge => {
      if (viewMode !== 'terrain') return true;
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      const sourceCluster = sourceNode?.data.clusterId;
      const targetCluster = targetNode?.data.clusterId;
      if (!sourceCluster || !targetCluster) return true;
      if (selectedClusterId) return sourceCluster === selectedClusterId || targetCluster === selectedClusterId;
      const relation = edge.data?.relationType;
      const sameCluster = sourceCluster === targetCluster;
      const cluster = sameCluster ? clusterById.get(sourceCluster) : undefined;
      const clusterFocus = Boolean(relation && cluster?.relationFocus.includes(relation));
      const edgeConfidence = edge.data?.confidence ?? 0.5;
      const highConfidence = edgeConfidence >= 0.7;
      const mediumConfidence = edgeConfidence >= 0.55;
      const bridge = sourceNode?.data.clusterRole === 'bridge' || targetNode?.data.clusterRole === 'bridge';
      const anchorPair = sourceNode?.data.clusterRole === 'anchor' || targetNode?.data.clusterRole === 'anchor';
      return sameCluster
        ? clusterFocus || highConfidence || (mediumConfidence && anchorPair)
        : (highConfidence && (bridge || anchorPair)) || (mediumConfidence && anchorPair);
    });

  const semanticEdges = candidateEdges
    .sort((a, b) => (b.data?.confidence ?? 0.5) - (a.data?.confidence ?? 0.5));

  // Separate event/claim edges (PARTICIPATED_IN, MENTIONS) from entity-entity edges
  const isStructuralEdge = (e: typeof candidateEdges[0]) =>
    e.data?.relationType === 'PARTICIPATED_IN' || e.data?.relationType === 'MENTIONS';
  const entityEdges = semanticEdges.filter(e => !isStructuralEdge(e));
  const eventClaimEdges = semanticEdges.filter(isStructuralEdge);

  const filteredEdges = [
    ...(shouldUseCoreCap ? entityEdges.slice(0, 40) : entityEdges),
    ...eventClaimEdges,
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
    <div className="min-h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-[#F7F7F7] text-[#1A1A1A]"
      style={{ fontFamily: "'Inter', 'Lexend', sans-serif" }}>

      {/* ═══ Header — Bauhaus thick border ═══ */}
      <div className="px-3 py-3 flex flex-col gap-3 border-b-[3px] border-[#1A1A1A] sm:px-5 lg:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Topology View</span>
            <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-[-1px] leading-none lowercase mt-0.5">
              knowledge graph
            </h1>
          </div>
          <div className="hidden h-8 w-px bg-[#1A1A1A]/15 sm:block" />
          <select
            value={selectedTopic || ''}
            onChange={e => setSelectedTopic(e.target.value)}
            className="w-full min-w-0 bg-transparent border-[1.5px] border-[#1A1A1A] px-4 py-1.5 text-sm font-semibold cursor-pointer hover:bg-[#E6DBC6]/30 transition-colors sm:w-64"
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <div className="max-w-full overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 border-[1.5px] border-[#1A1A1A]/20 p-0.5" style={{ borderRadius: '0 12px 12px 12px' }}>
            {([
              ['radar', '雷达'],
              ['terrain', '地形图'],
              ['focus', '聚焦'],
              ['timeline', '时间线'],
              ['grid', '网格'],
              ['matrix', '矩阵'],
              ['bundle', '环形'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setViewMode(value as GraphLayoutMode)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] transition-all ${
                  viewMode === value ? 'bg-[#1A1A1A] text-[#F7F7F7]' : 'text-[#888] hover:text-[#1A1A1A]'
                }`}
                style={{ borderRadius: '0 8px 8px 8px' }}
              >
                {label}
              </button>
            ))}
            </div>
          </div>
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
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1.5px] border-[1.5px] transition-all ${
              showAnalysis
                ? 'bg-[#1A1A1A] text-[#F7F7F7] border-[#1A1A1A]'
                : 'bg-transparent border-[#1A1A1A]/20 text-[#888] hover:border-[#1A1A1A]/50'
            }`}
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            <BarChart3 className="w-3 h-3" />
            ANALYSIS
          </button>
        </div>
      </div>

      {/* ═══ Main: 3-column Bauhaus grid ═══ */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden lg:flex-row">

        {/* ── Left Panel: Entity Index (collapsible + resizable) ── */}
        <div
          className={`relative w-full border-b-[1.5px] border-[#1A1A1A] flex flex-col overflow-hidden shrink-0 lg:border-b-0 lg:border-r-[1.5px] ${leftCollapsed ? 'h-10 lg:h-auto lg:w-10' : 'h-72 lg:h-auto'}`}
          style={!leftCollapsed ? { width: leftWidth, minWidth: 200, maxWidth: 420 } : undefined}
        >
          {/* Resize handle */}
          {!leftCollapsed && (
            <div
              onMouseDown={(e) => handleResizeStart('left', e)}
              className="hidden lg:block absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#1A1A1A]/20 transition-colors z-10"
            />
          )}
          {/* Toggle button */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="flex items-center justify-center gap-1.5 h-10 border-b border-[#1A1A1A]/10 text-[#888] hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/[0.04] transition-colors"
            title={leftCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
            {!leftCollapsed && <span className="text-[9px] font-bold uppercase tracking-wider">收起侧栏</span>}
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
        <div className="flex-1 min-h-[360px] min-w-[400px] flex flex-col overflow-hidden lg:min-h-0">
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
                viewMode={viewMode}
                terrainClusters={terrainClusters}
                onViewModeChange={setViewMode}
                onNodeDoubleClick={handleNodeDoubleClick}
                focusNodeIds={highlightEntities.length > 0 ? nodes.filter(n => n.data.highlighted).map(n => n.id) : undefined}
                topicId={selectedTopic}
                searchQuery={searchQuery}
              />
            )}

            {/* No stats overlay */}
          </div>
        </div>

        {/* ── Right Panel: Stats & Details (collapsible + resizable) ── */}
        <div
          className={`relative w-full border-t-[1.5px] border-[#1A1A1A] flex flex-col overflow-hidden shrink-0 lg:border-l-[1.5px] lg:border-t-0 ${rightCollapsed ? 'h-10 lg:h-auto lg:w-10' : 'h-80 lg:h-auto'}`}
          style={!rightCollapsed ? { width: rightWidth, minWidth: 260, maxWidth: 500 } : undefined}
        >
          {/* Resize handle */}
          {!rightCollapsed && (
            <div
              onMouseDown={(e) => handleResizeStart('right', e)}
              className="hidden lg:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#1A1A1A]/20 transition-colors z-10"
            />
          )}
          {/* Toggle button */}
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="flex items-center justify-center gap-1.5 h-10 border-b border-[#1A1A1A]/10 text-[#888] hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/[0.04] transition-colors"
            title={rightCollapsed ? '展开面板' : '收起面板'}
          >
            {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-3.5 h-3.5" />}
            {!rightCollapsed && <span className="text-[9px] font-bold uppercase tracking-wider">收起面板</span>}
          </button>
          {!rightCollapsed && (showAnalysis ? (
            /* ── Analysis Panel ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 pt-5 pb-2 border-b-[3px] border-[#1A1A1A]">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Graph Analysis</span>
              </div>
              {/* Analysis tabs */}
              <div className="px-4 py-2 border-b border-[#1A1A1A]/10 flex flex-wrap gap-1">
                {(['stats', 'path', 'centrality', 'communities', 'predictions', 'anomalies'] as const).map(tab => (
                  <button key={tab} onClick={() => setAnalysisTab(tab)}
                    className={`px-2 py-1 text-[8px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                      analysisTab === tab ? 'bg-[#1A1A1A] text-[#F7F7F7]' : 'bg-[#F7F7F7] text-[#888] hover:bg-[#1A1A1A]/10'
                    }`}
                    style={{ borderRadius: '0 6px 6px 6px' }}
                  >
                    {tab === 'stats' ? '统计' : tab === 'path' ? '路径' : tab === 'centrality' ? '中心性' : tab === 'communities' ? '社区' : tab === 'predictions' ? '预测' : '异常'}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {/* Stats tab */}
                {analysisTab === 'stats' && graphStats && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Nodes', value: graphStats.nodeCount },
                        { label: 'Edges', value: graphStats.edgeCount },
                        { label: 'Density', value: graphStats.density.toFixed(4) },
                        { label: 'Components', value: graphStats.connectedComponents },
                        { label: 'Diameter', value: graphStats.diameter },
                        { label: 'Clustering', value: graphStats.avgClusteringCoefficient.toFixed(3) },
                        { label: 'Avg Degree', value: graphStats.avgDegree },
                        { label: 'Max Degree', value: graphStats.maxDegree },
                      ].map(item => (
                        <div key={item.label} className="p-2 bg-[#1A1A1A]/[0.03]">
                          <span className="font-mono text-[14px] font-extrabold block">{item.value}</span>
                          <span className="text-[8px] font-bold uppercase tracking-wider text-[#888]">{item.label}</span>
                        </div>
                      ))}
                    </div>
                    {graphStats.topDegreeNodes?.length > 0 && (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888] mb-2">Top Nodes</div>
                        {graphStats.topDegreeNodes.slice(0, 8).map((n: any) => (
                          <div key={n.id} className="flex justify-between items-center py-1 border-b border-[#1A1A1A]/8">
                            <span className="text-[11px] font-semibold truncate">{n.label}</span>
                            <span className="font-mono text-[10px] text-[#888]">{n.degree}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {analysisTab === 'stats' && !graphStats && (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">Loading stats...</div>
                )}

                {/* Path tab */}
                {analysisTab === 'path' && (
                  <div className="space-y-3">
                    <div className="text-[9px] text-[#888] uppercase tracking-wider">Find shortest path between two entities</div>
                    <select value={pathSource} onChange={e => setPathSource(e.target.value)}
                      className="w-full bg-transparent border-b-[1.5px] border-[#1A1A1A]/30 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A]">
                      <option value="">Source entity...</option>
                      {nodesWithSensemaking.map(n => (
                        <option key={n.id} value={n.id}>{n.data.label}</option>
                      ))}
                    </select>
                    <select value={pathTarget} onChange={e => setPathTarget(e.target.value)}
                      className="w-full bg-transparent border-b-[1.5px] border-[#1A1A1A]/30 py-1.5 text-xs focus:outline-none focus:border-[#1A1A1A]">
                      <option value="">Target entity...</option>
                      {nodesWithSensemaking.map(n => (
                        <option key={n.id} value={n.id}>{n.data.label}</option>
                      ))}
                    </select>
                    <button onClick={fetchPath} disabled={!pathSource || !pathTarget}
                      className="w-full py-2 bg-[#1A1A1A] text-[#F7F7F7] text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-30"
                      style={{ borderRadius: '0 8px 8px 8px' }}
                    >
                      Find Path
                    </button>
                    {pathResult && (
                      <div className="bg-[#1A1A1A]/[0.04] p-3">
                        {pathResult.found ? (
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-[#888] mb-2">
                              Path ({pathResult.path.length} hops, weight {pathResult.totalWeight.toFixed(2)})
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {pathResult.pathLabels?.map((label: string, i: number) => (
                                <span key={i} className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 bg-[#1A1A1A] text-[#F7F7F7] text-[9px] font-bold" style={{ borderRadius: '0 6px 6px 6px' }}>{label}</span>
                                  {i < pathResult.pathLabels.length - 1 && <ArrowRight className="w-3 h-3 text-[#D94F26]" />}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#888]">No path found</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Centrality tab */}
                {analysisTab === 'centrality' && centralityData.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888] mb-2">PageRank Top 20</div>
                    {centralityData.map((item: any) => (
                      <div key={item.nodeId} className="flex items-center gap-2 py-1.5 border-b border-[#1A1A1A]/8">
                        <span className="font-mono text-[9px] text-[#888] w-4">{item.rank}</span>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_FILTERS.find(f => f.value === item.type)?.color || '#9A7DA8' }} />
                        <span className="text-[11px] font-semibold truncate flex-1">{item.label}</span>
                        <span className="font-mono text-[9px] text-[#888]">{(item.score * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {analysisTab === 'centrality' && centralityData.length === 0 && (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">Loading...</div>
                )}

                {/* Communities tab */}
                {analysisTab === 'communities' && communityData.length > 0 && (
                  <div className="space-y-3">
                    {communityData.slice(0, 8).map((community: any, i: number) => (
                      <div key={community.id} className="pb-3 border-b border-[#1A1A1A]/8">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[11px] font-extrabold">{community.label}</span>
                          <span className="font-mono text-[9px] text-[#888]">{community.size} nodes</span>
                        </div>
                        <div className="text-[9px] text-[#888]">
                          Type: {community.dominantType} · Confidence: {Math.round(community.avgConfidence * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {analysisTab === 'communities' && communityData.length === 0 && (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">Loading...</div>
                )}

                {/* Predictions tab */}
                {analysisTab === 'predictions' && predictionData.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888] mb-2">Predicted Links</div>
                    {predictionData.map((pred: any, i: number) => (
                      <div key={i} className="py-2 border-b border-[#1A1A1A]/8">
                        <div className="text-[11px] font-semibold flex items-center gap-1">
                          <span className="truncate">{pred.sourceLabel}</span>
                          <ArrowRight className="w-3 h-3 text-[#D94F26] shrink-0" />
                          <span className="truncate">{pred.targetLabel}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[9px] text-[#888]">
                          {pred.method} · score {pred.score.toFixed(3)} · {pred.commonNeighbors} shared neighbors
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {analysisTab === 'predictions' && predictionData.length === 0 && (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">Loading...</div>
                )}

                {/* Anomalies tab */}
                {analysisTab === 'anomalies' && anomalyData.length > 0 && (
                  <div className="space-y-2">
                    {anomalyData.map((anomaly: any) => (
                      <div key={anomaly.nodeId} className="py-2 border-b border-[#1A1A1A]/8">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-semibold">{anomaly.label}</span>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                            anomaly.severity > 0.7 ? 'bg-[#ff3b30] text-white' : anomaly.severity > 0.4 ? 'bg-[#ff9f0a] text-white' : 'bg-[#1A1A1A]/10 text-[#888]'
                          }`} style={{ borderRadius: '0 4px 4px 4px' }}>
                            {anomaly.anomalyType.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#888] mt-0.5">{anomaly.description}</p>
                      </div>
                    ))}
                  </div>
                )}
                {analysisTab === 'anomalies' && anomalyData.length === 0 && (
                  <div className="text-center py-8 text-[#888] text-[10px] uppercase tracking-wider">No anomalies detected</div>
                )}
              </div>
            </div>
          ) : showRecent ? (
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
