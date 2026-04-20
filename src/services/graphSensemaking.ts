import { spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  normalizeGraphNodeType,
  normalizeGraphRelationType,
  type GraphClusterRole,
  type GraphReadingPathStep,
  type GraphRelationType,
  type GraphSensemakingAssignment,
  type GraphSensemakingCluster,
  type GraphSensemakingResult,
} from '../types/graph.js';

export interface SensemakingNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
}

export interface SensemakingLink {
  id: string;
  source: string;
  target: string;
  label: string;
  properties?: Record<string, any>;
}

interface GraphPayload {
  nodes: SensemakingNode[];
  links: SensemakingLink[];
}

interface CacheRow {
  graph_hash: string;
  result_json: string | null;
  status: string;
  error: string | null;
}

const VALID_ROLES = new Set<GraphClusterRole>(['anchor', 'member', 'bridge', 'supporting']);

const FALLBACK_CLUSTERS = [
  {
    id: 'kv-cache-compression',
    label: 'KV Cache / 压缩',
    summary: '围绕 KV cache、上下文压缩和推理内存优化的技术路线。',
    keywords: ['kv', 'cache', 'compression', 'compress', 'press', 'memory', 'dram', 'ssd'],
    relations: ['COMPRESSES', 'USES'],
  },
  {
    id: 'position-attention',
    label: '位置编码 / 注意力',
    summary: '处理长上下文位置表达、滑动窗口注意力和 attention 变体的机制。',
    keywords: ['rope', 'alibi', 'nope', 'position', 'embedding', 'attention', 'sliding', 'swa'],
    relations: ['USES', 'EXTENDS', 'MODIFIES', 'EVOLVES_FROM'],
  },
  {
    id: 'rag-memory',
    label: 'RAG / 记忆',
    summary: '检索增强、外部记忆和 agent context engineering 相关能力。',
    keywords: ['rag', 'retrieval', 'memory', 'context engineering', 'memento', 'agent'],
    relations: ['USES', 'IMPROVES', 'RELATED_TO'],
  },
  {
    id: 'products-models',
    label: '产品与模型',
    summary: '具体模型、产品、库和工具，是技术落地与比较的对象。',
    keywords: ['jamba', 'gpt', 'manus', 'lara', 'swan', 'product', 'model', 'library'],
    relations: ['DEVELOPS', 'BENCHMARKS', 'USES'],
  },
  {
    id: 'organizations-investment',
    label: '组织与投资',
    summary: '公司、实验室、投资和合作关系。',
    keywords: ['labs', 'nvidia', 'organization', 'company', 'funding', 'invest'],
    relations: ['INVESTS_IN', 'PARTNERS_WITH', 'PUBLISHED_BY'],
  },
  {
    id: 'recent-events',
    label: '近期事件',
    summary: '论文发布、产品发布、融资和行业动态。',
    keywords: ['event', 'launch', 'published', 'presented', 'raises', 'acquiring'],
    relations: ['HAS_EVENT', 'PARTICIPATED_IN'],
  },
] as const;

