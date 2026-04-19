import { describe, expect, it } from 'vitest';
import {
  buildFallbackSensemaking,
  computeGraphHash,
  validateSensemakingResult,
  type SensemakingLink,
  type SensemakingNode,
} from './graphSensemaking';

const nodes: SensemakingNode[] = [
  { id: 'topic', label: 'Agent上下文管理', type: 'topic' },
  { id: 'kv', label: 'KV Cache', type: 'Technology' },
  { id: 'rope', label: 'RoPE', type: 'Technology' },
  { id: 'rag', label: 'RAG', type: 'Technology' },
  { id: 'jamba', label: 'Jamba 1.5', type: 'Product' },
  { id: 'ai21', label: 'AI21 Labs', type: 'Organization' },
];

const links: SensemakingLink[] = [
  { id: 'l1', source: 'jamba', target: 'rope', label: 'USES', properties: { confidence: 0.95 } },
  { id: 'l2', source: 'ai21', target: 'jamba', label: 'DEVELOPS', properties: { confidence: 0.9 } },
  { id: 'l3', source: 'jamba', target: 'kv', label: 'COMPRESSES', properties: { confidence: 0.9 } },
  { id: 'l4', source: 'rag', target: 'kv', label: 'USES', properties: { confidence: 0.8 } },
];

describe('graphSensemaking', () => {
  it('computes stable graph hashes and changes when graph content changes', () => {
    const first = computeGraphHash('topic-1', nodes, links);
    const reordered = computeGraphHash('topic-1', [...nodes].reverse(), [...links].reverse());
    const changed = computeGraphHash('topic-1', nodes, [...links, { id: 'l5', source: 'rope', target: 'kv', label: 'RELATED_TO' }]);

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('drops hallucinated ids and rejects empty clusters during validation', () => {
    const graphHash = computeGraphHash('topic-1', nodes, links);
    const result = validateSensemakingResult('topic-1', graphHash, {
      clusters: [
        { id: 'kv', label: 'KV Cache / 压缩', summary: 'cache work', priority: 9, nodeIds: ['kv', 'missing'], relationFocus: ['COMPRESSES'] },
        { id: 'ghost', label: 'Ghost', summary: 'bad', priority: 1, nodeIds: ['missing'], relationFocus: [] },
      ],
      assignments: [
        { nodeId: 'kv', clusterId: 'kv', role: 'anchor' },
        { nodeId: 'missing', clusterId: 'kv', role: 'anchor' },
      ],
      readingPath: [
        { title: 'Read KV', nodeIds: ['kv', 'missing'], relationIds: ['l3', 'bad-link'] },
      ],
    }, { nodes, links });

    expect(result?.clusters).toHaveLength(1);
    expect(result?.clusters[0].nodeIds).toEqual(['kv']);
    expect(result?.assignments).toEqual([{ nodeId: 'kv', clusterId: 'kv', role: 'anchor' }]);
    expect(result?.readingPath[0].relationIds).toEqual(['l3']);
  });

  it('fallback assigns representative nodes into expected terrain clusters', () => {
    const fallback = buildFallbackSensemaking('topic-1', nodes, links);
    const assignmentByNode = new Map(fallback.assignments.map(item => [item.nodeId, item.clusterId]));

    expect(assignmentByNode.get('kv')).toBe('kv-cache-compression');
    expect(assignmentByNode.get('rope')).toBe('position-attention');
    expect(assignmentByNode.get('rag')).toBe('rag-memory');
    expect(assignmentByNode.get('jamba')).toBe('products-models');
    expect(assignmentByNode.get('ai21')).toBe('organizations-investment');
  });
});
