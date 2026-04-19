import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// Node Types — includes entity subtypes for visual differentiation
export type GraphNodeType = 'topic' | 'entity' | 'technology' | 'product' | 'organization' | 'event' | 'claim' | 'document';

export interface GraphNodeData {
  label: string;
  type: GraphNodeType;
  description?: string;
  url?: string;
  metadata?: Record<string, any>;
  topicId?: string;
  highlighted?: boolean;
  importance?: number;
  fullLabel?: string;
  canonicalName?: string;
  searchMatched?: boolean;
  dimmed?: boolean;
  recent?: boolean;
  clusterId?: string;
  clusterLabel?: string;
  clusterRole?: string;
}

export interface GraphEdgeData {
  label?: string;
  type: 'has_entity' | 'has_claim' | 'has_event' | 'supports' | 'contradicts' | 'related_to' | 'participated_in';
  relationType?: string;
  confidence?: number;
  recent?: boolean;
  dimmed?: boolean;
}

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: GraphNodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: GraphEdgeData;
}

export interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  focusNodeIds?: string[];
  showPulse?: boolean;
  layoutMode?: string;
  onLayoutModeChange?: (mode: string) => void;
  terrainClusters?: any[];
  selectedClusterId?: string | null;
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

// Compute radial layout: topic at center, entities radiate outward
function computeRadialLayout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = 500;
  const centerY = 350;

  const topicNode = nodes.find(n => n.data.type === 'topic');
  const entityNodes = nodes.filter(n => n.data.type !== 'topic');

  if (topicNode) {
    positions.set(topicNode.id, { x: centerX, y: centerY });
  }

  // Sort by importance descending so important nodes get better positions
  const sorted = [...entityNodes].sort((a, b) => (b.data.importance ?? 0) - (a.data.importance ?? 0));
  const count = sorted.length;
  const radius = Math.max(220, 80 + count * 14);

  sorted.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  return positions;
}

// Get node radius based on importance
function getNodeRadius(importance?: number): number {
  const imp = importance ?? 0;
  return Math.round(20 + imp * 14); // 20px (no connections) to 34px (most connected)
}

// Get font size based on importance
function getNodeFontSize(importance?: number): number {
  const imp = importance ?? 0;
  if (imp > 0.7) return 11;
  if (imp > 0.3) return 10;
  return 9;
}

