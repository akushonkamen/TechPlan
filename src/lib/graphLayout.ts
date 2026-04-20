import type { GraphEdge, GraphNode, GraphSensemakingCluster } from '../types/graph';

export type GraphLayoutMode = 'terrain' | 'focus' | 'timeline' | 'grid' | 'radar' | 'matrix' | 'bundle';

interface LayoutOptions {
  centerNodeId?: string;
  focusNodeId?: string;
  terrainClusters?: GraphSensemakingCluster[];
}

interface RankedNode {
  node: GraphNode;
  score: number;
}

const CENTER = { x: 0, y: 0 };

const TYPE_ORDER: Record<string, number> = {
  technology: 0,
  product: 1,
  organization: 2,
  entity: 3,
  event: 4,
  claim: 5,
  document: 6,
};

function calculateNodeImportance(node: GraphNode, edges: GraphEdge[]): number {
  if (typeof node.data.importance === 'number') return node.data.importance;

  const degree = edges.reduce((count, edge) => (
    edge.source === node.id || edge.target === node.id ? count + 1 : count
  ), 0);
  const metadata = node.data.metadata ?? {};
  const docCount = Number(metadata.docCount ?? metadata.doc_count ?? 0);
  const confidence = Number(metadata.confidence ?? 0.5);
  const recentBoost = node.data.recent ? 0.12 : 0;

  const normalizedDegree = Math.log1p(degree) / Math.log1p(50);
  const normalizedDocs = Math.log1p(docCount) / Math.log1p(20);
  const spreadConfidence = Math.sqrt(confidence);

  return Number((
    normalizedDegree * 0.40 +
    normalizedDocs * 0.20 +
    spreadConfidence * 0.30 +
    recentBoost
  ).toFixed(4));
}

export function rankNodesByImportance(nodes: GraphNode[], edges: GraphEdge[]): RankedNode[] {
  return [...nodes]
    .map(node => ({ node, score: calculateNodeImportance(node, edges) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const typeDiff = (TYPE_ORDER[a.node.data.type] ?? 99) - (TYPE_ORDER[b.node.data.type] ?? 99);
      if (typeDiff !== 0) return typeDiff;
      return getNodeSortLabel(a.node).localeCompare(getNodeSortLabel(b.node), 'zh-CN');
    });
}

export function applyGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  mode: GraphLayoutMode = 'radar',
  options: LayoutOptions = {}
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const layoutedNodes = nodes.map(node => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
  const layoutedEdges = edges.map(edge => ({ ...edge, data: edge.data ? { ...edge.data } : edge.data }));

  if (layoutedNodes.length === 0) return { nodes: layoutedNodes, edges: layoutedEdges };
  if (mode === 'grid') return applyGridLayout(layoutedNodes, layoutedEdges);
  if (mode === 'focus') return applyFocusLayout(layoutedNodes, layoutedEdges, options);
  if (mode === 'timeline') return applyTimelineLayout(layoutedNodes, layoutedEdges, options);
  if (mode === 'terrain') return applyTerrainLayout(layoutedNodes, layoutedEdges, options);
  if (mode === 'matrix') return applyMatrixMode(layoutedNodes, layoutedEdges);
  if (mode === 'bundle') return applyBundleLayout(layoutedNodes, layoutedEdges, options);
  return applyRadarLayout(layoutedNodes, layoutedEdges, options);
}

function applyTerrainLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const center = findCenterNode(nodes, options.centerNodeId);
  if (center) center.position = { x: 0, y: -80 };

  const clusterIds = getTerrainClusterOrder(nodes, options.terrainClusters);
  const slots = [
    { x: -520, y: -270 },
    { x: 0, y: -320 },
    { x: 520, y: -270 },
    { x: -520, y: 120 },
    { x: 0, y: 155 },
    { x: 520, y: 120 },
  ];

  const clusterSlot = new Map<string, { x: number; y: number }>();
  clusterIds.forEach((clusterId, index) => {
    clusterSlot.set(clusterId, slots[Math.min(index, slots.length - 1)]);
  });

  const nodesByCluster = new Map<string, GraphNode[]>();
  nodes
    .filter(node => node.id !== center?.id)
    .filter(node => !['event', 'claim', 'document'].includes(node.data.type))
    .forEach(node => {
      const clusterId = node.data.clusterId || 'uncategorized';
      if (!nodesByCluster.has(clusterId)) nodesByCluster.set(clusterId, []);
      nodesByCluster.get(clusterId)!.push(node);
    });

  for (const [clusterId, clusterNodes] of nodesByCluster) {
    const slot = clusterSlot.get(clusterId) ?? slots[slots.length - 1];
    placeTerrainCluster(clusterNodes, edges, slot.x, slot.y);
  }

  const eventNodes = rankNodesByImportance(
    nodes.filter(node => node.data.type === 'event'),
    edges
  ).map(item => item.node);
  placeBand(eventNodes, edges, 520, 190);

  return { nodes, edges };
}

function applyRadarLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const center = findCenterNode(nodes, options.centerNodeId);
  if (center) center.position = CENTER;

  const groups = groupNodes(nodes.filter(node => node.id !== center?.id));

  placeRadialGroup(groups.technology, edges, 150, 390, 220, 92);
  placeRadialGroup(groups.product, edges, 35, 130, 330, 96);
  placeRadialGroup(groups.organization, edges, -35, 35, 410, 92);
  placeRadialGroup(groups.entity, edges, 205, 315, 340, 90);
  placeBand(groups.event, edges, 430, 180);
  placeBand(groups.claim, edges, 545, 210);
  placeBand(groups.document, edges, 655, 230);

  return { nodes, edges };
}

function applyFocusLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const focus = nodes.find(node => node.id === options.focusNodeId)
    ?? findCenterNode(nodes, options.centerNodeId)
    ?? nodes[0];
  focus.position = CENTER;

  const neighborIds = new Set<string>();
  edges.forEach(edge => {
    if (edge.source === focus.id) neighborIds.add(edge.target);
    if (edge.target === focus.id) neighborIds.add(edge.source);
  });

  const neighbors = rankNodesByImportance(
    nodes.filter(node => node.id !== focus.id && neighborIds.has(node.id)),
    edges
  ).map(item => item.node);
  const outer = rankNodesByImportance(
    nodes.filter(node => node.id !== focus.id && !neighborIds.has(node.id)),
    edges
  ).map(item => item.node);

  placeRadialNodes(neighbors, 0, 360, 230, 0);
  placeRadialNodes(outer, 0, 360, 430, 18);

  return { nodes, edges };
}

function applyGridLayout(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ranked = [...nodes].sort(compareNodes);
  const cols = Math.max(1, Math.ceil(Math.sqrt(ranked.length)));
  ranked.forEach((node, index) => {
    node.position = {
      x: (index % cols) * 230 - ((cols - 1) * 230) / 2,
      y: Math.floor(index / cols) * 150,
    };
  });
  return { nodes, edges };
}

function applyTimelineLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const center = findCenterNode(nodes, options.centerNodeId);
  if (center) center.position = { x: 0, y: -220 };

  const events = rankNodesByImportance(nodes.filter(node => node.data.type === 'event'), edges).map(item => item.node);
  placeBand(events, edges, 80, 230);

  const nonEvents = rankNodesByImportance(
    nodes.filter(node => node.id !== center?.id && node.data.type !== 'event'),
    edges
  ).map(item => item.node);
  nonEvents.forEach((node, index) => {
    node.position = {
      x: Math.round((index - (nonEvents.length - 1) / 2) * 150),
      y: index % 2 === 0 ? -60 : 240,
    };
  });

  return { nodes, edges };
}

function applyMatrixMode(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Matrix layout: nodes listed vertically on the left, with row/col positions for cells
  const ranked = rankNodesByImportance(nodes, edges).map(item => item.node);
  const cellSize = 28;
  const labelOffset = 120;
  ranked.forEach((node, index) => {
    node.position = {
      x: -labelOffset,
      y: index * cellSize,
    };
  });
  return { nodes, edges };
}

function applyBundleLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Circular bundle: nodes on a circle, sorted by cluster
  const center = findCenterNode(nodes, options.centerNodeId);
  if (center) center.position = CENTER;

  const nonCenter = nodes.filter(n => n.id !== center?.id);
  const byCluster = new Map<string, GraphNode[]>();
  nonCenter.forEach(node => {
    const cid = node.data.clusterId || '_uncategorized';
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid)!.push(node);
  });

  // Sort clusters: put uncategorized last
  const clusterOrder = [...byCluster.entries()]
    .sort(([a], [b]) => {
      if (a === '_uncategorized') return 1;
      if (b === '_uncategorized') return -1;
      return 0;
    });

  const allNodes = clusterOrder.flatMap(([, group]) =>
    rankNodesByImportance(group, edges).map(item => item.node)
  );

  const radius = Math.max(200, allNodes.length * 12);
  allNodes.forEach((node, index) => {
    const angle = (index / allNodes.length) * Math.PI * 2 - Math.PI / 2;
    node.position = {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    };
  });

  return { nodes, edges };
}

function groupNodes(nodes: GraphNode[]): Record<string, GraphNode[]> {
  const groups: Record<string, GraphNode[]> = {
    technology: [],
    product: [],
    organization: [],
    entity: [],
    event: [],
    claim: [],
    document: [],
  };

  nodes.forEach(node => {
    const key = groups[node.data.type] ? node.data.type : 'entity';
    groups[key].push(node);
  });

  return groups;
}

