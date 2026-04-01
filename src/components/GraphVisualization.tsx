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
  highlighted?: boolean; // true=emphasized, false=dimmed, undefined=normal
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

// Custom Node Component
const CustomNode: FC<{ data: GraphNodeData }> = ({ data }) => {
  // Highlight context: undefined=normal, true=emphasized, false=dimmed
  const hasHighlightContext = data.highlighted !== undefined;
  const isHighlighted = data.highlighted === true;

  const getNodeStyle = () => {
    if (hasHighlightContext && !isHighlighted) {
      // Dimmed node: thin gray border, faded
      return 'bg-[#e8e8ed] border-[#d2d2d7] border';
    }
    switch (data.type) {
      case 'topic':
        return isHighlighted ? 'bg-[#0071e3] border-[#0071e3] border-[3px]' : 'bg-[#0071e3] border-[#0071e3]/30 border-2';
      case 'entity':
        return isHighlighted ? 'bg-blue-500 border-[#0071e3] border-[3px]' : 'bg-blue-500 border-blue-200 border-2';
      case 'event':
        return isHighlighted ? 'bg-purple-500 border-[#0071e3] border-[3px]' : 'bg-purple-500 border-purple-200 border-2';
      case 'claim':
        return isHighlighted ? 'bg-amber-500 border-[#0071e3] border-[3px]' : 'bg-amber-500 border-amber-200 border-2';
      case 'document':
        return isHighlighted ? 'bg-emerald-500 border-[#0071e3] border-[3px]' : 'bg-emerald-500 border-emerald-200 border-2';
      default:
        return 'bg-[#86868b] border-[#d2d2d7] border-2';
    }
  };

  const getIcon = () => {
    switch (data.type) {
      case 'topic': return '🎯';
      case 'entity': return '🏢';
      case 'event': return '📅';
      case 'claim': return '💡';
      case 'document': return '📄';
      default: return '📦';
    }
  };

  const dimClasses = hasHighlightContext && !isHighlighted
    ? 'opacity-40 scale-[0.7]'
    : '';

  return (
    <div className={`px-4 py-2 rounded-full shadow-md ${getNodeStyle()} ${dimClasses} text-sm font-medium min-w-[80px] text-center transition-all duration-300 ${
      hasHighlightContext && !isHighlighted ? 'text-[#86868b]' : 'text-white'
    }`}>
      <span className="mr-1">{getIcon()}</span>
      <span>{data.label}</span>
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

  switch (layoutType) {
    case 'hierarchical':
      const levels: Record<string, number> = {};
      const visited = new Set<string>();

      const getLevel = (nodeId: string, currentLevel = 0): number => {
        if (visited.has(nodeId)) return levels[nodeId] ?? 0;
        visited.add(nodeId);

        const incomingEdges = edges.filter(e => e.target === nodeId);
        if (incomingEdges.length === 0) {
          levels[nodeId] = 0;
          return 0;
        }

        const parentLevels = incomingEdges.map(e => getLevel(e.source, currentLevel + 1));
        levels[nodeId] = Math.max(...parentLevels) + 1;
        return levels[nodeId];
      };

      nodes.forEach(n => getLevel(n.id));

      const nodesByLevel: Record<number, GraphNode[]> = {};
      Object.entries(levels).forEach(([nodeId, level]) => {
        if (!nodesByLevel[level]) nodesByLevel[level] = [];
        const node = layoutedNodes.find(n => n.id === nodeId);
        if (node) nodesByLevel[level].push(node);
      });

      Object.entries(nodesByLevel).forEach(([level, levelNodes]) => {
        const y = parseInt(level) * 150;
        levelNodes.forEach((node, i) => {
          const x = (i - (levelNodes.length - 1) / 2) * 200;
          node.position = { x, y };
        });
      });
      break;

    case 'circular':
      const centerX = 400;
      const centerY = 300;
      const radius = Math.min(200, 50 + nodes.length * 15);

      layoutedNodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        node.position = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });
      break;

    case 'concentric':
      // Organize nodes by type in concentric circles
      const typeOrder: GraphNodeType[] = ['topic', 'entity', 'event', 'claim', 'document'];
      const radii = [0, 120, 200, 280, 360];
      const nodesByType: Record<GraphNodeType, GraphNode[]> = {
        topic: [],
        entity: [],
        event: [],
        claim: [],
        document: [],
      };

      nodes.forEach(n => {
        if (n.data.type && nodesByType[n.data.type]) {
          nodesByType[n.data.type].push(n);
        } else {
          nodesByType.entity.push(n);
        }
      });

      typeOrder.forEach((type, typeIdx) => {
        const typeNodes = nodesByType[type];
        const radius = radii[typeIdx] || 200;
        typeNodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / typeNodes.length;
          node.position = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          };
        });
      });
      break;

    case 'radial':
      // Star layout: first node at center, others in a circle
      layoutedNodes.forEach((node, i) => {
        if (i === 0) {
          node.position = { x: centerX, y: centerY };
        } else {
          const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1);
          const radius = 150 + nodes.length * 10;
          node.position = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          };
        }
      });
      break;

    case 'grid':
      const cols = Math.ceil(Math.sqrt(nodes.length));
      layoutedNodes.forEach((node, i) => {
        node.position = {
          x: (i % cols) * 200,
          y: Math.floor(i / cols) * 150,
        };
      });
      break;

    case 'force':
    default:
      layoutedNodes.forEach((node, i) => {
        const angle = Math.random() * 2 * Math.PI;
        const distance = 100 + Math.random() * 200;
        node.position = {
          x: 400 + distance * Math.cos(angle),
          y: 300 + distance * Math.sin(angle),
        };
      });
      break;
  }

  return { nodes: layoutedNodes, edges };
};