export function computeGraphHash(topicId: string, nodes: SensemakingNode[], links: SensemakingLink[]): string {
  const stable = {
    topicId,
    nodes: [...nodes]
      .map(node => ({
        id: node.id,
        label: node.label,
        type: normalizeGraphNodeType(node.type),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    links: [...links]
      .map(link => ({
        id: link.id,
        source: link.source,
        target: link.target,
        relation: normalizeGraphRelationType(link.label),
        confidence: Number(link.properties?.confidence ?? 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function validateSensemakingResult(
  topicId: string,
  graphHash: string,
  raw: any,
  graph: GraphPayload,
  source: 'llm' | 'fallback' = 'llm'
): GraphSensemakingResult | null {
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const linkIds = new Set(graph.links.map(link => link.id));
  const clustersInput = Array.isArray(raw?.clusters) ? raw.clusters : [];
  const clusters: GraphSensemakingCluster[] = [];

  for (const item of clustersInput) {
    const id = slugify(String(item?.id || item?.label || 'cluster'));
    const label = String(item?.label || id).slice(0, 40);
    const nodeIdsForCluster = uniqueStrings(item?.nodeIds)
      .filter(nodeId => nodeIds.has(nodeId))
      .slice(0, 24);
    if (!id || !label || nodeIdsForCluster.length === 0) continue;

    clusters.push({
      id,
      label,
      summary: String(item?.summary || '').slice(0, 180),
      priority: clampNumber(item?.priority, 1, 10, 5),
      nodeIds: nodeIdsForCluster,
      relationFocus: uniqueStrings(item?.relationFocus)
        .map(rel => normalizeGraphRelationType(rel))
        .slice(0, 8),
    });
  }

  const clusterById = new Map(clusters.map(cluster => [cluster.id, cluster]));
  if (clusters.length === 0) return null;

  const assignments: GraphSensemakingAssignment[] = [];
  const assignedNodeIds = new Set<string>();
  const assignmentsInput = Array.isArray(raw?.assignments) ? raw.assignments : [];

  for (const item of assignmentsInput) {
    const nodeId = String(item?.nodeId || '');
    const clusterId = slugify(String(item?.clusterId || ''));
    if (!nodeIds.has(nodeId) || !clusterById.has(clusterId)) continue;
    const role = VALID_ROLES.has(item?.role) ? item.role as GraphClusterRole : 'member';
    assignments.push({ nodeId, clusterId, role });
    assignedNodeIds.add(nodeId);
  }

  for (const cluster of clusters) {
    cluster.nodeIds.forEach((nodeId, index) => {
      if (assignedNodeIds.has(nodeId)) return;
      assignments.push({
        nodeId,
        clusterId: cluster.id,
        role: index < 2 ? 'anchor' : 'member',
      });
    });
  }

  const readingPath: GraphReadingPathStep[] = (Array.isArray(raw?.readingPath) ? raw.readingPath : [])
    .map((step: any) => ({
      title: String(step?.title || '').slice(0, 60),
      nodeIds: uniqueStrings(step?.nodeIds).filter(nodeId => nodeIds.has(nodeId)).slice(0, 8),
      relationIds: uniqueStrings(step?.relationIds).filter(relationId => linkIds.has(relationId)).slice(0, 8),
    }))
    .filter(step => step.title && (step.nodeIds.length > 0 || step.relationIds.length > 0))
    .slice(0, 6);

  return {
    topicId,
    graphHash,
    status: 'cache',
    source,
    generatedAt: new Date().toISOString(),
    clusters: clusters.slice(0, 6),
    assignments,
    readingPath: readingPath.length > 0 ? readingPath : buildReadingPath(clusters, graph.links),
  };
}

export function buildFallbackSensemaking(
  topicId: string,
  nodes: SensemakingNode[],
  links: SensemakingLink[],
  graphHash = computeGraphHash(topicId, nodes, links),
  error?: string
): GraphSensemakingResult {
  const graph = { nodes, links };
  const nodeScores = new Map(nodes.map(node => [node.id, getNodeDegree(node.id, links)]));
  const clusterMap = new Map<string, GraphSensemakingCluster>();
  const assignments: GraphSensemakingAssignment[] = [];

  FALLBACK_CLUSTERS.forEach(cluster => {
    clusterMap.set(cluster.id, {
      id: cluster.id,
      label: cluster.label,
      summary: cluster.summary,
      priority: 1,
      nodeIds: [],
      relationFocus: cluster.relations.map(rel => normalizeGraphRelationType(rel)),
    });
  });

  for (const node of nodes) {
    const type = normalizeGraphNodeType(node.type);
    if (type === 'topic' || type === 'claim' || type === 'document') continue;
    const clusterId = chooseFallbackCluster(node, links);
    const cluster = clusterMap.get(clusterId)!;
    cluster.nodeIds.push(node.id);
  }

  const clusters = [...clusterMap.values()]
    .map(cluster => ({
      ...cluster,
      nodeIds: sortNodeIdsByScore(cluster.nodeIds, nodeScores).slice(0, 24),
      priority: cluster.nodeIds.reduce((sum, nodeId) => sum + (nodeScores.get(nodeId) ?? 0), 0) + cluster.nodeIds.length,
    }))
    .filter(cluster => cluster.nodeIds.length > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  const clusterIds = new Set(clusters.map(cluster => cluster.id));
  clusters.forEach(cluster => {
    const bridgeNodeIds = findBridgeNodeIds(cluster.nodeIds, links, clusters);
    cluster.nodeIds.forEach((nodeId, index) => {
      const role: GraphClusterRole = index < 2
        ? 'anchor'
        : bridgeNodeIds.has(nodeId)
          ? 'bridge'
          : index > 8
            ? 'supporting'
            : 'member';
      assignments.push({ nodeId, clusterId: cluster.id, role });
    });
  });

  const result = validateSensemakingResult(topicId, graphHash, {
    clusters,
    assignments: assignments.filter(item => clusterIds.has(item.clusterId)),
    readingPath: buildReadingPath(clusters, links),
  }, graph, 'fallback');

  return {
    ...(result ?? {
      topicId,
      graphHash,
      source: 'fallback' as const,
      generatedAt: new Date().toISOString(),
      clusters: [],
      assignments: [],
      readingPath: [],
    }),
    status: 'fallback',
    error,
  };
}

export class GraphSensemakingService {
  constructor(private db: any) {}

  async get(topicId: string, graph: GraphPayload): Promise<GraphSensemakingResult> {
    const graphHash = computeGraphHash(topicId, graph.nodes, graph.links);
    const row: CacheRow | undefined = await this.db.get(
      `SELECT graph_hash, result_json, status, error
       FROM graph_sensemaking_cache
       WHERE topic_id = ? AND graph_hash = ?
       ORDER BY updated_at DESC LIMIT 1`,
      [topicId, graphHash]
    );

    if (row?.status === 'ready' && row.result_json) {
      const parsed = safeJsonParse(row.result_json);
      const valid = validateSensemakingResult(topicId, graphHash, parsed, graph, parsed?.source === 'fallback' ? 'fallback' : 'llm');
      if (valid) return { ...valid, status: 'cache' };
    }

    const fallback = buildFallbackSensemaking(topicId, graph.nodes, graph.links, graphHash, row?.error || undefined);
    if (row?.status === 'refreshing') return { ...fallback, status: 'refreshing' };
    return fallback;
  }

  async markRefreshing(topicId: string, graph: GraphPayload): Promise<string> {
    const graphHash = computeGraphHash(topicId, graph.nodes, graph.links);
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO graph_sensemaking_cache (topic_id, graph_hash, result_json, status, error, created_at, updated_at)
       VALUES (?, ?, NULL, 'refreshing', NULL, ?, ?)
       ON CONFLICT(topic_id, graph_hash) DO UPDATE SET status = 'refreshing', error = NULL, updated_at = excluded.updated_at`,
      [topicId, graphHash, now, now]
    );
    return graphHash;
  }

  async refresh(topicId: string, graph: GraphPayload): Promise<GraphSensemakingResult> {
    const graphHash = computeGraphHash(topicId, graph.nodes, graph.links);
    try {
      const raw = await generateSensemakingWithClaude(topicId, graph);
      const valid = validateSensemakingResult(topicId, graphHash, raw, graph, 'llm')
        ?? buildFallbackSensemaking(topicId, graph.nodes, graph.links, graphHash, 'LLM output failed validation');
      await this.writeResult(topicId, graphHash, valid, 'ready');
      return { ...valid, status: 'cache' };
    } catch (error: any) {
      const fallback = buildFallbackSensemaking(topicId, graph.nodes, graph.links, graphHash, error?.message || String(error));
      await this.writeResult(topicId, graphHash, fallback, 'failed', fallback.error);
      return fallback;
    }
  }

  private async writeResult(
    topicId: string,
    graphHash: string,
    result: GraphSensemakingResult,
    status: 'ready' | 'failed',
    error?: string
  ) {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO graph_sensemaking_cache (topic_id, graph_hash, result_json, status, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(topic_id, graph_hash) DO UPDATE SET
         result_json = excluded.result_json,
         status = excluded.status,
         error = excluded.error,
         updated_at = excluded.updated_at`,
      [topicId, graphHash, JSON.stringify(result), status, error || null, now, now]
    );
  }
}

async function generateSensemakingWithClaude(topicId: string, graph: GraphPayload): Promise<any> {
  const prompt = buildSensemakingPrompt(topicId, graph);
  const timeoutMs = 120_000;

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ], {
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGTERM');
      reject(new Error('Graph sensemaking LLM timed out'));
    }, timeoutMs);

    proc.stdin?.end();
    proc.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'result' && parsed.result) {
            const result = typeof parsed.result === 'string' ? extractJson(parsed.result) : parsed.result;
            if (result) {
              clearTimeout(timer);
              settled = true;
              resolve(result);
            }
          }
        } catch {}
      }
    });
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
    proc.on('error', error => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(error);
    });
    proc.on('close', code => {
      if (settled) return;
      clearTimeout(timer);
      const result = extractJson(stdout);
      if (result) {
        settled = true;
        resolve(result);
        return;
      }
      settled = true;
      reject(new Error(`Graph sensemaking LLM exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

function buildSensemakingPrompt(topicId: string, graph: GraphPayload): string {
  const payload = {
    topicId,
    nodes: graph.nodes
      .filter(node => !['claim', 'document'].includes(normalizeGraphNodeType(node.type)))
      .slice(0, 120)
      .map(node => ({ id: node.id, label: node.label, type: normalizeGraphNodeType(node.type) })),
    links: graph.links
      .slice(0, 180)
      .map(link => ({
        id: link.id,
        source: link.source,
        target: link.target,
        relation: normalizeGraphRelationType(link.label),
        confidence: Number(link.properties?.confidence ?? 0.5),
      })),
  };

  return `You are organizing a technology intelligence knowledge graph into a human-readable terrain map.

Return ONLY valid JSON with this exact shape:
{
  "clusters": [
    { "id": "short-kebab-id", "label": "short Chinese label", "summary": "one sentence", "priority": 1-10, "nodeIds": ["existing node id"], "relationFocus": ["USES"] }
  ],
  "assignments": [
    { "nodeId": "existing node id", "clusterId": "cluster id", "role": "anchor|member|bridge|supporting" }
  ],
  "readingPath": [
    { "title": "short step title", "nodeIds": ["existing node id"], "relationIds": ["existing relation id"] }
  ]
}

Rules:
- Create at most 6 clusters.
- Use only existing nodeIds and relationIds from the payload.
- Prefer clusters that help a human understand the technical landscape, not database types.
- Keep claim/document nodes out of clusters unless they are necessary evidence.
- Include clusters like KV Cache/compression, position/attention, RAG/memory, products/models, organizations/investment when supported by data.

Graph payload:
${JSON.stringify(payload)}`;
}

function chooseFallbackCluster(node: SensemakingNode, links: SensemakingLink[]): string {
  const type = normalizeGraphNodeType(node.type);
  if (type === 'event') return 'recent-events';
  if (type === 'organization') return 'organizations-investment';
  if (type === 'product') return 'products-models';

  const label = `${node.label} ${JSON.stringify(node.properties || {})}`.toLowerCase();
  const relations = links
    .filter(link => link.source === node.id || link.target === node.id)
    .map(link => normalizeGraphRelationType(link.label));

  const scored = FALLBACK_CLUSTERS.map(cluster => {
    const keywordScore = cluster.keywords.reduce((sum, keyword) => (
      label.includes(keyword.toLowerCase()) ? sum + 2 : sum
    ), 0);
    const relationFocus = new Set<GraphRelationType>(cluster.relations.map(rel => normalizeGraphRelationType(rel)));
    const relationScore = relations.reduce((sum, relation) => (
      relationFocus.has(relation) ? sum + 1 : sum
    ), 0);
    return { id: cluster.id, score: keywordScore + relationScore };
  }).sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0) return scored[0].id;
  return type === 'entity' ? 'rag-memory' : 'position-attention';
}

function findBridgeNodeIds(nodeIds: string[], links: SensemakingLink[], clusters: GraphSensemakingCluster[]): Set<string> {
  const nodeToCluster = new Map<string, string>();
  clusters.forEach(cluster => cluster.nodeIds.forEach(nodeId => nodeToCluster.set(nodeId, cluster.id)));
  const nodeIdSet = new Set(nodeIds);
  const bridgeIds = new Set<string>();

  links.forEach(link => {
    const sourceCluster = nodeToCluster.get(link.source);
    const targetCluster = nodeToCluster.get(link.target);
    if (!sourceCluster || !targetCluster || sourceCluster === targetCluster) return;
    if (nodeIdSet.has(link.source)) bridgeIds.add(link.source);
    if (nodeIdSet.has(link.target)) bridgeIds.add(link.target);
  });

  return bridgeIds;
}

function buildReadingPath(clusters: GraphSensemakingCluster[], links: SensemakingLink[]): GraphReadingPathStep[] {
  return clusters.slice(0, 5).map(cluster => {
    const nodeIdSet = new Set(cluster.nodeIds);
    const relationIds = links
      .filter(link => nodeIdSet.has(link.source) || nodeIdSet.has(link.target))
      .slice(0, 5)
      .map(link => link.id);
    return {
      title: cluster.label,
      nodeIds: cluster.nodeIds.slice(0, 5),
      relationIds,
    };
  });
}

function getNodeDegree(nodeId: string, links: SensemakingLink[]): number {
  return links.reduce((count, link) => (
    link.source === nodeId || link.target === nodeId ? count + 1 : count
  ), 0);
}

function sortNodeIdsByScore(nodeIds: string[], scores: Map<string, number>): string[] {
  return [...nodeIds].sort((a, b) => {
    const diff = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

function uniqueStrings(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function clampNumber(value: any, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function extractJson(text: string): any | null {
  const direct = safeJsonParse(text);
  if (direct) return direct;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return safeJsonParse(match[0]);
}

function safeJsonParse(text: string | null | undefined): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