function placeRadialGroup(
  nodes: GraphNode[],
  edges: GraphEdge[],
  startDeg: number,
  endDeg: number,
  baseRadius: number,
  radiusStep: number
) {
  rankNodesByImportance(nodes, edges).forEach(({ node, score }) => {
    const ring = score >= 0.75 ? 0 : score >= 0.45 ? 1 : 2;
    const angleDeg = stableAngle(node, startDeg, endDeg, ring * 7);
    const angle = (angleDeg * Math.PI) / 180;
    const radius = baseRadius + ring * radiusStep;
    node.position = {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    };
  });
}

function placeTerrainCluster(nodes: GraphNode[], edges: GraphEdge[], centerX: number, centerY: number) {
  const roleRank: Record<string, number> = { anchor: 0, bridge: 1, member: 2, supporting: 3 };
  const ranked = rankNodesByImportance(nodes, edges)
    .map(item => item.node)
    .sort((a, b) => {
      const roleDiff = (roleRank[a.data.clusterRole || 'member'] ?? 2) - (roleRank[b.data.clusterRole || 'member'] ?? 2);
      if (roleDiff !== 0) return roleDiff;
      return getNodeSortLabel(a).localeCompare(getNodeSortLabel(b), 'zh-CN');
    });

  ranked.forEach((node, index) => {
    if (index === 0 || node.data.clusterRole === 'anchor') {
      const anchorOffset = index === 0 ? 0 : index * 42;
      node.position = { x: centerX + anchorOffset, y: centerY };
      return;
    }

    const angle = stableAngle(node, 0, 360, index * 11) * Math.PI / 180;
    const radius = node.data.clusterRole === 'bridge' ? 155 : node.data.clusterRole === 'supporting' ? 235 : 195;
    node.position = {
      x: Math.round(centerX + Math.cos(angle) * radius),
      y: Math.round(centerY + Math.sin(angle) * radius * 0.68),
    };
  });
}

function getTerrainClusterOrder(nodes: GraphNode[], clusters?: GraphSensemakingCluster[]): string[] {
  const ids = clusters?.length
    ? [...clusters]
      .sort((a, b) => b.priority - a.priority)
      .map(cluster => cluster.id)
    : [...new Set(nodes.map(node => node.data.clusterId).filter(Boolean))] as string[];

  return ids.slice(0, 6).sort((a, b) => {
    const aOrg = isOrganizationCluster(a, clusters) ? 1 : 0;
    const bOrg = isOrganizationCluster(b, clusters) ? 1 : 0;
    return aOrg - bOrg;
  });
}

function isOrganizationCluster(clusterId: string, clusters?: GraphSensemakingCluster[]): boolean {
  const label = clusters?.find(cluster => cluster.id === clusterId)?.label ?? clusterId;
  return /组织|公司|投资|org|invest/i.test(label);
}

function placeRadialNodes(
  nodes: GraphNode[],
  startDeg: number,
  endDeg: number,
  radius: number,
  offsetDeg: number
) {
  if (nodes.length === 0) return;
  const span = endDeg - startDeg;
  const step = nodes.length === 1 ? 0 : span / (nodes.length - 1);

  nodes.forEach((node, index) => {
    const angleDeg = (nodes.length === 1 ? startDeg + span / 2 : startDeg + step * index) + offsetDeg;
    const angle = (angleDeg * Math.PI) / 180;
    node.position = {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    };
  });
}

function placeBand(nodes: GraphNode[], edges: GraphEdge[], y: number, spacing: number) {
  const ranked = rankNodesByImportance(nodes, edges).map(item => item.node);
  ranked.forEach((node, index) => {
    node.position = {
      x: Math.round((index - (ranked.length - 1) / 2) * spacing),
      y,
    };
  });
}

function findCenterNode(nodes: GraphNode[], centerNodeId?: string): GraphNode | undefined {
  return nodes.find(node => node.id === centerNodeId)
    ?? nodes.find(node => node.data.importance === Math.max(...nodes.map(n => n.data.importance ?? 0)))
    ?? nodes[0];
}

function compareNodes(a: GraphNode, b: GraphNode): number {
  const typeDiff = (TYPE_ORDER[a.data.type] ?? 99) - (TYPE_ORDER[b.data.type] ?? 99);
  if (typeDiff !== 0) return typeDiff;
  return getNodeSortLabel(a).localeCompare(getNodeSortLabel(b), 'zh-CN');
}

function getNodeSortLabel(node: GraphNode): string {
  return node.data.canonicalName ?? node.data.fullLabel ?? node.data.label ?? node.id;
}

function stableAngle(node: GraphNode, startDeg: number, endDeg: number, offsetDeg: number): number {
  const span = endDeg - startDeg;
  const label = `${node.data.type}:${getNodeSortLabel(node)}:${node.id}`;
  const fraction = stableHash(label) / 0xffffffff;
  return startDeg + span * fraction + offsetDeg;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
