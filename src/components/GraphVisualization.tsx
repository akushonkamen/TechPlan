import type { FC, MouseEvent } from 'react';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Position,
  getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Node Types
export type GraphNodeType = 'topic' | 'entity' | 'event' | 'claim' | 'document';

// Export format types
export type GraphExportFormat = 'json' | 'png';

export interface GraphExportData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    exportedAt: string;
    nodeCount: number;
    edgeCount: number;
  };
}

export interface GraphNodeData {
  label: string;
  type: GraphNodeType;
  description?: string;
  url?: string;
  metadata?: Record<string, any>;
  topicId?: string;
  highlighted?: boolean;
}

export interface GraphEdgeData {
  label?: string;
  type: 'has_entity' | 'has_claim' | 'supports' | 'contradicts' | 'related_to';
}

export type GraphNode = Node<GraphNodeData>;
export type GraphEdge = Edge<GraphEdgeData>;

export interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  focusNodeIds?: string[];
}

// MNEMOSYNE-style node colors (warm tones for cream bg on black canvas)
const NODE_ACCENT: Record<string, string> = {
  topic: '#4A8B9E',
  entity: '#9A7DA8',
  event: '#C49A5C',
  claim: '#C46B5C',
  document: '#6B9E7A',
};

// Custom Node Component — MNEMOSYNE editorial style
const CustomNode: FC<{ data: GraphNodeData }> = ({ data }) => {
  const hasHighlightContext = data.highlighted !== undefined;
  const isHighlighted = data.highlighted === true;
  const accent = NODE_ACCENT[data.type] || '#86868b';

  // Type badge label
  const typeLabel: Record<string, string> = {
    topic: 'TOPIC', entity: 'ENTITY', event: 'EVENT',
    claim: 'CLAIM', document: 'DOC',
  };

  if (hasHighlightContext && !isHighlighted) {
    return (
      <div className="px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-white/30 text-xs font-medium text-center min-w-[60px] transition-all duration-300 scale-75">
        {data.label}
      </div>
    );
  }

  return (
    <div className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 min-w-[60px] ${
      isHighlighted
        ? 'bg-[#F7F7F7] border-[#1d1d1f] border-[2px] shadow-lg text-[#1d1d1f] scale-110'
        : 'bg-[#F7F7F7]/95 border-[#1d1d1f]/60 text-[#1d1d1f] hover:border-[#1d1d1f]'
    }`}>
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: accent }}
      />
      <span className="truncate max-w-[120px]">{data.label}</span>
      <span
        className="hidden group-hover:inline text-[8px] font-mono tracking-wider opacity-50 ml-1"
        style={{ color: accent }}
      >
        {typeLabel[data.type] || 'NODE'}
      </span>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Layout algorithms
const applyLayout = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  layoutType: 'force' | 'hierarchical' | 'circular' | 'grid' | 'concentric' | 'radial'
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const layoutedNodes = [...nodes];
  const centerX = 500;
  const centerY = 350;

  switch (layoutType) {
    case 'hierarchical': {
      const levels: Record<string, number> = {};
      const visited = new Set<string>();
      const getLevel = (nodeId: string): number => {
        if (visited.has(nodeId)) return levels[nodeId] ?? 0;
        visited.add(nodeId);
        const incoming = edges.filter(e => e.target === nodeId);
        if (incoming.length === 0) { levels[nodeId] = 0; return 0; }
        const parentLevels = incoming.map(e => getLevel(e.source));
        levels[nodeId] = Math.max(...parentLevels) + 1;
        return levels[nodeId];
      };
      nodes.forEach(n => getLevel(n.id));
      const byLevel: Record<number, GraphNode[]> = {};
      Object.entries(levels).forEach(([nid, level]) => {
        if (!byLevel[level]) byLevel[level] = [];
        const node = layoutedNodes.find(n => n.id === nid);
        if (node) byLevel[level].push(node);
      });
      Object.entries(byLevel).forEach(([level, lnodes]) => {
        const y = parseInt(level) * 150;
        lnodes.forEach((node, i) => {
          node.position = { x: (i - (lnodes.length - 1) / 2) * 200, y };
        });
      });
      break;
    }
    case 'circular': {
      const radius = Math.min(250, 60 + nodes.length * 12);
      layoutedNodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        node.position = { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
      });
      break;
    }
    case 'concentric': {
      const typeOrder: GraphNodeType[] = ['topic', 'entity', 'event', 'claim', 'document'];
      const radii = [0, 140, 220, 300, 380];
      const byType: Record<string, GraphNode[]> = { topic: [], entity: [], event: [], claim: [], document: [] };
      nodes.forEach(n => { (byType[n.data.type] || byType.entity).push(n); });
      typeOrder.forEach((type, idx) => {
        const tnodes = byType[type];
        const r = radii[idx] || 200;
        tnodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / Math.max(tnodes.length, 1);
          node.position = { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
        });
      });
      break;
    }
    case 'radial':
      layoutedNodes.forEach((node, i) => {
        if (i === 0) { node.position = { x: centerX, y: centerY }; }
        else {
          const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1);
          const r = 180 + nodes.length * 8;
          node.position = { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
        }
      });
      break;
    case 'grid': {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      layoutedNodes.forEach((node, i) => {
        node.position = { x: (i % cols) * 220, y: Math.floor(i / cols) * 160 };
      });
      break;
    }
    case 'force':
    default:
      layoutedNodes.forEach((node) => {
        const angle = Math.random() * 2 * Math.PI;
        const distance = 80 + Math.random() * 250;
        node.position = { x: centerX + distance * Math.cos(angle), y: centerY + distance * Math.sin(angle) };
      });
      break;
  }

  return { nodes: layoutedNodes, edges };
};

export function exportGraphAsJSON(nodes: GraphNode[], edges: GraphEdge[]): string {
  return JSON.stringify({ nodes, edges, metadata: { exportedAt: new Date().toISOString(), nodeCount: nodes.length, edgeCount: edges.length } }, null, 2);
}

export async function exportGraphAsPNG(nodes: GraphNode[], edges: GraphEdge[], filename = 'knowledge-graph.png'): Promise<void> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas');
  const padding = 50;
  const rect = getRectOfNodes(nodes);
  canvas.width = Math.max(800, rect.width + padding * 2);
  canvas.height = Math.max(600, rect.height + padding * 2);
  ctx.fillStyle = '#1d1d1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(243,238,231,0.3)';
  ctx.lineWidth = 1.5;
  edges.forEach(edge => {
    const s = nodes.find(n => n.id === edge.source);
    const t = nodes.find(n => n.id === edge.target);
    if (s && t) {
      ctx.beginPath();
      ctx.moveTo(s.position.x - rect.x + padding, s.position.y - rect.y + padding);
      ctx.lineTo(t.position.x - rect.x + padding, t.position.y - rect.y + padding);
      ctx.stroke();
    }
  });
  nodes.forEach(node => {
    const x = node.position.x - rect.x + padding;
    const y = node.position.y - rect.y + padding;
    ctx.fillStyle = '#F7F7F7';
    ctx.beginPath();
    ctx.roundRect(x - 40, y - 12, 80, 24, 12);
    ctx.fill();
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = (node.data.label || node.id).slice(0, 12);
    ctx.fillText(label, x, y);
  });
  canvas.toBlob(blob => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
}

export const GraphVisualization: FC<GraphVisualizationProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  onNodeDoubleClick,
  focusNodeIds,
}) => {
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular' | 'grid' | 'concentric' | 'radial'>('concentric');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const rfInstance = useRef<any>(null);
  const autoFitTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleExportJSON = useCallback(() => {
    const json = exportGraphAsJSON(initialNodes, initialEdges);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [initialNodes, initialEdges]);

  const handleExportPNG = useCallback(async () => {
    try { await exportGraphAsPNG(initialNodes, initialEdges); } catch (err) { console.error('Export PNG failed:', err); }
  }, [initialNodes, initialEdges]);

  useEffect(() => {
    if (focusNodeIds?.length && rfInstance.current) {
      autoFitTimerRef.current = setTimeout(() => {
        rfInstance.current?.fitView({ nodes: focusNodeIds.map(id => ({ id })), padding: 0.3, duration: 600 });
      }, 400);
      return () => { if (autoFitTimerRef.current) clearTimeout(autoFitTimerRef.current); };
    }
  }, [focusNodeIds]);

  const transformedNodes = useMemo(() =>
    initialNodes.map(node => ({ ...node, type: 'custom', sourcePosition: Position.Right, targetPosition: Position.Left, data: { ...node.data, label: node.data.label || node.id } })),
    [initialNodes]
  );

  const transformedEdges = useMemo(() =>
    initialEdges.map(edge => ({
      ...edge,
      type: 'smoothstep' as const,
      animated: edge.data?.type === 'contradicts',
      style: {
        stroke: edge.data?.type === 'contradicts' ? '#C46B5C' :
                edge.data?.type === 'supports' ? '#6B9E7A' : 'rgba(243,238,231,0.35)',
        strokeWidth: 1.5,
      },
      label: edge.data?.label,
      labelStyle: { fontSize: 9, fontWeight: 600, fill: 'rgba(243,238,231,0.6)' },
      labelBgStyle: { fill: 'rgba(15,15,15,0.7)', fillOpacity: 1 },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 4,
    })),
    [initialEdges]
  );

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() =>
    applyLayout(transformedNodes, transformedEdges, layout),
    [transformedNodes, transformedEdges, layout]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    const cur = JSON.stringify(nodes);
    const nxt = JSON.stringify(layoutedNodes);
    if (cur !== nxt) setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  useEffect(() => { setEdges(layoutedEdges); }, [layoutedEdges, setEdges]);

  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  const handleNodeClick = useCallback((_e: MouseEvent, node: GraphNode) => {
    setSelectedNode(node);
    onNodeClick?.(node);
  }, [onNodeClick]);

  const handleNodeDoubleClick = useCallback((_e: MouseEvent, node: GraphNode) => {
    onNodeDoubleClick?.(node);
    if (node.data.url) window.open(node.data.url, '_blank');
  }, [onNodeDoubleClick]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onInit={inst => { rfInstance.current = inst; }}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(243,238,231,0.08)" gap={24} />
        <Controls
          className="!border-[#1d1d1f] !rounded-xl !shadow-none !bg-[#F7F7F7]"
        />
        <MiniMap
          nodeColor={node => NODE_ACCENT[node.data?.type] || '#888'}
          className="!bg-[#1a1a1a] !border !border-[#1d1d1f] !rounded-xl"
          maskColor="rgba(15,15,15,0.85)"
        />
      </ReactFlow>

      {/* Layout Controls — MNEMOSYNE pill style */}
      <div className="absolute top-4 right-4 bg-[#F7F7F7] rounded-2xl border border-[#1d1d1f] p-2.5 z-10">
        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-1.5 px-1">Layout</div>
        <div className="grid grid-cols-3 gap-1 mb-1.5">
          {[
            { value: 'force', label: 'Force' },
            { value: 'hierarchical', label: 'Level' },
            { value: 'concentric', label: 'Ring' },
            { value: 'circular', label: 'Circle' },
            { value: 'grid', label: 'Grid' },
            { value: 'radial', label: 'Star' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLayout(value as any)}
              className={`px-2 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                layout === value
                  ? 'bg-[#1d1d1f] text-[#F7F7F7]'
                  : 'text-[#888] hover:bg-[#D1D1D1]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="border-t border-[#1d1d1f]/20 pt-1.5 mt-1">
          <div className="flex gap-1">
            <button onClick={handleExportJSON} className="flex-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-[#D1D1D1] hover:bg-[#b8b8b8] transition-colors">JSON</button>
            <button onClick={handleExportPNG} className="flex-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-[#D1D1D1] hover:bg-[#b8b8b8] transition-colors">PNG</button>
          </div>
        </div>
      </div>

      {/* Node Details — MNEMOSYNE module style */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 bg-[#F7F7F7] rounded-2xl border border-[#1d1d1f] p-4 z-10 max-w-xs">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-[#1d1d1f] text-sm">{selectedNode.data.label}</h3>
            <button onClick={() => setSelectedNode(null)} className="text-[#888] hover:text-[#1d1d1f] text-xs font-mono">✕</button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_ACCENT[selectedNode.data.type] || '#888' }} />
              <span className="font-mono text-[#888] uppercase tracking-wider">{selectedNode.data.type}</span>
            </div>
            {selectedNode.data.description && (
              <p className="text-[#1d1d1f]/70 leading-relaxed">{selectedNode.data.description}</p>
            )}
            {selectedNode.data.url && (
              <a href={selectedNode.data.url} target="_blank" rel="noopener noreferrer" className="text-[#2A5A6B] hover:underline font-medium">Open link →</a>
            )}
          </div>
        </div>
      )}

      {/* Legend — MNEMOSYNE tag style */}
      <div className="absolute bottom-4 left-4 bg-[#F7F7F7]/90 backdrop-blur-sm rounded-2xl border border-[#1d1d1f] p-3 z-10">
        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#888] mb-2">Legend</div>
        <div className="space-y-1.5">
          {[
            { type: 'topic', label: 'TOPIC' },
            { type: 'entity', label: 'ENTITY' },
            { type: 'event', label: 'EVENT' },
            { type: 'claim', label: 'CLAIM' },
          ].map(({ type, label }) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_ACCENT[type] }} />
              <span className="text-[10px] font-semibold text-[#1d1d1f]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GraphVisualization;