/**
 * Export graph data as JSON string
 */
export function exportGraphAsJSON(nodes: GraphNode[], edges: GraphEdge[]): string {
  const exportData: GraphExportData = {
    nodes,
    edges,
    metadata: {
      exportedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export graph as PNG image
 */
export async function exportGraphAsPNG(
  nodes: GraphNode[],
  edges: GraphEdge[],
  filename = 'knowledge-graph.png'
): Promise<void> {
  // Create a canvas and draw the graph
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  // Calculate bounds
  const padding = 50;
  const nodesRect = getRectOfNodes(nodes);
  const bounds = {
    x: nodesRect.x - padding,
    y: nodesRect.y - padding,
    width: nodesRect.width + padding * 2,
    height: nodesRect.height + padding * 2,
  };

  // Set canvas size (min 800x600 for better visibility)
  canvas.width = Math.max(800, bounds.width);
  canvas.height = Math.max(600, bounds.height);

  // Draw white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate scale and offset to center the graph
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
  const offsetX = (canvas.width - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (canvas.height - bounds.height * scale) / 2 - bounds.y * scale;

  // Draw edges first
  ctx.strokeStyle = '#86868b';
  ctx.lineWidth = 2;
  edges.forEach(edge => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (source && target) {
      ctx.beginPath();
      ctx.moveTo(source.position.x * scale + offsetX, source.position.y * scale + offsetY);
      ctx.lineTo(target.position.x * scale + offsetX, target.position.y * scale + offsetY);
      ctx.stroke();
    }
  });

  // Draw nodes
  nodes.forEach(node => {
    const x = node.position.x * scale + offsetX;
    const y = node.position.y * scale + offsetY;

    // Node circle
    const nodeColor = getNodeColor(node.data.type);
    ctx.fillStyle = nodeColor;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, 2 * Math.PI);
    ctx.fill();

    // Node border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Node label
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = node.data.label || node.id;
    const truncatedLabel = label.length > 15 ? label.substring(0, 15) + '...' : label;
    ctx.fillText(truncatedLabel, x, y + 35);
  });

  // Download
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

function getNodeColor(type: GraphNodeType): string {
  const colors: Record<GraphNodeType, string> = {
    topic: '#0071e3',
    entity: '#3b82f6',
    event: '#a855f7',
    claim: '#f59e0b',
    document: '#10b981',
  };
  return colors[type] || '#86868b';
}

export const GraphVisualization: FC<GraphVisualizationProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  onNodeDoubleClick,
  focusNodeIds,
}) => {
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular' | 'grid' | 'concentric' | 'radial'>('force');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const rfInstance = useRef<any>(null);
  const autoFitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    const json = exportGraphAsJSON(initialNodes, initialEdges);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [initialNodes, initialEdges]);

  const handleExportPNG = useCallback(async () => {
    try {
      await exportGraphAsPNG(initialNodes, initialEdges, `knowledge-graph-${new Date().toISOString().slice(0, 10)}.png`);
    } catch (err) {
      console.error('Failed to export PNG:', err);
      alert('导出 PNG 失败，请使用现代浏览器');
    }
    setShowExportMenu(false);
  }, [initialNodes, initialEdges]);

  // Auto-focus on highlighted nodes when focusNodeIds changes
  useEffect(() => {
    if (focusNodeIds?.length && rfInstance.current) {
      autoFitTimerRef.current = setTimeout(() => {
        rfInstance.current?.fitView({
          nodes: focusNodeIds.map(id => ({ id })),
          padding: 0.3,
          duration: 600,
        });
      }, 400);
      return () => {
        if (autoFitTimerRef.current) {
          clearTimeout(autoFitTimerRef.current);
          autoFitTimerRef.current = null;
        }
      };
    }
  }, [focusNodeIds]);

  // Transform nodes to ReactFlow format
  const transformedNodes = useMemo(() => {
    return initialNodes.map(node => ({
      ...node,
      type: 'custom',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        ...node.data,
        label: node.data.label || node.id,
      },
    }));
  }, [initialNodes]);

  // Transform edges to ReactFlow format
  const transformedEdges = useMemo(() => {
    return initialEdges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      animated: edge.data?.type === 'contradicts',
      style: {
        stroke: edge.data?.type === 'contradicts' ? '#ff3b30' :
               edge.data?.type === 'supports' ? '#34c759' : '#86868b',
        strokeWidth: 2,
      },
      label: edge.data?.label,
      labelStyle: {
        fontSize: 10,
        fontWeight: 500,
      },
    }));
  }, [initialEdges]);

  // Apply layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    return applyLayout(transformedNodes, transformedEdges, layout);
  }, [transformedNodes, transformedEdges, layout]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    // Only update if actually different to prevent potential loops
    const currentJSON = JSON.stringify(nodes);
    const newJSON = JSON.stringify(layoutedNodes);
    if (currentJSON !== newJSON) {
      setNodes(layoutedNodes);
    }
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: GraphNode) => {
      setSelectedNode(node);
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: GraphNode) => {
      onNodeDoubleClick?.(node);
      if (node.data.url) {
        window.open(node.data.url, '_blank');
      }
    },
    [onNodeDoubleClick]
  );

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
        onInit={(instance) => { rfInstance.current = instance; }}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#d2d2d7" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data.type) {
              case 'topic': return '#0071e3';
              case 'entity': return '#3b82f6';
              case 'event': return '#a855f7';
              case 'claim': return '#f59e0b';
              case 'document': return '#10b981';
              default: return '#86868b';
            }
          }}
          className="!bg-white !border !border-[#d2d2d7]"
        />
      </ReactFlow>

      {/* Layout & Export Controls */}
      <div className="absolute top-4 right-4 bg-white rounded-xl shadow-md border border-[#d2d2d7] p-2 z-10">
        <div className="text-xs font-medium text-[#86868b] mb-2 px-1">布局</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {[
            { value: 'force', label: '力导向' },
            { value: 'hierarchical', label: '层级' },
            { value: 'circular', label: '环形' },
            { value: 'grid', label: '网格' },
            { value: 'concentric', label: '同心圆' },
            { value: 'radial', label: '辐射' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLayout(value as any)}
              className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                layout === value
                  ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium'
                  : 'text-[#86868b] hover:bg-[#f5f5f7]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="border-t border-[#d2d2d7] pt-2 mt-2">
          <div className="text-xs font-medium text-[#86868b] mb-1 px-1">导出</div>
          <div className="flex gap-1">
            <button
              onClick={handleExportJSON}
              className="flex-1 px-2 py-1 text-xs rounded-lg bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] transition-colors"
            >
              JSON
            </button>
            <button
              onClick={handleExportPNG}
              className="flex-1 px-2 py-1 text-xs rounded-lg bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] transition-colors"
            >
              PNG
            </button>
          </div>
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 bg-white rounded-xl shadow-md border border-[#d2d2d7] p-4 z-10 max-w-xs">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-[#1d1d1f]">{selectedNode.data.label}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-[#aeaeb5] hover:text-[#86868b]"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#86868b]">类型:</span>
              <span className="capitalize text-[#1d1d1f]">{selectedNode.data.type}</span>
            </div>
            {selectedNode.data.description && (
              <div className="flex items-start gap-2">
                <span className="text-[#86868b]">描述:</span>
                <span className="text-[#1d1d1f]">{selectedNode.data.description}</span>
              </div>
            )}
            {selectedNode.data.url && (
              <div className="flex items-center gap-2">
                <span className="text-[#86868b]">链接:</span>
                <a
                  href={selectedNode.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0071e3] hover:underline"
                >
                  打开
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-sm border border-[#d2d2d7] text-xs space-y-2 z-10">
        <div className="font-medium text-[#86868b] mb-1">图例</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#0071e3]"></div>
          <span className="text-[#1d1d1f]">主题 (Topic)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-[#1d1d1f]">实体 (Entity)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-[#1d1d1f]">事件 (Event)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-[#1d1d1f]">主张 (Claim)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-[#1d1d1f]">文献 (Document)</span>
        </div>
      </div>
    </div>
  );
};

export default GraphVisualization;
