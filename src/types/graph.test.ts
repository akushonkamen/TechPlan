import { describe, expect, it } from 'vitest';
import { getEdgeVisualType, normalizeGraphNodeType, normalizeGraphRelationType } from './graph';

describe('graph type helpers', () => {
  it('normalizes graph node type aliases used by extracted entities', () => {
    expect(normalizeGraphNodeType('Technology')).toBe('technology');
    expect(normalizeGraphNodeType('Product')).toBe('product');
    expect(normalizeGraphNodeType('Organization')).toBe('organization');
    expect(normalizeGraphNodeType('Person')).toBe('entity');
  });

  it('keeps domain-specific relation types instead of collapsing them to RELATED_TO', () => {
    expect(normalizeGraphRelationType('compresses')).toBe('COMPRESSES');
    expect(normalizeGraphRelationType('extends')).toBe('EXTENDS');
    expect(normalizeGraphRelationType('improves')).toBe('IMPROVES');
    expect(normalizeGraphRelationType('evolves_from')).toBe('EVOLVES_FROM');
    expect(normalizeGraphRelationType('benchmarks')).toBe('BENCHMARKS');
  });

  it('maps structural and stance relations to visual edge buckets', () => {
    expect(getEdgeVisualType('HAS_ENTITY')).toBe('has_entity');
    expect(getEdgeVisualType('supports')).toBe('supports');
    expect(getEdgeVisualType('contradicts')).toBe('contradicts');
    expect(getEdgeVisualType('compresses')).toBe('related_to');
  });
});
