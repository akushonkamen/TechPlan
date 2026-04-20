import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { GraphEdge, GraphNode, GraphSensemakingCluster } from '../types/graph';
import type { GraphLayoutMode } from '../lib/graphLayout';
import { applyGraphLayout, rankNodesByImportance } from '../lib/graphLayout';

const POS_KEY_PREFIX = 'graph-pos';

function savePositions(topicId: string | undefined, mode: string, positions: Map<string, { x: number; y: number }>) {
  if (!topicId) return;
  const obj: Record<string, { x: number; y: number }> = {};
  positions.forEach((v, k) => { obj[k] = v; });
  try { localStorage.setItem(`${POS_KEY_PREFIX}:${topicId}:${mode}`, JSON.stringify(obj)); } catch {}
}

function loadPositions(topicId: string | undefined, mode: string): Map<string, { x: number; y: number }> | null {
  if (!topicId) return null;
  try {
    const raw = localStorage.getItem(`${POS_KEY_PREFIX}:${topicId}:${mode}`);
    if (!raw) return null;
    return new Map(Object.entries(JSON.parse(raw)));
  } catch { return null; }
}

function clearPositions(topicId: string | undefined, mode: string) {
  if (!topicId) return;
  try { localStorage.removeItem(`${POS_KEY_PREFIX}:${topicId}:${mode}`); } catch {}
}