export const GraphVisualization = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  onNodeDoubleClick,
  focusNodeIds,
  showPulse = false,
}: GraphVisualizationProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastClickTime = useRef<Map<string, number>>(new Map());

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Node positions — mutable for drag
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Initialize positions when nodes change
  useEffect(() => {
    const layout = computeRadialLayout(initialNodes);
    setNodePositions(layout);
    // Auto-fit: center the viewport
    if (initialNodes.length > 0) {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        setPan({ x: rect.width / 2 - 500, y: rect.height / 2 - 350 });
      }
    }
  }, [initialNodes]);

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

  // Mouse handlers
  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg' || (e.target as Element).classList?.contains('svg-bg')) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      setSelectedId(null);
    }
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const pos = nodePositions.get(nodeId);
    if (!pos) return;

    setDragging(nodeId);
    setSelectedId(nodeId);
    dragOffset.current = { x: e.clientX / zoom - pos.x, y: e.clientY / zoom - pos.y };

    // Double-click detection
    const now = Date.now();
    const last = lastClickTime.current.get(nodeId) ?? 0;
    if (now - last < 350) {
      const node = initialNodes.find(n => n.id === nodeId);
      if (node) onNodeDoubleClick?.(node);
    }
    lastClickTime.current.set(nodeId, now);
  }, [nodePositions, zoom, initialNodes, onNodeDoubleClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const newX = e.clientX / zoom - dragOffset.current.x;
      const newY = e.clientY / zoom - dragOffset.current.y;
      setNodePositions(prev => {
        const next = new Map(prev);
        next.set(dragging, { x: newX, y: newY });
        return next;
      });
    } else if (isPanning.current) {
      setPan(p => ({
        x: p.x + e.clientX - panStart.current.x,
        y: p.y + e.clientY - panStart.current.y,
      }));
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  }, [dragging, zoom]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      const node = initialNodes.find(n => n.id === dragging);
      if (node) onNodeClick?.(node);
    }
    setDragging(null);
    isPanning.current = false;
  }, [dragging, initialNodes, onNodeClick]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

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

      // Quadratic bezier with perpendicular offset
      const mx = (x1 + x2) / 2 - uy * 20;
      const my = (y1 + y2) / 2 + ux * 20;

      const relKey = (edge.data?.relationType || '').toUpperCase();
      const baseColor = EDGE_COLORS[relKey] || '#1A1A1A';
      const isSelected = selectedId === edge.source || selectedId === edge.target;
      const isHovered = hoveredEdgeId === edge.id;

      return {
        id: edge.id,
        path: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`,
        color: isSelected || isHovered ? baseColor : baseColor,
        opacity: isSelected || isHovered ? 0.8 : 0.35,
        strokeWidth: isSelected || isHovered ? 2.5 : 1.5,
        isSelected,
        label: edge.data?.label,
        labelX: mx,
        labelY: my,
        showLabel: isSelected || isHovered,
      };
    }).filter(Boolean);
  }, [initialEdges, nodePositions, initialNodes, selectedId, hoveredEdgeId]);

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

  return (
    <div className="w-full h-full relative" style={{ background: '#F7F7F7' }}>
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="svg-bg"
        style={{ width: '100%', height: '100%', cursor: isPanning.current ? 'grabbing' : dragging ? 'grabbing' : 'grab' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleSvgMouseDown}
        onWheel={handleWheel}
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

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Dot grid */}
          <pattern id="dot-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="#1A1A1A" opacity="0.15" />
          </pattern>
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#dot-grid)" />

          {/* Edges */}
          {edgeElements.map(e => (
            <g key={e!.id}>
              <path
                d={e!.path}
                fill="none"
                stroke={e!.color}
                strokeWidth={e!.strokeWidth}
                opacity={e!.opacity}
                markerEnd={`url(#${e!.isSelected ? 'arrow-active' : 'arrow-default'})`}
                style={{ transition: 'stroke 0.15s, opacity 0.15s' }}
                onMouseEnter={() => setHoveredEdgeId(e!.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
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

          {/* Nodes */}
          {nodesWithPositions.map(node => {
            const accent = NODE_ACCENT[node.data.type] || '#9A7DA8';
            const isFilled = FILLED_TYPES.has(node.data.type);
            const radius = getNodeRadius(node.data.importance);
            const fontSize = getNodeFontSize(node.data.importance);
            const isSelected = selectedId === node.id;
            const isHighlighted = node.data.highlighted;
            const hasHighlightContext = node.data.highlighted !== undefined;
            const isDimmed = hasHighlightContext && !isHighlighted;
            const textColor = isFilled ? '#F7F7F7' : '#1A1A1A';
            const label = node.data.label || node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.pos.x}, ${node.pos.y})`}
                className="node-circle"
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                  cursor: 'grab',
                  opacity: isDimmed ? 0.2 : 1,
                  transition: 'opacity 0.3s',
                }}
              >
                {/* Selection ring */}
                {isSelected && (
                  <circle r={radius + 8} fill="none" stroke={accent} strokeWidth={2} opacity={0.4}
                    style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
                )}
                {/* Main circle */}
                <circle
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
                <text
                  textAnchor="middle"
                  dy={radius + 16}
                  fontSize={10}
                  fill="#888"
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none' }}
                >
                  {label.length > 14 ? label.slice(0, 14) + '…' : label}
                </text>
                {/* Type badge */}
                <text
                  textAnchor="middle"
                  dy={fontSize + 3}
                  fontSize={7}
                  fontWeight={700}
                  fill={isFilled ? 'rgba(247,247,247,0.6)' : accent}
                  style={{ fontFamily: 'var(--font-family)', pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '1px' }}
                >
                  {TYPE_LABEL[node.data.type] || 'NODE'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls — Bauhaus style */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        {[
          { label: '+', fn: () => setZoom(z => Math.min(2, z + 0.15)) },
          { label: '−', fn: () => setZoom(z => Math.max(0.3, z - 0.15)) },
          { label: '⊙', fn: () => { setZoom(1); setPan({ x: 0, y: 0 }); } },
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

      {/* Export button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleExportJSON}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-[#F7F7F7] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F7F7F7] transition-colors cursor-pointer"
          style={{ borderRadius: '0 8px 8px 8px' }}
        >
          Export JSON
        </button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-4 text-[10px] text-[#aaa] z-10">
        拖拽节点 · 滚轮缩放 · 空白区域平移 · 点击节点查看详情
      </div>

      {/* Node Detail Panel */}
      {selectedNode && (() => {
        const accent = NODE_ACCENT[selectedNode.data.type] || '#9A7DA8';
        const connCount = initialEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length;
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
            <div className="font-mono text-[9px] text-[#888] uppercase tracking-wider mb-3">
              {TYPE_LABEL[selectedNode.data.type] || selectedNode.data.type}
            </div>

            {/* Stats */}
            {selectedNode.data.metadata && (
              <div>
                {selectedNode.data.metadata.docCount != null && (
                  <div className="flex justify-between items-baseline py-2 border-b-[1.5px] border-[#1A1A1A]">
                    <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Docs</span>
                    <span className="font-mono text-[18px] font-extrabold">{selectedNode.data.metadata.docCount}</span>
                  </div>
                )}
                {selectedNode.data.metadata.confidence != null && (
                  <div>
                    <div className="flex justify-between items-baseline py-2 border-b-[1.5px] border-[#1A1A1A]">
                      <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Confidence</span>
                      <span className="font-mono text-[18px] font-extrabold">{Math.round(selectedNode.data.metadata.confidence * 100)}%</span>
                    </div>
                    <div className="h-[10px] bg-[#1A1A1A]/5 w-full mt-1 mb-2">
                      <div className="h-full bg-[#1A1A1A]" style={{ width: `${Math.round(selectedNode.data.metadata.confidence * 100)}%` }} />
                    </div>
                  </div>
                )}
                {selectedNode.data.metadata.firstSeen && (
                  <div className="flex justify-between items-baseline py-2 border-b-[1.5px] border-[#1A1A1A]">
                    <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">First Seen</span>
                    <span className="font-mono text-[11px]">{new Date(selectedNode.data.metadata.firstSeen).toLocaleDateString('zh-CN')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Connections */}
            {connCount > 0 && (
              <div className="flex justify-between items-baseline py-2 border-b-[1.5px] border-[#1A1A1A]">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Connections</span>
                <span className="font-mono text-[18px] font-extrabold">{connCount}</span>
              </div>
            )}

            {/* Importance */}
            {selectedNode.data.importance != null && (
              <div className="flex justify-between items-baseline py-2 border-b-[1.5px] border-[#1A1A1A]">
                <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#888]">Importance</span>
                <span className="font-mono text-[18px] font-extrabold">{Math.round(selectedNode.data.importance * 100)}%</span>
              </div>
            )}

            {/* Description */}
            {selectedNode.data.description && (
              <div className="bg-[#1A1A1A]/[0.04] p-3 mt-3">
                <p className="text-[11px] leading-relaxed text-[#1A1A1A]/70">{selectedNode.data.description}</p>
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
                <div className="mt-3">
                  <div className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#888] mb-2">Connected</div>
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
              );
            })()}

            {selectedNode.data.url && (
              <button
                onClick={() => window.open(selectedNode.data.url, '_blank')}
                className="w-full mt-3 py-2 bg-[#1A1A1A] text-[#F7F7F7] border-none text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                style={{ borderRadius: '0 8px 8px 8px' }}
              >
                Open Link →
              </button>
            )}
          </div>
        );
      })()}

      {/* Pulse animation keyframes */}
      <style>{`
        .node-circle:active { cursor: grabbing; }
        .node-circle:hover { filter: brightness(1.05); }
        @keyframes pulse-glow { 0%,100%{opacity:.4} 50%{opacity:.8} }
      `}</style>
    </div>
  );
};

// Export helpers
export function exportGraphAsJSON(nodes: GraphNode[], edges: GraphEdge[]): string {
  return JSON.stringify({ nodes, edges, metadata: { exportedAt: new Date().toISOString(), nodeCount: nodes.length, edgeCount: edges.length } }, null, 2);
}

export default GraphVisualization;
