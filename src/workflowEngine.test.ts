// Tests for workflowEngine

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine, type WorkflowDefinition } from './workflowEngine.js';
import { SkillExecutor } from './skillExecutor.js';
import { SkillRegistry } from './skillRegistry.js';

// Mock dependencies
const mockDb = { run: vi.fn(), all: vi.fn(), get: vi.fn() };
const mockRegistry = new SkillRegistry();
const mockExecutor = new SkillExecutor(mockRegistry, mockDb);

// Register test skills
(mockRegistry as any).skills.set('research', {
  name: 'research',
  displayName: 'Research',
  description: 'Research skill',
  category: 'test',
  version: '1.0.0',
  params: [],
  steps: [],
  promptTemplate: 'Research',
  timeout: 300,
});

(mockRegistry as any).skills.set('extract', {
  name: 'extract',
  displayName: 'Extract',
  description: 'Extract skill',
  category: 'test',
  version: '1.0.0',
  params: [],
  steps: [],
  promptTemplate: 'Extract',
  timeout: 300,
});

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine(mockExecutor, mockRegistry);
  });

  describe('constructor', () => {
    it('should create engine with dependencies', () => {
      expect(engine).toBeDefined();
    });
  });

  describe('registerWorkflow', () => {
    it('should register a workflow and return UUID', () => {
      const definition: WorkflowDefinition = {
        name: 'test-workflow',
        description: 'A test workflow',
        steps: [
          {
            skillName: 'research',
            params: { topicId: '123' },
          },
        ],
      };
      const workflowId = engine.registerWorkflow(definition);
      expect(workflowId).toBeDefined();
      expect(workflowId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should add workflow to list', () => {
      const definition: WorkflowDefinition = {
        name: 'list-test',
        description: 'Test',
        steps: [
          {
            skillName: 'research',
            params: {},
          },
        ],
      };
      engine.registerWorkflow(definition);
      const list = engine.listWorkflows();
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('getWorkflow', () => {
    it('should return registered workflow by ID', () => {
      const definition: WorkflowDefinition = {
        name: 'get-test',
        description: 'Test',
        steps: [
          {
            skillName: 'research',
            params: {},
          },
        ],
      };
      const workflowId = engine.registerWorkflow(definition);
      const workflow = engine.getWorkflow(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('get-test');
    });

    it('should return undefined for unknown workflow', () => {
      const workflow = engine.getWorkflow('unknown-id');
      expect(workflow).toBeUndefined();
    });
  });

  describe('listWorkflows', () => {
    it('should return empty list initially', () => {
      const list = engine.listWorkflows();
      expect(list).toEqual([]);
    });

    it('should list all registered workflows', () => {
      const definition1: WorkflowDefinition = {
        name: 'workflow1',
        description: 'First',
        steps: [{ skillName: 'research', params: {} }],
      };
      const definition2: WorkflowDefinition = {
        name: 'workflow2',
        description: 'Second',
        steps: [{ skillName: 'extract', params: {} }],
      };
      engine.registerWorkflow(definition1);
      engine.registerWorkflow(definition2);
      const list = engine.listWorkflows();
      expect(list).toHaveLength(2);
    });
  });

  describe('getExecution', () => {
    it('should return undefined for non-existent execution', () => {
      const execution = engine.getExecution('non-existent');
      expect(execution).toBeUndefined();
    });
  });

  describe('getExecutionHistory', () => {
    it('should return empty array initially', () => {
      const history = engine.getExecutionHistory();
      expect(history).toEqual([]);
    });
  });

  describe('cancelExecution', () => {
    it('should return false for non-existent execution', () => {
      const result = engine.cancelExecution('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('executeWorkflow', () => {
    it('should throw error for unknown workflow ID', async () => {
      await expect(engine.executeWorkflow('unknown-id')).rejects.toThrow();
    });

    it('should execute registered workflow', async () => {
      const definition: WorkflowDefinition = {
        name: 'execute-test',
        description: 'Test execution',
        steps: [
          {
            skillName: 'research',
            params: { topicId: '123' },
            stopOnError: false,
          },
        ],
      };
      const workflowId = engine.registerWorkflow(definition);

      // Mock the executor to avoid actual CLI spawn
      vi.spyOn(mockExecutor, 'startExecution').mockReturnValue({
        executionId: 'mock-exec-id',
        promise: Promise.resolve({
          id: 'mock-exec-id',
          skillName: 'research',
          params: {},
          status: 'completed',
          result: { data: 'test' },
          stdout: '',
          startedAt: new Date().toISOString(),
        }),
      });

      const execution = await engine.executeWorkflow(workflowId, { topicId: '123' });
      expect(execution).toBeDefined();
      expect(execution.status).toBe('completed');
    });
  });
});
