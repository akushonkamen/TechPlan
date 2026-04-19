/**
 * Graph Analysis Library for TechPlan Knowledge Graph
 *
 * Provides: statistics, shortest path, PageRank, community detection,
 * link prediction, anomaly detection, subgraph extraction, cross-topic resolution.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface AnalysisNode {
  id: string;
  type?: string;
  label?: string;
  properties?: Record<string, any>;
}

export interface AnalysisEdge {
  id?: string;
  source: string;
  target: string;
  confidence?: number;
  type?: string;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
  maxDegree: number;
  degreeStdDev: number;
  connectedComponents: number;
  largestComponentSize: number;
  diameter: number;
  avgClusteringCoefficient: number;
  typeDistribution: Record<string, number>;
  relationDistribution: Record<string, number>;
  topDegreeNodes: Array<{ id: string; label: string; type: string; degree: number }>;
}

export interface PathResult {
  path: string[];
  totalWeight: number;
  edgeIds: string[];
  found: boolean;
}

export interface CentralityResult {
  nodeId: string;
  label: string;
  type: string;
  score: number;
  rank: number;
}

export interface Community {
  id: string;
  label: string;
  nodeIds: string[];
  size: number;
  avgConfidence: number;
  dominantType: string;
}

export interface LinkPrediction {
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  score: number;
  method: string;
  commonNeighbors: number;
}

export interface GraphAnomaly {
  nodeId: string;
  label: string;
  type: string;
  anomalyType: 'degree_outlier' | 'confidence_outlier' | 'isolated_high' | 'bridge_critical';
  description: string;
  severity: number;
}

export interface GraphDiff {
  addedNodes: string[];
  removedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  confidenceChanges: Array<{ edgeId: string; oldConf: number; newConf: number }>;
  summary: string;
}

export interface SubgraphFilter {
  nodeTypes?: string[];
  edgeTypes?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  nodeIds?: string[];
  maxNodes?: number;
}

export interface GlobalEntity {
  id: string;
  label: string;
  type: string;
  topicIds: string[];
  topicNames: string[];
  crossTopicEdges: number;
}

// ─── Adjacency helpers ───────────────────────────────────────────────

function buildAdjacency(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  nodes.forEach(n => adj.set(n.id, new Set()));
  edges.forEach(e => {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  });
  return adj;
}

function degreeMap(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Map<string, number> {
  const deg = new Map<string, number>();
  nodes.forEach(n => deg.set(n.id, 0));
  edges.forEach(e => {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  });
  return deg;
}

function nodeLabelMap(nodes: AnalysisNode[]): Map<string, AnalysisNode> {
  return new Map(nodes.map(n => [n.id, n]));
}

// ─── 1. Graph Statistics ─────────────────────────────────────────────

export function computeStatistics(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): GraphStatistics {
  const n = nodes.length;
  const m = edges.length;
  const deg = degreeMap(nodes, edges);
  const degValues = [...deg.values()];
  const avgDeg = n > 0 ? degValues.reduce((a, b) => a + b, 0) / n : 0;
  const maxDeg = Math.max(0, ...degValues);
  const variance = degValues.length > 0
    ? degValues.reduce((s, d) => s + (d - avgDeg) ** 2, 0) / degValues.length
    : 0;

  // Connected components via BFS
  const adj = buildAdjacency(nodes, edges);
  const visited = new Set<string>();
  let components = 0;
  let largest = 0;
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    components++;
    const queue = [node.id];
    let size = 0;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      size++;
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    largest = Math.max(largest, size);
  }

  // Diameter: BFS from up to 10 random nodes in largest component
  const diameter = computeDiameter(nodes, adj);

  // Clustering coefficient
  const avgCC = computeAvgClusteringCoefficient(nodes, adj);

  // Type distribution
  const typeDist: Record<string, number> = {};
  nodes.forEach(n => { const t = n.type || 'unknown'; typeDist[t] = (typeDist[t] || 0) + 1; });

  // Relation distribution
  const relDist: Record<string, number> = {};
  edges.forEach(e => { const t = e.type || 'unknown'; relDist[t] = (relDist[t] || 0) + 1; });

  // Top degree nodes
  const nodeMap = nodeLabelMap(nodes);
  const topDegree = [...deg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, d]) => {
      const nd = nodeMap.get(id);
      return { id, label: nd?.label || id, type: nd?.type || 'unknown', degree: d };
    });

  return {
    nodeCount: n,
    edgeCount: m,
    density: n > 1 ? (2 * m) / (n * (n - 1)) : 0,
    avgDegree: Number(avgDeg.toFixed(2)),
    maxDegree: maxDeg,
    degreeStdDev: Number(Math.sqrt(variance).toFixed(2)),
    connectedComponents: components,
    largestComponentSize: largest,
    diameter,
    avgClusteringCoefficient: Number(avgCC.toFixed(4)),
    typeDistribution: typeDist,
    relationDistribution: relDist,
    topDegreeNodes: topDegree,
  };
}

function computeDiameter(nodes: AnalysisNode[], adj: Map<string, Set<string>>): number {
  if (nodes.length <= 1) return 0;
  const sample = nodes.length > 20
    ? [...nodes].sort(() => Math.random() - 0.5).slice(0, 10)
    : nodes;
  let maxDist = 0;
  for (const start of sample) {
    const dist = new Map<string, number>();
    dist.set(start.id, 0);
    const queue = [start.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = dist.get(cur)!;
      for (const nb of adj.get(cur) ?? []) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
          maxDist = Math.max(maxDist, d + 1);
        }
      }
    }
  }
  return maxDist;
}

function computeAvgClusteringCoefficient(nodes: AnalysisNode[], adj: Map<string, Set<string>>): number {
  if (nodes.length === 0) return 0;
  let totalCC = 0;
  for (const node of nodes) {
    const neighbors = [...(adj.get(node.id) ?? [])];
    const k = neighbors.length;
    if (k < 2) continue;
    let triangles = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        if (adj.get(neighbors[i])?.has(neighbors[j])) triangles++;
      }
    }
    totalCC += (2 * triangles) / (k * (k - 1));
  }
  return totalCC / nodes.length;
}

// ─── 2. Shortest Path (Dijkstra with -log(confidence) weight) ────────

export function findShortestPath(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  sourceId: string,
  targetId: string,
): PathResult {
  if (sourceId === targetId) return { path: [sourceId], totalWeight: 0, edgeIds: [], found: true };

  // Build weighted adjacency: weight = -log(confidence)
  const adj = new Map<string, Array<{ neighbor: string; weight: number; edgeId: string }>>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    const w = -Math.log(Math.max(0.01, e.confidence ?? 0.5));
    const eid = e.id || `${e.source}-${e.target}`;
    adj.get(e.source)?.push({ neighbor: e.target, weight: w, edgeId: eid });
    adj.get(e.target)?.push({ neighbor: e.source, weight: w, edgeId: eid });
  });

  // Dijkstra
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const prevEdge = new Map<string, string>();
  const visited = new Set<string>();
  nodes.forEach(n => dist.set(n.id, Infinity));
  dist.set(sourceId, 0);

  // Simple priority queue (array-based, sufficient for knowledge graph sizes)
  const pq: Array<{ id: string; d: number }> = [{ id: sourceId, d: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { id: cur } = pq.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === targetId) break;

    for (const { neighbor, weight, edgeId } of adj.get(cur) ?? []) {
      if (visited.has(neighbor)) continue;
      const newDist = dist.get(cur)! + weight;
      if (newDist < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newDist);
        prev.set(neighbor, cur);
        prevEdge.set(neighbor, edgeId);
        pq.push({ id: neighbor, d: newDist });
      }
    }
  }

  const totalWeight = dist.get(targetId) ?? Infinity;
  if (totalWeight === Infinity) return { path: [], totalWeight: Infinity, edgeIds: [], found: false };

  // Reconstruct path
  const path: string[] = [];
  const edgeIds: string[] = [];
  let cur: string | undefined = targetId;
  while (cur !== undefined) {
    path.unshift(cur);
    if (prevEdge.has(cur)) edgeIds.unshift(prevEdge.get(cur)!);
    cur = prev.get(cur);
  }
  return { path, totalWeight: Number(totalWeight.toFixed(4)), edgeIds, found: true };
}

// ─── 3. PageRank ─────────────────────────────────────────────────────

export function computePageRank(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  iterations = 20,
  damping = 0.85,
): CentralityResult[] {
  const n = nodes.length;
  if (n === 0) return [];

  // Build outgoing adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  nodes.forEach(nd => { outgoing.set(nd.id, []); incoming.set(nd.id, []); });
  edges.forEach(e => {
    outgoing.get(e.source)?.push(e.target);
    incoming.get(e.target)?.push(e.source);
  });

  let ranks = new Map<string, number>();
  nodes.forEach(nd => ranks.set(nd.id, 1 / n));

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<string, number>();
    nodes.forEach(nd => newRanks.set(nd.id, (1 - damping) / n));

    for (const node of nodes) {
      const out = outgoing.get(node.id) ?? [];
      const share = (ranks.get(node.id) ?? 0) / Math.max(1, out.length);
      for (const target of out) {
        newRanks.set(target, (newRanks.get(target) ?? 0) + damping * share);
      }
    }

    // Handle dangling nodes (no outgoing edges)
    let danglingSum = 0;
    for (const node of nodes) {
      if ((outgoing.get(node.id) ?? []).length === 0) {
        danglingSum += ranks.get(node.id) ?? 0;
      }
    }
    const danglingShare = damping * danglingSum / n;
    nodes.forEach(nd => newRanks.set(nd.id, (newRanks.get(nd.id) ?? 0) + danglingShare));

    ranks = newRanks;
  }

  const nodeMap = nodeLabelMap(nodes);
  const results = [...ranks.entries()]
    .map(([id, score]) => {
      const nd = nodeMap.get(id);
      return { nodeId: id, label: nd?.label || id, type: nd?.type || 'unknown', score: Number(score.toFixed(6)), rank: 0 };
    })
    .sort((a, b) => b.score - a.score);

  results.forEach((r, i) => r.rank = i + 1);
  return results;
}

// ─── 4. Community Detection (Label Propagation) ──────────────────────

export function detectCommunities(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  maxIterations = 20,
): Community[] {
  const adj = buildAdjacency(nodes, edges);
  const nodeMap = nodeLabelMap(nodes);

  // Initialize: each node gets its own label
  const labels = new Map<string, string>();
  nodes.forEach(n => labels.set(n.id, n.id));

  // Iterate label propagation
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    // Process nodes in random order to avoid bias
    const order = [...nodes].sort(() => Math.random() - 0.5);
    for (const node of order) {
      const neighbors = [...(adj.get(node.id) ?? [])];
      if (neighbors.length === 0) continue;

      // Count labels among neighbors
      const labelCounts = new Map<string, number>();
      neighbors.forEach(nb => {
        const l = labels.get(nb) ?? nb;
        labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1);
      });

      // Pick the most common label (break ties by choosing the smaller label for determinism)
      let bestLabel = labels.get(node.id)!;
      let bestCount = 0;
      [...labelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([l, c]) => {
        if (c > bestCount) { bestCount = c; bestLabel = l; }
      });

      if (bestLabel !== labels.get(node.id)) {
        labels.set(node.id, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group by label
  const groups = new Map<string, string[]>();
  labels.forEach((label, nodeId) => {
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(nodeId);
  });

  // Build communities (filter singletons into "uncategorized")
  const communities: Community[] = [];
  let uncategorized: string[] = [];
  let idx = 0;
  groups.forEach((nodeIds, label) => {
    if (nodeIds.length < 2) {
      uncategorized.push(...nodeIds);
      return;
    }
    const types: Record<string, number> = {};
    nodeIds.forEach(nid => {
      const t = nodeMap.get(nid)?.type || 'unknown';
      types[t] = (types[t] || 0) + 1;
    });
    const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const avgConf = edges
      .filter(e => nodeIds.includes(e.source) && nodeIds.includes(e.target))
      .reduce((s, e) => s + (e.confidence ?? 0.5), 0) / Math.max(1, nodeIds.length);

    communities.push({
      id: `community-${idx++}`,
      label: nodeMap.get(label)?.label || `Cluster ${idx}`,
      nodeIds,
      size: nodeIds.length,
      avgConfidence: Number(avgConf.toFixed(3)),
      dominantType,
    });
  });

  // Add uncategorized as one group if significant
  if (uncategorized.length > 0) {
    communities.push({
      id: 'community-uncategorized',
      label: 'Other',
      nodeIds: uncategorized,
      size: uncategorized.length,
      avgConfidence: 0,
      dominantType: 'unknown',
    });
  }

  return communities.sort((a, b) => b.size - a.size);
}

// ─── 5. Link Prediction (Jaccard + Adamic-Adar) ──────────────────────

export function predictLinks(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  topK = 15,
): LinkPrediction[] {
  const adj = buildAdjacency(nodes, edges);
  const existing = new Set(edges.map(e => `${e.source}-${e.target}`));
  const nodeMap = nodeLabelMap(nodes);

  // Only consider non-adjacent pairs with at least 1 common neighbor
  const candidates: Array<{
    source: string;
    target: string;
    common: number;
    jaccard: number;
    adamicAdar: number;
  }> = [];

  const nodeList = nodes.filter(n => (adj.get(n.id)?.size ?? 0) > 0);

  for (let i = 0; i < nodeList.length; i++) {
    const a = nodeList[i].id;
    const neighborsA = adj.get(a) ?? new Set();
    if (neighborsA.size === 0) continue;

    for (let j = i + 1; j < nodeList.length; j++) {
      const b = nodeList[j].id;
      if (existing.has(`${a}-${b}`) || existing.has(`${b}-${a}`)) continue;
      const neighborsB = adj.get(b) ?? new Set();

      let commonCount = 0;
      let adamicAdar = 0;
      for (const n of neighborsA) {
        if (neighborsB.has(n)) {
          commonCount++;
          const deg = adj.get(n)?.size ?? 0;
          if (deg > 1) adamicAdar += 1 / Math.log(deg);
        }
      }
      if (commonCount === 0) continue;

      const union = neighborsA.size + neighborsB.size - commonCount;
      const jaccard = commonCount / Math.max(1, union);

      candidates.push({ source: a, target: b, common: commonCount, jaccard, adamicAdar });
    }
  }

  // Score = average of Jaccard and Adamic-Adar (normalized)
  const maxAA = Math.max(0.001, ...candidates.map(c => c.adamicAdar));
  return candidates
    .map(c => ({
      sourceId: c.source,
      sourceLabel: nodeMap.get(c.source)?.label || c.source,
      targetId: c.target,
      targetLabel: nodeMap.get(c.target)?.label || c.target,
      score: Number(((c.jaccard + c.adamicAdar / maxAA) / 2).toFixed(4)),
      method: c.jaccard > c.adamicAdar / maxAA ? 'Jaccard' : 'Adamic-Adar',
      commonNeighbors: c.common,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── 6. Anomaly Detection ────────────────────────────────────────────

export function detectAnomalies(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): GraphAnomaly[] {
  const adj = buildAdjacency(nodes, edges);
  const deg = degreeMap(nodes, edges);
  const nodeMap = nodeLabelMap(nodes);
  const anomalies: GraphAnomaly[] = [];

  // Compute degree statistics
  const degValues = [...deg.values()];
  const avgDeg = degValues.reduce((a, b) => a + b, 0) / Math.max(1, degValues.length);
  const stdDeg = Math.sqrt(degValues.reduce((s, d) => s + (d - avgDeg) ** 2, 0) / Math.max(1, degValues.length));

  // Compute confidence statistics per node (avg confidence of connected edges)
  const nodeConf = new Map<string, number[]>();
  nodes.forEach(n => nodeConf.set(n.id, []));
  edges.forEach(e => {
    const c = e.confidence ?? 0.5;
    nodeConf.get(e.source)?.push(c);
    nodeConf.get(e.target)?.push(c);
  });

  for (const node of nodes) {
    const d = deg.get(node.id) ?? 0;
    const label = nodeMap.get(node.id)?.label || node.id;
    const type = node.type || 'unknown';

    // 1. Degree outlier (z-score > 2)
    if (stdDeg > 0 && (d - avgDeg) / stdDeg > 2) {
      anomalies.push({
        nodeId: node.id, label, type,
        anomalyType: 'degree_outlier',
        description: `异常高度连接: ${d} 条连接 (平均 ${avgDeg.toFixed(1)})`,
        severity: Number(Math.min(1, (d - avgDeg) / (stdDeg * 3)).toFixed(2)),
      });
    }

    // 2. Isolated high-confidence node
    if (d <= 1) {
      const confs = nodeConf.get(node.id) ?? [];
      const avgC = confs.length > 0 ? confs.reduce((a, b) => a + b) / confs.length : 0;
      if (avgC > 0.8) {
        anomalies.push({
          nodeId: node.id, label, type,
          anomalyType: 'isolated_high',
          description: `高置信度(${Math.round(avgC * 100)}%)但几乎孤立(${d}连接)`,
          severity: Number(avgC.toFixed(2)),
        });
      }
    }

    // 3. Bridge critical node (connects otherwise disconnected groups)
    const neighbors = [...(adj.get(node.id) ?? [])];
    if (neighbors.length >= 2) {
      let disconnectedPairs = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (!(adj.get(neighbors[i])?.has(neighbors[j]))) disconnectedPairs++;
        }
      }
      const totalPairs = neighbors.length * (neighbors.length - 1) / 2;
      if (totalPairs > 0 && disconnectedPairs / totalPairs > 0.7) {
        anomalies.push({
          nodeId: node.id, label, type,
          anomalyType: 'bridge_critical',
          description: `关键桥接节点: ${Math.round(disconnectedPairs / totalPairs * 100)}% 邻居互不连接`,
          severity: Number((disconnectedPairs / totalPairs).toFixed(2)),
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.severity - a.severity);
}

// ─── 7. Subgraph Extraction ──────────────────────────────────────────

export function extractSubgraph(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  filter: SubgraphFilter,
): { nodes: AnalysisNode[]; edges: AnalysisEdge[] } {
  let filteredNodes = nodes;

  if (filter.nodeIds) {
    const idSet = new Set(filter.nodeIds);
    filteredNodes = filteredNodes.filter(n => idSet.has(n.id));
  }
  if (filter.nodeTypes && filter.nodeTypes.length > 0) {
    const typeSet = new Set(filter.nodeTypes);
    filteredNodes = filteredNodes.filter(n => typeSet.has(n.type || 'unknown'));
  }

  const nodeIdSet = new Set(filteredNodes.map(n => n.id));

  let filteredEdges = edges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

  if (filter.edgeTypes && filter.edgeTypes.length > 0) {
    const typeSet = new Set(filter.edgeTypes);
    filteredEdges = filteredEdges.filter(e => typeSet.has(e.type || 'unknown'));
  }
  if (filter.minConfidence !== undefined) {
    filteredEdges = filteredEdges.filter(e => (e.confidence ?? 0.5) >= filter.minConfidence!);
  }
  if (filter.maxConfidence !== undefined) {
    filteredEdges = filteredEdges.filter(e => (e.confidence ?? 0.5) <= filter.maxConfidence!);
  }

  // Re-filter nodes to only include those with edges
  const connectedNodeIds = new Set<string>();
  filteredEdges.forEach(e => { connectedNodeIds.add(e.source); connectedNodeIds.add(e.target); });
  // Keep topic nodes even if they have no edges
  filteredNodes = filteredNodes.filter(n => connectedNodeIds.has(n.id) || n.type === 'topic');

  if (filter.maxNodes && filteredNodes.length > filter.maxNodes) {
    const deg = degreeMap(filteredNodes, filteredEdges);
    filteredNodes = [...filteredNodes]
      .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
      .slice(0, filter.maxNodes);
    const finalIds = new Set(filteredNodes.map(n => n.id));
    filteredEdges = filteredEdges.filter(e => finalIds.has(e.source) && finalIds.has(e.target));
  }

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ─── 8. Cross-Topic Entity Resolution ────────────────────────────────

export function findCrossTopicEntities(
  topicsData: Array<{
    topicId: string;
    topicName: string;
    nodes: AnalysisNode[];
    edges: AnalysisEdge[];
  }>,
): GlobalEntity[] {
  // Group entities by normalized label
  const entityMap = new Map<string, GlobalEntity>();
  for (const { topicId, topicName, nodes } of topicsData) {
    for (const node of nodes) {
      if (node.type === 'topic') continue;
      const key = (node.label || node.id).toLowerCase().trim();
      if (!entityMap.has(key)) {
        entityMap.set(key, {
          id: node.id,
          label: node.label || node.id,
          type: node.type || 'unknown',
          topicIds: [],
          topicNames: [],
          crossTopicEdges: 0,
        });
      }
      const entry = entityMap.get(key)!;
      if (!entry.topicIds.includes(topicId)) {
        entry.topicIds.push(topicId);
        entry.topicNames.push(topicName);
      }
    }
  }

  // Count cross-topic edges (shared neighbors across topics)
  for (const entity of entityMap.values()) {
    entity.crossTopicEdges = entity.topicIds.length > 1 ? entity.topicIds.length - 1 : 0;
  }

  return [...entityMap.values()]
    .filter(e => e.topicIds.length > 1)
    .sort((a, b) => b.topicIds.length - a.topicIds.length);
}

// ─── 9. Graph Diff ───────────────────────────────────────────────────

export function computeGraphDiff(
  oldNodes: AnalysisNode[],
  oldEdges: AnalysisEdge[],
  newNodes: AnalysisNode[],
  newEdges: AnalysisEdge[],
): GraphDiff {
  const oldNodeIds = new Set(oldNodes.map(n => n.id));
  const newNodeIds = new Set(newNodes.map(n => n.id));
  const oldEdgeKeys = new Set(oldEdges.map(e => e.id || `${e.source}-${e.target}`));
  const newEdgeKeys = new Map<string, AnalysisEdge>();
  newEdges.forEach(e => newEdgeKeys.set(e.id || `${e.source}-${e.target}`, e));

  const addedNodes = [...newNodeIds].filter(id => !oldNodeIds.has(id));
  const removedNodes = [...oldNodeIds].filter(id => !newNodeIds.has(id));
  const addedEdges = [...newEdgeKeys.keys()].filter(k => !oldEdgeKeys.has(k));
  const removedEdges = [...oldEdgeKeys.keys()].filter(k => !oldEdgeKeys.has(k) === false).filter(k => !new Set(newEdges.map(e => e.id || `${e.source}-${e.target}`)).has(k));

  // Actually fix removedEdges
  const newEdgeIdSet = new Set(newEdges.map(e => e.id || `${e.source}-${e.target}`));
  const actuallyRemoved = [...oldEdgeKeys].filter(k => !newEdgeIdSet.has(k));

  // Confidence changes
  const oldEdgeMap = new Map<string, AnalysisEdge>();
  oldEdges.forEach(e => oldEdgeMap.set(e.id || `${e.source}-${e.target}`, e));
  const confidenceChanges: GraphDiff['confidenceChanges'] = [];
  newEdgeKeys.forEach((newE, key) => {
    const oldE = oldEdgeMap.get(key);
    if (oldE && Math.abs((oldE.confidence ?? 0.5) - (newE.confidence ?? 0.5)) > 0.1) {
      confidenceChanges.push({
        edgeId: key,
        oldConf: oldE.confidence ?? 0.5,
        newConf: newE.confidence ?? 0.5,
      });
    }
  });

  const parts: string[] = [];
  if (addedNodes.length) parts.push(`+${addedNodes.length} nodes`);
  if (removedNodes.length) parts.push(`-${removedNodes.length} nodes`);
  if (addedEdges.length) parts.push(`+${addedEdges.length} edges`);
  if (actuallyRemoved.length) parts.push(`-${actuallyRemoved.length} edges`);
  if (confidenceChanges.length) parts.push(`${confidenceChanges.length} confidence changes`);

  return {
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges: actuallyRemoved,
    confidenceChanges,
    summary: parts.length > 0 ? parts.join(', ') : 'No changes detected',
  };
}