/** Fetches and displays documents related to an entity */
function EntityDocsList({ entityName }: { entityName: string }) {
  const [docs, setDocs] = useState<Array<{ id: string; title: string; sourceUrl?: string; publishedDate?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    fetch(`/api/graph/entity/${encodeURIComponent(entityName)}/docs`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setDocs(d); setLoaded(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityName]);

  if (loading) return <div className="text-[9px] text-[#888] py-1">Loading...</div>;
  if (docs.length === 0) return <div className="text-[9px] text-[#888] py-1">No docs found</div>;

  return (
    <div className="space-y-1">
      {docs.slice(0, 5).map(doc => (
        <div key={doc.id} className="flex items-start gap-1.5 py-1 border-b border-[#1A1A1A]/5 last:border-0">
          {doc.sourceUrl ? (
            <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-[#1A1A1A] hover:text-[#0071e3] hover:underline leading-tight truncate flex-1">
              {doc.title || 'Untitled'}
            </a>
          ) : (
            <span className="text-[10px] text-[#1A1A1A]/70 leading-tight truncate flex-1">{doc.title || 'Untitled'}</span>
          )}
          {doc.publishedDate && (
            <span className="text-[8px] text-[#888] font-mono shrink-0">
              {new Date(doc.publishedDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewMode?: GraphLayoutMode;
  terrainClusters?: GraphSensemakingCluster[];
  onViewModeChange?: (mode: GraphLayoutMode) => void;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  focusNodeIds?: string[];
  searchQuery?: string;
  topicId?: string;
}

// Bauhaus palette — node accent colors
const NODE_ACCENT: Record<string, string> = {
  topic: '#1A1A1A',
  technology: '#D94F26',
  product: '#D94F26',
  organization: '#F29F05',
  event: '#6B9E7A',
  claim: '#6B9E7A',
  document: '#9A7DA8',
  entity: '#9A7DA8',
};

// Edge colors by relation type
const EDGE_COLORS: Record<string, string> = {
  DEVELOPS: '#2D6B30',
  COMPETES_WITH: '#A0453A',
  USES: '#2A5A6B',
  INVESTS_IN: '#7A5C2A',
  RELATED_TO: '#4A4A6B',
  SUPPORTS: '#3A7A4A',
  CONTRADICTS: '#8B3A2A',
  HAS_ENTITY: '#1A1A1A',
  HAS_EVENT: '#666666',
  HAS_CLAIM: '#666666',
  PARTICIPATED_IN: '#6B5A2A',
  MENTIONS: '#5A3A6B',
};

// Type labels
const TYPE_LABEL: Record<string, string> = {
  topic: '主题', entity: '实体', technology: '技术', product: '产品',
  organization: '组织', event: '事件', claim: '主张', document: '文档',
};

// Is type colored (filled background)
const FILLED_TYPES = new Set(['topic', 'technology', 'product', 'organization']);

// Churn mode colors — recency-based
const CHURN_COLORS: Record<string, string> = {
  hot: '#E84D3D',    // < 7 days
  warm: '#F29F05',   // 7-30 days
  cool: '#6B9E7A',   // 30-90 days
  cold: '#9A7DA8',   // > 90 days or unknown
};

const CHURN_LABELS: Record<string, string> = {
  hot: '< 7天',
  warm: '7-30天',
  cool: '30-90天',
  cold: '> 90天',
};

type ColorMode = 'type' | 'churn';

// Zoom limits
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;

// Layout mode labels
const LAYOUT_LABELS: Record<GraphLayoutMode, string> = {
  terrain: '地形',
  radar: '雷达',
  focus: '聚焦',
  timeline: '时间线',
  grid: '网格',
  matrix: '矩阵',
  bundle: '环形',
};

// Cluster hull colors
const HULL_COLORS = ['#D94F26', '#2A5A6B', '#6B9E7A', '#9A7DA8', '#F29F05', '#7A5C2A'];

// Convex hull — Andrew's monotone chain algorithm
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof points[0], a: typeof points[0], b: typeof points[0]) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof points = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof points = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function getChurnColor(firstSeen?: string, isRecent?: boolean): string {
  if (isRecent) return CHURN_COLORS.hot;
  if (!firstSeen) return CHURN_COLORS.cold;
  const daysSince = (Date.now() - new Date(firstSeen).getTime()) / 86400000;
  if (daysSince <= 7) return CHURN_COLORS.hot;
  if (daysSince <= 30) return CHURN_COLORS.warm;
  if (daysSince <= 90) return CHURN_COLORS.cool;
  return CHURN_COLORS.cold;
}

// Get node radius based on importance
function getNodeRadius(importance?: number): number {
  const imp = importance ?? 0.3;
  return Math.round(12 + imp * 24); // 12px (外围) → 36px (核心)
}

// Get font size based on importance
function getNodeFontSize(importance?: number): number {
  const imp = importance ?? 0.3;
  if (imp > 0.65) return 12;
  if (imp > 0.35) return 10;
  return 8;
}

export const GraphVisualization = ({
  nodes: initialNodes,
  edges: initialEdges,
  viewMode,
  terrainClusters,
  onViewModeChange,
  onNodeClick,
  onNodeDoubleClick,
  focusNodeIds,
  searchQuery,
  topicId,
}: GraphVisualizationProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastClickTime = useRef<Map<string, number>>(new Map());
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [isPanningActive, setIsPanningActive] = useState(false);
  const [animateTransform, setAnimateTransform] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('type');
  const [showLabels, setShowLabels] = useState(true);
  const [curvedEdges, setCurvedEdges] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Tooltip state
  const [hoveredNode, setHoveredNode] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ id: string; x: number; y: number } | null>(null);

  // Node positions — mutable for drag
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Fit view — calculate bounding box and zoom/pan to fit all nodes
  const fitView = useCallback(() => {
    if (!svgRef.current || nodePositionsRef.current.size === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodePositionsRef.current.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const nodeR = 36;
    const pad = 80;
    const gw = maxX - minX + nodeR * 2 + pad * 2;
    const gh = maxY - minY + nodeR * 2 + pad * 2;
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(rect.width / gw, rect.height / gh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const np = { x: rect.width / 2 - cx * nz, y: rect.height / 2 - cy * nz };

    zoomRef.current = nz;
    panRef.current = np;
    setAnimateTransform(true);
    setZoom(nz);
    setPan({ ...np });
    setTimeout(() => setAnimateTransform(false), 250);
  }, []);

  // Animated zoom helper for programmatic changes (buttons/keyboard)
  const animateZoomChange = useCallback((newZoom: number) => {
    zoomRef.current = newZoom;
    setAnimateTransform(true);
    setZoom(newZoom);
    setTimeout(() => setAnimateTransform(false), 250);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as Element)?.tagName === 'INPUT' || (e.target as Element)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') setSelectedId(null);
      if (e.key === '+' || e.key === '=') animateZoomChange(Math.min(ZOOM_MAX, zoom + 0.15));
      if (e.key === '-') animateZoomChange(Math.max(ZOOM_MIN, zoom - 0.15));
      if (e.key === '0') fitView();
      if (e.key === 'f' || e.key === 'F') setIsFullscreen(f => !f);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, fitView, animateZoomChange]);

  // Initialize positions when nodes or layout mode changes
  useEffect(() => {
    const hasOldPositions = nodePositionsRef.current.size > 0;
    const layouted = applyGraphLayout(initialNodes, initialEdges, viewMode || 'radar', {
      terrainClusters,
      focusNodeId: focusNodeIds?.[0],
    });
    const positions = new Map<string, { x: number; y: number }>();
    layouted.nodes.forEach(n => positions.set(n.id, n.position));

    // Restore saved positions from localStorage
    const saved = loadPositions(topicId, viewMode || 'radar');
    if (saved && saved.size > 0) {
      saved.forEach((pos, id) => {
        if (positions.has(id)) positions.set(id, pos);
      });
    }

    nodePositionsRef.current = positions;
    // Animate transition when layout changes (not initial load, and not restoring saved positions)
    if (hasOldPositions && !saved) {
      setLayoutAnimating(true);
      const timer = setTimeout(() => setLayoutAnimating(false), 350);
      setNodePositions(new Map(positions));
      return () => clearTimeout(timer);
    }
    setNodePositions(new Map(positions));
    // Auto-fit to viewport
    if (initialNodes.length > 0 && svgRef.current) {
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      if (rect.width && rect.height) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        positions.forEach(p => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const pad = 80;
        const gw = maxX - minX + pad * 2;
        const gh = maxY - minY + pad * 2;
        const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(rect.width / gw, rect.height / gh)));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const np = { x: rect.width / 2 - cx * nz, y: rect.height / 2 - cy * nz };
        zoomRef.current = nz;
        panRef.current = np;
        setZoom(nz);
        setPan({ ...np });
      }
    }
  }, [initialNodes, initialEdges, viewMode, terrainClusters, focusNodeIds, resetKey]);

  // Focus on specific nodes
  useEffect(() => {
    if (focusNodeIds && focusNodeIds.length > 0 && nodePositions.size > 0) {
      const pos = nodePositions.get(focusNodeIds[0]);
      if (pos && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setPan({ x: rect.width / 2 - pos.x * zoom, y: rect.height / 2 - pos.y * zoom });
      }
    }
  }, [focusNodeIds, nodePositions, zoom]);

  // Selected node data
  const selectedNode = selectedId ? initialNodes.find(n => n.id === selectedId) ?? null : null;

  // Native mouse interaction — refs + addEventListener for zero stale-closure issues
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onMouseDown = (e: MouseEvent) => {
      // Check if click is on a node
      const target = e.target as Element;
      const nodeEl = target.closest('.node-circle');
      if (nodeEl) {
        // Node drag — handled by React (handleNodeMouseDown)
        return;
      }
      // Background pan
      if (e.button === 0 || e.button === 1) {
        isPanning.current = true;
        setIsPanningActive(true);
        panStart.current = { x: e.clientX, y: e.clientY };
        if (e.button === 1) e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const dragId = draggingRef.current;
      if (dragId) {
        const p = panRef.current;
        const z = zoomRef.current;
        const newX = (e.clientX - p.x) / z - dragOffset.current.x;
        const newY = (e.clientY - p.y) / z - dragOffset.current.y;
        nodePositionsRef.current.set(dragId, { x: newX, y: newY });
        setNodePositions(new Map(nodePositionsRef.current));
      } else if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        panStart.current = { x: e.clientX, y: e.clientY };
        panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        setPan({ ...panRef.current });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const dragId = draggingRef.current;
      if (dragId) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          const node = initialNodes.find(n => n.id === dragId);
          if (node) onNodeClick?.(node);
        }
      } else if (isPanning.current) {
        // Click on empty background (no drag) — deselect node
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          setSelectedId(null);
        }
      }
      draggingRef.current = null;
      setDragging(null);
      isPanning.current = false;
      setIsPanningActive(false);
      // Persist positions after drag
      if (dragId) {
        savePositions(topicId, viewMode || 'radar', nodePositionsRef.current);
      }
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('dragstart', onDragStart);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('mousemove', onMouseMove);
      svg.removeEventListener('mouseup', onMouseUp);
      svg.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [initialNodes, onNodeClick]);

  // Node mousedown — React handler for node elements only
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = nodePositionsRef.current.get(nodeId);
    if (!pos) return;

    const p = panRef.current;
    const z = zoomRef.current;
    setDragging(nodeId);
    draggingRef.current = nodeId;
    setSelectedId(nodeId);
    dragOffset.current = {
      x: (e.clientX - p.x) / z - pos.x,
      y: (e.clientY - p.y) / z - pos.y,
    };
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    // Double-click detection
    const now = Date.now();
    const last = lastClickTime.current.get(nodeId) ?? 0;
    if (now - last < 350) {
      const node = initialNodes.find(n => n.id === nodeId);
      if (node) onNodeDoubleClick?.(node);
    }
    lastClickTime.current.set(nodeId, now);
  }, [initialNodes, onNodeDoubleClick]);

  // Native wheel listener for zoom-toward-cursor (non-passive for preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (!rect) return;

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const p = panRef.current;
      const z = zoomRef.current;

      if (e.ctrlKey || e.metaKey) {
        // Pinch gesture (Mac trackpad) or Ctrl+scroll → zoom toward cursor
        const gx = (mx - p.x) / z;
        const gy = (my - p.y) / z;
        const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.005));
        zoomRef.current = nz;
        panRef.current = { x: mx - gx * nz, y: my - gy * nz };
        setZoom(nz);
        setPan({ ...panRef.current });
      } else {
        // Scroll gesture (trackpad two-finger drag / mouse wheel) → pan
        const factor = z < 1 ? 1 / z : 1;
        panRef.current = {
          x: p.x - e.deltaX * factor,
          y: p.y - e.deltaY * factor,
        };
        setPan({ ...panRef.current });
      }
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Blast radius — BFS 2-hop from selected node
  const blastRadius = useMemo(() => {
    if (!selectedId) return { affectedNodes: new Set<string>(), affectedEdges: new Set<string>() };
    const visited = new Set<string>([selectedId]);
    const affectedEdges = new Set<string>();
    const queue = [selectedId];
    let hops = 0;
    while (queue.length > 0 && hops < 2) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const current = queue.shift()!;
        for (const edge of initialEdges) {
          if (affectedEdges.has(edge.id)) continue;
          let neighbor: string | null = null;
          if (edge.source === current) neighbor = edge.target;
          else if (edge.target === current) neighbor = edge.source;
          if (neighbor) {
            affectedEdges.add(edge.id);
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
      hops++;
    }
    return { affectedNodes: visited, affectedEdges };
  }, [selectedId, initialEdges]);

  // Cluster hulls — convex hull boundaries around sensemaking clusters
  const clusterHulls = useMemo(() => {
    if (!initialNodes.some(n => n.data.clusterId)) return [];
    const byCluster = new Map<string, { x: number; y: number; label: string }[]>();
    initialNodes.forEach(n => {
      const cid = n.data.clusterId;
      if (!cid) return;
      const pos = nodePositions.get(n.id);
      if (!pos) return;
      if (!byCluster.has(cid)) byCluster.set(cid, []);
      byCluster.get(cid)!.push({ x: pos.x, y: pos.y, label: n.data.clusterLabel || cid });
    });
    const hulls: { clusterId: string; label: string; path: string; cx: number; cy: number }[] = [];
    const PAD = 42;
    byCluster.forEach((pts, cid) => {
      if (pts.length < 2) return;
      const padded = pts.flatMap(p => [
        { x: p.x - PAD, y: p.y - PAD },
        { x: p.x + PAD, y: p.y - PAD },
        { x: p.x - PAD, y: p.y + PAD },
        { x: p.x + PAD, y: p.y + PAD },
      ]);
      const hull = convexHull(padded);
      if (hull.length < 3) return;
      hulls.push({
        clusterId: cid,
        label: pts[0].label,
        path: 'M' + hull.map(p => `${p.x},${p.y}`).join('L') + 'Z',
        cx: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        cy: Math.min(...pts.map(p => p.y)) - PAD - 10,
      });
    });
    return hulls;
  }, [initialNodes, nodePositions]);

  // Matrix view data — ranked nodes + cells for heatmap
  const matrixData = useMemo(() => {
    if (viewMode !== 'matrix') return null;
    const ranked = rankNodesByImportance(initialNodes, initialEdges).map(item => item.node)
      .filter(n => n.data.type !== 'claim' && n.data.type !== 'document');
    const nodeIndex = new Map(ranked.map((n, i) => [n.id, i]));
    const cells = initialEdges
      .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
      .map(e => ({
        row: nodeIndex.get(e.target)!,
        col: nodeIndex.get(e.source)!,
        confidence: e.data?.confidence ?? 0.5,
        id: e.id,
      }));
    return { nodes: ranked, size: ranked.length, cells };
  }, [viewMode, initialNodes, initialEdges]);

  // Bundle arc segments for cluster grouping on outer ring
  const bundleArcs = useMemo(() => {
    if (viewMode !== 'bundle') return [];
    const byCluster = new Map<string, { start: number; end: number; label: string; color: string }>();
    const nonTopic = initialNodes.filter(n => n.data.type !== 'topic');
    const sorted = [...nonTopic].sort((a, b) => {
      const ac = a.data.clusterId || '_';
      const bc = b.data.clusterId || '_';
      return ac.localeCompare(bc);
    });
    let clusterStart = 0;
    let currentCluster = '';
    sorted.forEach((node, index) => {
      const cid = node.data.clusterId || '_';
      if (cid !== currentCluster) {
        if (currentCluster) {
          byCluster.set(currentCluster, {
            start: clusterStart, end: index,
            label: node.data.clusterLabel || currentCluster,
            color: HULL_COLORS[(byCluster.size) % HULL_COLORS.length],
          });
        }
        clusterStart = index;
        currentCluster = cid;
      }
    });
    if (currentCluster) {
      const lastNode = sorted[sorted.length - 1];
      byCluster.set(currentCluster, {
        start: clusterStart, end: sorted.length,
        label: lastNode?.data.clusterLabel || currentCluster,
        color: HULL_COLORS[(byCluster.size) % HULL_COLORS.length],
      });
    }
    return [...byCluster.values()].filter(arc => arc.end - arc.start >= 2);
  }, [viewMode, initialNodes]);

  // Build edge paths
  const edgeElements = useMemo(() => {
    return initialEdges.map(edge => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return null;

      const sourceNode = initialNodes.find(n => n.id === edge.source);
      const targetNode = initialNodes.find(n => n.id === edge.target);

      const r1 = getNodeRadius(sourceNode?.data.importance);
      const r2 = getNodeRadius(targetNode?.data.importance);

      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const x1 = sourcePos.x + ux * r1;
      const y1 = sourcePos.y + uy * r1;
      const x2 = targetPos.x - ux * r2;
      const y2 = targetPos.y - uy * r2;

      // Quadratic bezier with perpendicular offset (or chord through center for bundle)
      const mx = viewMode === 'bundle' ? 0 : (x1 + x2) / 2 - uy * 20;
      const my = viewMode === 'bundle' ? 0 : (y1 + y2) / 2 + ux * 20;

      const relKey = (edge.data?.relationType || '').toUpperCase();
      const baseColor = EDGE_COLORS[relKey] || '#1A1A1A';
      const isSelected = selectedId === edge.source || selectedId === edge.target;
      const isHovered = hoveredEdge?.id === edge.id;
      const inBlastRadius = !selectedId || blastRadius.affectedEdges.has(edge.id);
      const confidence = edge.data?.confidence ?? 0.5;
      const baseStrokeWidth = 0.8 + confidence * 2.2;
      const baseOpacity = 0.12 + confidence * 0.58;

      return {
        id: edge.id,
        path: curvedEdges ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`,
        color: baseColor,
        opacity: !inBlastRadius ? 0.04 : isSelected || isHovered ? Math.min(baseOpacity + 0.25, 0.95) : baseOpacity,
        strokeWidth: !inBlastRadius ? 0.5 : isSelected || isHovered ? baseStrokeWidth + 1 : baseStrokeWidth,
        isSelected,
        label: edge.data?.label,
        labelX: mx,
        labelY: my,
        showLabel: isSelected || isHovered,
      };
    }).filter(Boolean);
  }, [initialEdges, nodePositions, initialNodes, selectedId, hoveredEdge, curvedEdges, blastRadius, viewMode]);

  // Node list with positions
  const nodesWithPositions = useMemo(() => {
    return initialNodes.map(node => ({
      ...node,
      pos: nodePositions.get(node.id) ?? { x: 0, y: 0 },
    }));
  }, [initialNodes, nodePositions]);

  const handleExportJSON = useCallback(() => {
    const data = {
      nodes: initialNodes,
      edges: initialEdges,
      metadata: { exportedAt: new Date().toISOString(), nodeCount: initialNodes.length, edgeCount: initialEdges.length },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [initialNodes, initialEdges]);

  const handleExportSVG = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bbox = svg.getBoundingClientRect();
    clone.setAttribute('width', String(bbox.width));
    clone.setAttribute('height', String(bbox.height));
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className={`w-full ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} relative ${darkMode ? 'graph-dark' : ''}`} style={{ background: darkMode ? '#1A1A1A' : '#F7F7F7' }}>
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="svg-bg"
        style={{ width: '100%', height: '100%', touchAction: 'none', userSelect: 'none', cursor: isPanningActive ? 'grabbing' : dragging ? 'grabbing' : 'grab' }}
        onDoubleClick={() => fitView()}
      >
        <defs>
          {/* Arrow markers */}
          <marker id="arrow-default" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#1A1A1A" opacity="0.5" />
          </marker>
          <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#1A1A1A" opacity="0.9" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transition: animateTransform ? 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none' }}>
          {/* Dot grid */}
          <pattern id="dot-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="#1A1A1A" opacity="0.15" />
          </pattern>
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#dot-grid)" style={{ pointerEvents: 'none' }} />

          {/* Cluster hulls */}
          {clusterHulls.map((hull, i) => {
            const color = HULL_COLORS[i % HULL_COLORS.length];
            return (
              <g key={hull.clusterId}>
                <path d={hull.path} fill={color} fillOpacity={0.05} stroke={color} strokeWidth={1.5} strokeOpacity={0.2} />
                <text x={hull.cx} y={hull.cy} textAnchor="middle" fontSize={9} fontWeight={600} fill={color} opacity={0.55}
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}>
                  {hull.label.length > 16 ? hull.label.slice(0, 16) + '…' : hull.label}
                </text>
              </g>
            );
          })}

          {/* ═══ Matrix heatmap view ═══ */}
          {viewMode === 'matrix' && matrixData && (() => {
            const cellSize = 24;
            const labelW = 110;
            const { nodes: mNodes, cells } = matrixData;
            return (
              <g>
                {/* Row labels */}
                {mNodes.map((node, i) => {
                  const accent = NODE_ACCENT[node.data.type] || '#9A7DA8';
                  return (
                    <g key={`row-${node.id}`}>
                      <circle cx={labelW - 8} cy={i * cellSize + cellSize / 2} r={3} fill={accent} />
                      <text x={labelW - 14} y={i * cellSize + cellSize / 2 + 3} textAnchor="end" fontSize={7} fontWeight={600}
                        fill={darkMode ? '#aaa' : '#666'} style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}>
                        {(node.data.label || node.id).length > 14 ? (node.data.label || node.id).slice(0, 14) + '…' : (node.data.label || node.id)}
                      </text>
                      {/* Column labels (rotated) */}
                      <text x={labelW + i * cellSize + cellSize / 2} y={-6} textAnchor="start" fontSize={6} fontWeight={600}
                        fill={accent} transform={`rotate(-45, ${labelW + i * cellSize + cellSize / 2}, -6)`}
                        style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}>
                        {(node.data.label || node.id).length > 8 ? (node.data.label || node.id).slice(0, 8) + '…' : (node.data.label || node.id)}
                      </text>
                    </g>
                  );
                })}
                {/* Grid lines */}
                {mNodes.map((_, i) => (
                  <g key={`grid-${i}`}>
                    <line x1={labelW} y1={i * cellSize} x2={labelW + mNodes.length * cellSize} y2={i * cellSize} stroke={darkMode ? '#333' : '#e8e8ed'} strokeWidth={0.5} />
                    <line x1={labelW + i * cellSize} y1={0} x2={labelW + i * cellSize} y2={mNodes.length * cellSize} stroke={darkMode ? '#333' : '#e8e8ed'} strokeWidth={0.5} />
                  </g>
                ))}
                {/* Heatmap cells */}
                {cells.map(cell => {
                  const opacity = 0.15 + cell.confidence * 0.75;
                  return (
                    <rect key={cell.id}
                      x={labelW + cell.col * cellSize + 1} y={cell.row * cellSize + 1}
                      width={cellSize - 2} height={cellSize - 2}
                      rx={2}
                      fill={darkMode ? '#4d9fff' : '#1A1A1A'}
                      opacity={opacity}
                      style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                      onMouseMove={(ev) => setHoveredEdge({ id: cell.id, x: ev.clientX, y: ev.clientY })}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                  );
                })}
                {/* Diagonal — self cells */}
                {mNodes.map((node, i) => (
                  <rect key={`diag-${node.id}`}
                    x={labelW + i * cellSize + 1} y={i * cellSize + 1}
                    width={cellSize - 2} height={cellSize - 2} rx={2}
                    fill={NODE_ACCENT[node.data.type] || '#9A7DA8'} opacity={0.12}
                  />
                ))}
              </g>
            );
          })()}

          {/* ═══ Bundle arc segments ═══ */}
          {viewMode === 'bundle' && (() => {
            const nonTopic = initialNodes.filter(n => n.data.type !== 'topic');
            const total = nonTopic.length;
            if (total === 0) return null;
            const radius = Math.max(200, total * 12) + 30;
            return bundleArcs.map((arc, i) => {
              const startAngle = (arc.start / total) * Math.PI * 2 - Math.PI / 2;
              const endAngle = (arc.end / total) * Math.PI * 2 - Math.PI / 2;
              const x1 = Math.cos(startAngle) * radius;
              const y1 = Math.sin(startAngle) * radius;
              const x2 = Math.cos(endAngle) * radius;
              const y2 = Math.sin(endAngle) * radius;
              const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
              const midAngle = (startAngle + endAngle) / 2;
              const labelR = radius + 16;
              return (
                <g key={`arc-${i}`}>
                  <path d={`M${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2}`}
                    fill="none" stroke={arc.color} strokeWidth={4} opacity={0.35} />
                  <text x={Math.cos(midAngle) * labelR} y={Math.sin(midAngle) * labelR}
                    textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={700}
                    fill={arc.color} opacity={0.6}
                    style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}>
                    {arc.label.length > 12 ? arc.label.slice(0, 12) + '…' : arc.label}
                  </text>
                </g>
              );
            });
          })()}

          {/* Edges — standard for non-matrix, chords for bundle */}
          {viewMode !== 'matrix' && edgeElements.map(e => (
            <g key={e!.id}>
              <path
                d={e!.path}
                fill="none"
                stroke={e!.color}
                strokeWidth={e!.strokeWidth}
                opacity={e!.opacity}
                markerEnd={`url(#${e!.isSelected ? 'arrow-active' : 'arrow-default'})`}
                style={{ transition: 'stroke 0.15s, opacity 0.15s' }}
                onMouseMove={(ev) => setHoveredEdge({ id: e!.id, x: ev.clientX, y: ev.clientY })}
                onMouseLeave={() => setHoveredEdge(null)}
              />
              {/* Edge label on hover/select */}
              {e!.showLabel && e!.label && (
                <>
                  <rect
                    x={e!.labelX - (e!.label.length * 3.5 + 8)}
                    y={e!.labelY - 9}
                    width={e!.label.length * 7 + 16}
                    height={18}
                    rx={2}
                    fill="#F7F7F7"
                    fillOpacity={0.95}
                    stroke={e!.color}
                    strokeWidth={1}
                  />
                  <text
                    x={e!.labelX}
                    y={e!.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#1A1A1A"
                    style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}
                  >
                    {e!.label}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* Nodes — skip for matrix mode (labels are in the matrix grid) */}
          {viewMode !== 'matrix' && nodesWithPositions.map(node => {
            const accent = colorMode === 'churn'
              ? getChurnColor(node.data.metadata?.firstSeen, node.data.recent)
              : (NODE_ACCENT[node.data.type] || '#9A7DA8');
            const isFilled = FILLED_TYPES.has(node.data.type);
            const radius = getNodeRadius(node.data.importance);
            const fontSize = getNodeFontSize(node.data.importance);
            const isSelected = selectedId === node.id;
            const isHighlighted = node.data.highlighted;
            const hasHighlightContext = node.data.highlighted !== undefined;
            const inBlastRadius = !selectedId || blastRadius.affectedNodes.has(node.id);
            const label = node.data.label || node.id;
            const isDimmed = (hasHighlightContext && !isHighlighted) || (selectedId && !inBlastRadius) || (searchQuery && !(label.toLowerCase().includes(searchQuery.toLowerCase())));
            const textColor = isFilled ? '#F7F7F7' : '#1A1A1A';

            return (
              <g
                key={node.id}
                className="node-circle"
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onMouseEnter={(e) => setHoveredNode({ id: node.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  transform: `translate(${node.pos.x}px, ${node.pos.y}px)`,
                  cursor: 'grab',
                  opacity: isDimmed ? 0.2 : 1,
                  transition: layoutAnimating
                    ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s, filter 0.15s'
                    : 'opacity 0.3s, filter 0.15s',
                }}
              >
                {/* Selection ring */}
                {isSelected && (
                  <circle r={radius + 8} fill="none" stroke={accent} strokeWidth={2} opacity={0.4}
                    style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
                )}
                {/* Main circle */}
                <circle
                  className="node-main-circle"
                  r={radius}
                  fill={isFilled ? accent : '#F7F7F7'}
                  stroke={isSelected ? accent : `${accent}99`}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  style={{ transition: 'stroke 0.15s' }}
                />
                {/* Node label */}
                <text
                  textAnchor="middle"
                  dy={-3}
                  fontSize={fontSize}
                  fontWeight={700}
                  fill={textColor}
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}
                >
                  {label.length > 8 ? label.slice(0, 8) + '…' : label}
                </text>
                {/* Full label below node */}
                {showLabels && <text
                  textAnchor="middle"
                  dy={radius + 16}
                  fontSize={10}
                  fill="#888"
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}
                >
                  {label.length > 14 ? label.slice(0, 14) + '…' : label}
                </text>}
                {/* Type badge */}
                {showLabels && <text
                  textAnchor="middle"
                  dy={fontSize + 3}
                  fontSize={7}
                  fontWeight={700}
                  fill={isFilled ? 'rgba(247,247,247,0.6)' : accent}
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '1px' }}
                >
                  {TYPE_LABEL[node.data.type] || 'NODE'}
                </text>}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls — Bauhaus style */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        {[
          { label: '+', fn: () => animateZoomChange(Math.min(ZOOM_MAX, zoom + 0.15)) },
          { label: '−', fn: () => animateZoomChange(Math.max(ZOOM_MIN, zoom - 0.15)) },
          { label: '⊙', fn: fitView },
          { label: isFullscreen ? '⤓' : '⛶', fn: () => setIsFullscreen(f => !f) },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="w-8 h-8 flex items-center justify-center text-base cursor-pointer bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors"
            style={{ borderRadius: '0 8px 8px 8px', fontFamily: 'var(--font-family)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Export buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-1">
        <button
          onClick={() => { clearPositions(topicId, viewMode || 'radar'); setResetKey(k => k + 1); }}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors cursor-pointer"
          style={{ borderRadius: '0 8px 8px 8px' }}
          title="Reset layout to default positions"
        >
          Reset
        </button>
        <button
          onClick={handleExportSVG}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors cursor-pointer"
          style={{ borderRadius: '0 8px 8px 8px' }}
        >
          SVG
        </button>
        <button
          onClick={handleExportJSON}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors cursor-pointer"
          style={{ borderRadius: '0 8px 8px 8px' }}
        >
          JSON
        </button>
      </div>

      {/* Info chips */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <span className="px-2.5 py-1 bg-white/80 backdrop-blur-sm border border-[#1A1A1A]/10 text-[10px] text-[#888]" style={{ borderRadius: '0 6px 6px 6px' }}>
            {initialNodes.length} nodes · {initialEdges.length} edges
          </span>
          {selectedId && blastRadius.affectedNodes.size > 1 && (
            <span className="px-2.5 py-1 bg-[#1A1A1A] text-[#F7F7F7] text-[10px] font-bold" style={{ borderRadius: '0 6px 6px 6px' }}>
              Impact: {blastRadius.affectedNodes.size - 1} nodes
            </span>
          )}
        </div>
        <span className="px-2.5 py-1 bg-white/60 backdrop-blur-sm border border-[#1A1A1A]/5 text-[9px] text-[#aaa]" style={{ borderRadius: '0 6px 6px 6px' }}>
          拖拽空白平移 · 双指滑动平移 · ⌘+滑动缩放 · 拖拽节点重排 · 双击归位
        </span>
      </div>

      {/* Node Detail Panel */}
      {selectedNode && (() => {
        const accent = NODE_ACCENT[selectedNode.data.type] || '#9A7DA8';
        const connCount = initialEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length;
        const toggleSection = (key: string) => {
          setCollapsedSections(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
          });
        };
        const isCollapsed = (key: string) => collapsedSections.has(key);
        return (
          <div
            className="absolute bottom-14 right-14 bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] p-4 z-20 w-[260px] animate-fade-in"
            style={{ borderRadius: '0 12px 12px 12px' }}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-2 mb-3 border-b-[3px] border-[#1A1A1A]">
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Node Detail</span>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[#888] hover:text-[#1A1A1A] text-xs font-mono cursor-pointer"
              >✕</button>
            </div>

            {/* Name + type */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 shrink-0 rounded-full"
                style={{ background: accent }}
              />
              <h3 className="font-extrabold text-[#1A1A1A] text-sm truncate">{selectedNode.data.label}</h3>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[9px] text-[#888] uppercase tracking-wider">
                {TYPE_LABEL[selectedNode.data.type] || selectedNode.data.type}
              </span>
              {selectedNode.data.latestPubDate && (() => {
                const diffMs = Date.now() - new Date(selectedNode.data.latestPubDate).getTime();
                const days = Math.floor(diffMs / 86400000);
                const label = days < 1 ? '今天' : days < 7 ? `${days}天前` : days < 30 ? `${Math.floor(days / 7)}周前` : days < 365 ? `${Math.floor(days / 30)}月前` : `${Math.floor(days / 365)}年前`;
                const color = days < 7 ? '#34c759' : days < 30 ? '#ff9f0a' : '#888';
                return <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-sm" style={{ background: `${color}18`, color }}>{label}</span>;
              })()}
            </div>

            {/* Stats section */}
            {selectedNode.data.metadata && (() => {
              const hasStats = selectedNode.data.metadata.docCount != null || selectedNode.data.metadata.confidence != null || selectedNode.data.metadata.firstSeen;
              if (!hasStats) return null;
              return (
                <div className="border-b border-[#1A1A1A]/10">
                  <button onClick={() => toggleSection('stats')} className="w-full flex justify-between items-center py-2 cursor-pointer">
                    <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888]">Stats</span>
                    <span className="text-[9px] text-[#888]" style={{ transform: isCollapsed('stats') ? 'rotate(-90deg)' : '', transition: 'transform 0.15s' }}>▼</span>
                  </button>
                  {!isCollapsed('stats') && (
                    <div className="pb-2">
                      {selectedNode.data.metadata.docCount != null && (
                        <div className="flex justify-between items-baseline py-1.5">
                          <span className="text-[10px] text-[#888]">Docs</span>
                          <span className="font-mono text-[14px] font-extrabold">{selectedNode.data.metadata.docCount}</span>
                        </div>
                      )}
                      {selectedNode.data.metadata.confidence != null && (
                        <div>
                          <div className="flex justify-between items-baseline py-1.5">
                            <span className="text-[10px] text-[#888]">Confidence</span>
                            <span className="font-mono text-[14px] font-extrabold">{Math.round(selectedNode.data.metadata.confidence * 100)}%</span>
                          </div>
                          <div className="h-[6px] bg-[#1A1A1A]/5 w-full mb-1.5">
                            <div className="h-full bg-[#1A1A1A]" style={{ width: `${Math.round(selectedNode.data.metadata.confidence * 100)}%` }} />
                          </div>
                        </div>
                      )}
                      {selectedNode.data.metadata.firstSeen && (
                        <div className="flex justify-between items-baseline py-1.5">
                          <span className="text-[10px] text-[#888]">First Seen</span>
                          <span className="font-mono text-[10px]">{new Date(selectedNode.data.metadata.firstSeen).toLocaleDateString('zh-CN')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Connections & Importance */}
            {(connCount > 0 || selectedNode.data.importance != null) && (
              <div className="border-b border-[#1A1A1A]/10">
                <button onClick={() => toggleSection('metrics')} className="w-full flex justify-between items-center py-2 cursor-pointer">
                  <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888]">Metrics</span>
                  <span className="text-[9px] text-[#888]" style={{ transform: isCollapsed('metrics') ? 'rotate(-90deg)' : '', transition: 'transform 0.15s' }}>▼</span>
                </button>
                {!isCollapsed('metrics') && (
                  <div className="pb-2">
                    {connCount > 0 && (
                      <div className="flex justify-between items-baseline py-1.5">
                        <span className="text-[10px] text-[#888]">Connections</span>
                        <span className="font-mono text-[14px] font-extrabold">{connCount}</span>
                      </div>
                    )}
                    {selectedNode.data.importance != null && (
                      <div className="flex justify-between items-baseline py-1.5">
                        <span className="text-[10px] text-[#888]">Importance</span>
                        <span className="font-mono text-[14px] font-extrabold">{Math.round(selectedNode.data.importance * 100)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {selectedNode.data.description && selectedNode.data.description !== selectedNode.data.fullLabel && (
              <div className="border-b border-[#1A1A1A]/10">
                <button onClick={() => toggleSection('desc')} className="w-full flex justify-between items-center py-2 cursor-pointer">
                  <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888]">Description</span>
                  <span className="text-[9px] text-[#888]" style={{ transform: isCollapsed('desc') ? 'rotate(-90deg)' : '', transition: 'transform 0.15s' }}>▼</span>
                </button>
                {!isCollapsed('desc') && (
                  <div className="bg-[#1A1A1A]/[0.04] p-3 mb-2">
                    <p className="text-[11px] leading-relaxed text-[#1A1A1A]/70">{selectedNode.data.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* Related Docs */}
            {selectedNode.data.docCount != null && selectedNode.data.docCount > 0 && (
              <div className="border-b border-[#1A1A1A]/10">
                <button onClick={() => toggleSection('docs')} className="w-full flex justify-between items-center py-2 cursor-pointer">
                  <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888]">Docs ({selectedNode.data.docCount})</span>
                  <span className="text-[9px] text-[#888]" style={{ transform: isCollapsed('docs') ? 'rotate(-90deg)' : '', transition: 'transform 0.15s' }}>▼</span>
                </button>
                {!isCollapsed('docs') && (
                  <div className="pb-2">
                    {selectedNode.data.latestDocUrl && (
                      <a href={selectedNode.data.latestDocUrl} target="_blank" rel="noopener noreferrer"
                        className="block py-1.5 text-[10px] text-[#0071e3] hover:underline truncate">
                        Latest source ↗
                      </a>
                    )}
                    <EntityDocsList entityName={selectedNode.data.canonicalName || selectedNode.data.fullLabel || selectedNode.data.label} />
                  </div>
                )}
              </div>
            )}

            {/* Connected entities */}
            {(() => {
              const connected = initialEdges
                .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                .map(e => {
                  const otherId = e.source === selectedNode.id ? e.target : e.source;
                  const other = initialNodes.find(n => n.id === otherId);
                  return other ? { node: other, rel: e.data?.label || '' } : null;
                })
                .filter(Boolean)
                .slice(0, 6);
              if (connected.length === 0) return null;
              return (
                <div>
                  <button onClick={() => toggleSection('connected')} className="w-full flex justify-between items-center py-2 cursor-pointer">
                    <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888]">Connected</span>
                    <span className="text-[9px] text-[#888]" style={{ transform: isCollapsed('connected') ? 'rotate(-90deg)' : '', transition: 'transform 0.15s' }}>▼</span>
                  </button>
                  {!isCollapsed('connected') && (
                    <div className="pb-1">
                      {connected.map(({ node: cn, rel }) => {
                        const cAccent = NODE_ACCENT[cn!.data.type] || '#9A7DA8';
                        return (
                          <div
                            key={cn!.id}
                            className="flex items-center gap-2 py-1.5 border-b border-[#1A1A1A]/8 last:border-0 cursor-pointer hover:bg-[#1A1A1A]/[0.03]"
                            onClick={() => { setSelectedId(cn!.id); onNodeClick?.(cn!); }}
                          >
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cAccent }} />
                            <span className="text-[11px] font-semibold truncate flex-1">{cn!.data.label}</span>
                            {rel && <span className="text-[8px] text-[#888] font-mono">{rel}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {selectedNode.data.latestDocUrl && (
              <button
                onClick={() => window.open(selectedNode.data.latestDocUrl, '_blank')}
                className="w-full mt-3 py-2 bg-[#1A1A1A] text-[#F7F7F7] border-none text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                style={{ borderRadius: '0 8px 8px 8px' }}
              >
                Latest Doc →
              </button>
            )}
          </div>
        );
      })()}

      {/* Config toggle + panel */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="w-8 h-8 flex items-center justify-center text-sm cursor-pointer bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors"
          style={{ borderRadius: '0 8px 8px 8px' }}
        >
          ⚙
        </button>
      </div>
      {showPanel && (
        <div
          className="absolute top-14 left-4 z-20 bg-white/90 backdrop-blur-sm border-[1.5px] border-[#1A1A1A] p-3 w-[180px] animate-fade-in"
          style={{ borderRadius: '0 12px 12px 12px' }}
        >
          <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888] mb-3">Display Settings</div>

          <div className="mb-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#888] mb-1">Color Mode</div>
            <div className="flex gap-1">
              {(['type', 'churn'] as ColorMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setColorMode(mode)}
                  className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${colorMode === mode ? 'bg-[#1A1A1A] text-[#F7F7F7]' : 'bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#1A1A1A]/10'}`}
                  style={{ borderRadius: '0 6px 6px 6px' }}
                >
                  {mode === 'type' ? '类型' : '活跃度'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} className="accent-[#1A1A1A]" />
            <span className="text-[10px] text-[#1A1A1A]">显示标签</span>
          </label>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={curvedEdges} onChange={() => setCurvedEdges(!curvedEdges)} className="accent-[#1A1A1A]" />
            <span className="text-[10px] text-[#1A1A1A]">曲线连接</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={darkMode} onChange={() => setDarkMode(!darkMode)} className="accent-[#1A1A1A]" />
            <span className="text-[10px] text-[#1A1A1A]">暗色主题</span>
          </label>
        </div>
      )}

      {/* Legend — collapsible */}
      <div
        className="absolute top-4 right-20 z-10 bg-white/80 backdrop-blur-sm border-[1.5px] border-[#1A1A1A] px-3 py-2"
        style={{ borderRadius: '0 8px 8px 8px' }}
      >
        <div
          className="flex items-center justify-between cursor-pointer gap-4"
          onClick={() => setLegendCollapsed(!legendCollapsed)}
        >
          <span className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#888]">Legend</span>
          <span className="text-[8px] text-[#888] transition-transform" style={{ transform: legendCollapsed ? 'rotate(-90deg)' : '' }}>▼</span>
        </div>
        {!legendCollapsed && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {colorMode === 'type' ? (
              Object.entries(NODE_ACCENT).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[9px] text-[#1A1A1A]">{TYPE_LABEL[type] || type}</span>
                </div>
              ))
            ) : (
              Object.entries(CHURN_COLORS).map(([level, color]) => (
                <div key={level} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[9px] text-[#1A1A1A]">{CHURN_LABELS[level]}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Node tooltip on hover */}
      {hoveredNode && !selectedId && (() => {
        const node = initialNodes.find(n => n.id === hoveredNode.id);
        if (!node) return null;
        const accent = colorMode === 'churn'
          ? getChurnColor(node.data.metadata?.firstSeen, node.data.recent)
          : (NODE_ACCENT[node.data.type] || '#9A7DA8');
        return (
          <div
            className="fixed z-[1000] bg-white/95 backdrop-blur-sm border border-[#1A1A1A]/15 px-3 py-2 shadow-sm"
            style={{ left: hoveredNode.x + 14, top: hoveredNode.y + 14, borderRadius: '0 8px 8px 8px', pointerEvents: 'none', maxWidth: 200 }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <span className="text-[11px] font-bold text-[#1A1A1A]">{node.data.label}</span>
            </div>
            <div className="text-[9px] text-[#888] uppercase tracking-wider">
              {TYPE_LABEL[node.data.type] || node.data.type}
              {node.data.metadata?.docCount ? ` · ${node.data.metadata.docCount} docs` : ''}
              {node.data.metadata?.confidence != null ? ` · ${Math.round(node.data.metadata.confidence * 100)}%` : ''}
            </div>
          </div>
        );
      })()}

      {/* Edge tooltip on hover */}
      {hoveredEdge && (() => {
        const edge = initialEdges.find(e => e.id === hoveredEdge.id);
        if (!edge) return null;
        const src = initialNodes.find(n => n.id === edge.source);
        const tgt = initialNodes.find(n => n.id === edge.target);
        return (
          <div
            className="fixed z-[1000] bg-white/95 backdrop-blur-sm border border-[#1A1A1A]/15 px-3 py-2 shadow-sm"
            style={{ left: hoveredEdge.x + 14, top: hoveredEdge.y + 14, borderRadius: '0 8px 8px 8px', pointerEvents: 'none', maxWidth: 220 }}
          >
            <div className="text-[11px] font-bold text-[#1A1A1A]">
              {src?.data.label || '?'} → {tgt?.data.label || '?'}
            </div>
            <div className="text-[9px] text-[#888]">
              {edge.data?.label || edge.data?.relationType || ''}
              {edge.data?.confidence != null ? ` · ${Math.round(edge.data.confidence * 100)}%` : ''}
            </div>
          </div>
        );
      })()}

      {/* Pulse animation keyframes */}
      <style>{`
        .node-circle:active { cursor: grabbing; }
        .node-circle:hover { filter: brightness(1.08); }
        .node-circle:hover .node-main-circle { transform: scale(1.12); }
        .node-main-circle { transition: transform 0.15s ease, stroke 0.15s; transform-box: fill-box; transform-origin: center; }
        @keyframes pulse-glow { 0%,100%{opacity:.4} 50%{opacity:.8} }
        /* Dark mode overrides */
        .graph-dark .svg-bg { background: #1A1A1A; }
        .graph-dark text { fill: #e8e8ed; }
        .graph-dark circle { fill-opacity: 1; }
        .graph-dark .node-circle text[fill="#1A1A1A"] { fill: #e8e8ed; }
        .graph-dark .node-circle text[fill="#888"] { fill: #888; }
        .graph-dark .node-circle text[fill="#F7F7F7"] { fill: #F7F7F7; }
        .graph-dark > .absolute { color: #e8e8ed; }
        .graph-dark > .absolute > div { background: rgba(30,30,30,0.95) !important; border-color: #444 !important; }
        .graph-dark > .absolute > div > div { color: #ccc; }
        .graph-dark > .absolute button { color: #ccc; border-color: #555 !important; background: #2a2a2a !important; }
        .graph-dark > .absolute button:hover { background: #444 !important; color: #fff !important; }
        .graph-dark > .absolute label span { color: #ccc !important; }
        .graph-dark > .absolute input[type="checkbox"] { accent-color: #888; }
        .graph-dark > .absolute span { color: #aaa; }
      `}</style>
    </div>
  );
};

export default GraphVisualization;
