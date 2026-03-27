import React, { useCallback, useMemo, useState } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';

// Node Types
export type GraphNodeType = 'topic' | 'entity' | 'event' | 'claim' | 'document';

export interface GraphNodeData {
  label: string;
  type: GraphNodeType;
  description?: string;
  url?: string;
  metadata?: Record<string, any>;
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
}

// Custom Node Component
const CustomNode: React.FC<{ data: GraphNodeData }> = ({ data }) => {
  const getNodeStyle = () => {
    switch (data.type) {
      case 'topic':
        return 'bg-indigo-600 border-indigo-200';
      case 'entity':
        return 'bg-blue-500 border-blue-200';
      case 'event':
        return 'bg-purple-500 border-purple-200';
      case 'claim':
        return 'bg-amber-500 border-amber-200';
      case 'document':
        return 'bg-emerald-500 border-emerald-200';
      default:
        return 'bg-gray-500 border-gray-200';
    }
  };

  const getIcon = () => {
    switch (data.type) {
      case 'topic':
        return '🎯';
      case 'entity':
        return '🏢';
      case 'event':
        return '📅';
      case 'claim':
        return '💡';
      case 'document':
        return '📄';
      default:
        return '📦';
    }
  };

  return (
    <div className={`px-4 py-2 rounded-full border-2 shadow-md ${getNodeStyle()} text-white text-sm font-medium min-w-[80px] text-center`}>
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
  layoutType: 'force' | 'hierarchical' | 'circular' | 'grid'
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const layoutedNodes = [...nodes];

  switch (layoutType) {
    case 'hierarchical':
      // Simple hierarchical layout
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
      // Simple force-directed-like initial positioning
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

export const GraphVisualization: React.FC<GraphVisualizationProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  onNodeDoubleClick,
}) => {
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular' | 'grid'>('force');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

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
        stroke: edge.data?.type === 'contradicts' ? '#ef4444' :
               edge.data?.type === 'supports' ? '#22c55e' : '#9ca3af',
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

  // Update nodes when layout changes
  React.useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  // Update edges when data changes
  React.useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
      setSelectedNode(node);
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
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
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data.type) {
              case 'topic': return '#4f46e5';
              case 'entity': return '#3b82f6';
              case 'event': return '#a855f7';
              case 'claim': return '#f59e0b';
              case 'document': return '#10b981';
              default: return '#6b7280';
            }
          }}
          className="!bg-white !border border-gray-200"
        />
      </ReactFlow>

      {/* Layout Controls */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md border border-gray-200 p-2 z-10">
        <div className="text-xs font-medium text-gray-700 mb-2 px-1">布局</div>
        <div className="flex flex-col gap-1">
          {[
            { value: 'force', label: '力导向' },
            { value: 'hierarchical', label: '层级' },
            { value: 'circular', label: '环形' },
            { value: 'grid', label: '网格' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLayout(value as any)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                layout === value
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-md border border-gray-200 p-4 z-10 max-w-xs">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-gray-900">{selectedNode.data.label}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">类型:</span>
              <span className="capitalize text-gray-700">{selectedNode.data.type}</span>
            </div>
            {selectedNode.data.description && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500">描述:</span>
                <span className="text-gray-700">{selectedNode.data.description}</span>
              </div>
            )}
            {selectedNode.data.url && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">链接:</span>
                <a
                  href={selectedNode.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  打开
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-sm border border-gray-200 text-xs space-y-2 z-10">
        <div className="font-medium text-gray-700 mb-1">图例</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
          <span>主题 (Topic)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>实体 (Entity)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span>事件 (Event)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span>主张 (Claim)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span>文献 (Document)</span>
        </div>
      </div>
    </div>
  );
};

export default GraphVisualization;
