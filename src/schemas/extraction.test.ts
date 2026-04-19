import { describe, expect, it } from 'vitest';
import { validateExtractionOutput } from './extraction.js';

describe('validateExtractionOutput', () => {
  it('accepts valid extraction payload', () => {
    const result = validateExtractionOutput({
      topicId: 'topic_1',
      documentsProcessed: 2,
      extractionStats: { entities: 1, relations: 1, claims: 1, events: 1 },
      entities: [{ text: 'OpenAI', type: 'Organization', confidence: 0.95 }],
      relations: [{ source_text: 'OpenAI', target_text: 'GPT-5', relation: 'develops', confidence: 0.92 }],
      claims: [{ text: '模型性能提升', polarity: 'positive', confidence: 0.8 }],
      events: [{ type: 'product_launch', title: '发布新模型', confidence: 0.88 }],
    });

    expect(result.valid).toBe(true);
    expect(result.data?.topicId).toBe('topic_1');
    expect(result.warnings).toEqual([]);
  });

  it('rejects invalid confidence and enum values', () => {
    const result = validateExtractionOutput({
      topicId: 'topic_1',
      documentsProcessed: 1,
      entities: [{ text: 'OpenAI', type: 'Company', confidence: 1.2 }],
    });

    expect(result.valid).toBe(false);
    expect(result.warnings.some(w => w.includes('entities.0.type'))).toBe(true);
    expect(result.warnings.some(w => w.includes('entities.0.confidence'))).toBe(true);
  });
});
