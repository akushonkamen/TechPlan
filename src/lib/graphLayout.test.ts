import { describe, expect, it } from 'vitest';
import { applyGraphLayout, rankNodesByImportance } from './graphLayout';
import type { GraphEdge, GraphNode } from '../types/graph';

function node(id: string, label: string, type: GraphNode['data']['type'], metadata: Record<string, any> = {}): GraphNode {
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { label, fullLabel: label, canonicalName: label, type, metadata },
  };
}

function edge(id: string, source: string, target: string, confidence = 0.8): GraphEdge {
  return {
    id,
    source,
    target,
    data: { type: 'related_to', relationType: 'USES', confidence },
  };
}

describe('graphLayout', () => {
  const nodes = [
    node('topic', 'Agent Context', 'topic'),
    node('rope', 'RoPE', 'technology', { docCount: 3, confidence: 0.9 }),
    node('kv', 'KV Cache', 'technology', { docCount: 2, confidence: 0.9 }),
    node('jamba', 'Jamba 1.5', 'product', { docCount: 1, confidence: 0.8 }),
    node('ai21', 'AI21 Labs', 'organization', { docCount: 1, confidence: 0.8 }),
    node('event', 'Launch', 'event', { confidence: 0.7 }),
  ];
  const edges = [
    edge('e1', 'topic', 'rope'),
    edge('e2', 'topic', 'kv'),
    edge('e3', 'jamba', 'rope'),
    edge('e4', 'ai21', 'jamba'),
  ];

  it('produces stable radar positions for the same graph', () => {
    const first = applyGraphLayout(nodes, edges, 'radar').nodes.map(item => [item.id, item.position]);
    const second = applyGraphLayout(nodes, edges, 'radar').nodes.map(item => [item.id, item.position]);

    expect(second).toEqual(first);
  });

  it('keeps a node in the same radar position after filtering unrelated nodes', () => {
    const full = applyGraphLayout(nodes, edges, 'radar').nodes.find(item => item.id === 'rope')?.position;
    const filtered = applyGraphLayout(nodes.filter(item => item.id !== 'kv'), edges, 'radar')
      .nodes.find(item => item.id === 'rope')?.position;

    expect(filtered).toEqual(full);
  });

  it('ranks connected and well-supported nodes ahead of isolated nodes', () => {
    const isolated = node('isolated', 'Isolated', 'technology', { docCount: 0, confidence: 0.2 });
    const ranked = rankNodesByImportance([...nodes, isolated], edges).map(item => item.node.id);

    expect(ranked.indexOf('rope')).toBeLessThan(ranked.indexOf('isolated'));
  });

  it('produces stable terrain positions from sensemaking clusters', () => {
    const terrainNodes = nodes.map(item => {
      const clusterId = item.id === 'kv' ? 'kv-cache-compression'
        : item.id === 'rope' ? 'position-attention'
          : item.id === 'ai21' ? 'organizations-investment'
            : item.id === 'jamba' ? 'products-models'
              : undefined;
      return {
        ...item,
        data: {
          ...item.data,
          clusterId,
          clusterRole: item.id === 'kv' || item.id === 'rope' ? 'anchor' as const : 'member' as const,
        },
      };
    });
    const clusters = [
      { id: 'kv-cache-compression', label: 'KV Cache / 压缩', summary: '', priority: 10, nodeIds: ['kv'], relationFocus: ['COMPRESSES' as const] },
      { id: 'position-attention', label: '位置编码 / 注意力', summary: '', priority: 8, nodeIds: ['rope'], relationFocus: ['USES' as const] },
      { id: 'products-models', label: '产品与模型', summary: '', priority: 6, nodeIds: ['jamba'], relationFocus: ['DEVELOPS' as const] },
      { id: 'organizations-investment', label: '组织与投资', summary: '', priority: 5, nodeIds: ['ai21'], relationFocus: ['INVESTS_IN' as const] },
    ];

    const first = applyGraphLayout(terrainNodes, edges, 'terrain', { terrainClusters: clusters }).nodes.map(item => [item.id, item.position]);
    const second = applyGraphLayout(terrainNodes, edges, 'terrain', { terrainClusters: clusters }).nodes.map(item => [item.id, item.position]);

    expect(second).toEqual(first);
    expect(first.find(([id]) => id === 'event')?.[1]).toEqual({ x: 0, y: 520 });
  });
});
