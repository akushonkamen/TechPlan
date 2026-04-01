// Tests for skillExecutor

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillExecutor } from './skillExecutor.js';
import { SkillRegistry } from './skillRegistry.js';

// Mock database
const mockDb = {
  run: vi.fn().mockResolvedValue(undefined),
  all: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(undefined),
};

describe('SkillExecutor', () => {
  let executor: SkillExecutor;
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    executor = new SkillExecutor(registry, mockDb);

    // Register a test skill
    (registry as any).skills.set('test-skill', {
      name: 'test-skill',
      displayName: 'Test Skill',
      description: 'A test skill',
      category: 'test',
      version: '1.0.0',
      params: [
        { name: 'input', type: 'string', required: true, description: 'Input value' },
      ],
      steps: ['step1', 'step2'],
      promptTemplate: 'Process: {{input}}',
      timeout: 300,
    });
  });

  describe('getProgress', () => {
    it('should return empty array for non-existent execution', () => {
      const progress = executor.getProgress('non-existent-id');
      expect(progress).toEqual([]);
    });
  });

  describe('startExecution', () => {
    it('should create a new execution with unique ID', () => {
      const { executionId: id1 } = executor.startExecution('test-skill', { input: 'test1' });
      const { executionId: id2 } = executor.startExecution('test-skill', { input: 'test2' });
      expect(id1).not.toBe(id2);
    });

    it('should return executionId and promise', () => {
      const result = executor.startExecution('test-skill', { input: 'test' });
      expect(result.executionId).toBeDefined();
      expect(result.promise).toBeInstanceOf(Promise);
    });
  });

  describe('cancel', () => {
    it('should return false for non-existent execution', () => {
      const result = executor.cancel('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should call database with correct query', async () => {
      mockDb.all.mockResolvedValue([]);
      await executor.getHistory({ skillName: 'test-skill', limit: 10 });
      expect(mockDb.all).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should call database with correct query', async () => {
      mockDb.all.mockResolvedValue([]);
      await executor.getStats('test-skill');
      expect(mockDb.all).toHaveBeenCalled();
    });
  });

  describe('cleanupStale', () => {
    it('should call database to update stale executions', async () => {
      mockDb.run.mockResolvedValue(undefined);
      await executor.cleanupStale();
      expect(mockDb.run).toHaveBeenCalled();
    });
  });
});
