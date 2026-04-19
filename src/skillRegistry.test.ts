// Tests for skillRegistry

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from './skillRegistry.js';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('loadAll', () => {
    it('should load skills from a directory', () => {
      // Mock filesystem behavior would go here
      // For now, test the basic registry functionality
      expect(registry.list()).toEqual([]);
    });
  });

  describe('validateParams', () => {
    beforeEach(() => {
      // Manually register a test skill
      (registry as any).skills.set('test-skill', {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        category: 'test',
        version: '1.0.0',
        params: [
          { name: 'requiredString', type: 'string', required: true, description: 'A required string' },
          { name: 'optionalNumber', type: 'number', required: false, description: 'An optional number', default: 42 },
          { name: 'optionalBoolean', type: 'boolean', required: false, description: 'An optional boolean' },
        ],
        steps: [],
        promptTemplate: 'Test prompt with {{requiredString}} and {{optionalNumber}}',
        timeout: 300,
      });
    });

    it('should pass validation with correct params', () => {
      const result = registry.validateParams('test-skill', {
        requiredString: 'test',
        optionalNumber: 123,
        optionalBoolean: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail validation with missing required param', () => {
      const result = registry.validateParams('test-skill', {
        optionalNumber: 123,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: requiredString');
    });

    it('should fail validation with wrong type', () => {
      const result = registry.validateParams('test-skill', {
        requiredString: 'test',
        optionalNumber: 'not-a-number',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Parameter optionalNumber must be a number, got string');
    });

    it('should pass validation with missing optional params', () => {
      const result = registry.validateParams('test-skill', {
        requiredString: 'test',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('getParams', () => {
    it('should return parameter definitions', () => {
      (registry as any).skills.set('param-skill', {
        name: 'param-skill',
        displayName: 'Param Skill',
        description: 'A skill with params',
        category: 'test',
        version: '1.0.0',
        params: [
          { name: 'param1', type: 'string', required: true, description: 'First param' },
        ],
        steps: [],
        promptTemplate: 'Test',
        timeout: 300,
      });

      const params = registry.getParams('param-skill');
      expect(params).toHaveLength(1);
      expect(params[0].name).toBe('param1');
    });

    it('should return empty array for skill without params', () => {
      (registry as any).skills.set('no-param-skill', {
        name: 'no-param-skill',
        displayName: 'No Param Skill',
        description: 'A skill without params',
        category: 'test',
        version: '1.0.0',
        params: [],
        steps: [],
        promptTemplate: 'Test',
        timeout: 300,
      });

      const params = registry.getParams('no-param-skill');
      expect(params).toEqual([]);
    });
  });

  describe('render', () => {
    beforeEach(() => {
      (registry as any).skills.set('render-skill', {
        name: 'render-skill',
        displayName: 'Render Skill',
        description: 'A skill for testing render',
        category: 'test',
        version: '1.0.0',
        params: [],
        steps: [],
        promptTemplate: 'Hello {{name}}, value is {{value}}',
        timeout: 300,
      });
    });

    it('should replace placeholders with values', () => {
      const rendered = registry.render('render-skill', {
        name: 'World',
        value: 42,
      });
      expect(rendered).toBe('Hello World, value is 42');
    });

    it('should handle object values', () => {
      const rendered = registry.render('render-skill', {
        name: 'Test',
        value: { nested: 'data' },
      });
      expect(rendered).toBe('Hello Test, value is {"nested":"data"}');
    });

    it('should handle null values gracefully', () => {
      const rendered = registry.render('render-skill', {
        name: 'Null',
        value: null,
      });
      expect(rendered).toBe('Hello Null, value is null');
    });
  });

  describe('get and getDetail', () => {
    beforeEach(() => {
      (registry as any).skills.set('get-test', {
        name: 'get-test',
        displayName: 'Get Test',
        description: 'Test get method',
        category: 'test',
        version: '1.0.0',
        params: [],
        steps: [],
        promptTemplate: 'Test',
        timeout: 300,
      });
    });

    it('should return skill config', () => {
      const skill = registry.get('get-test');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('get-test');
    });

    it('should return undefined for non-existent skill', () => {
      const skill = registry.get('non-existent');
      expect(skill).toBeUndefined();
    });

    it('should return detailed config', () => {
      const detail = registry.getDetail('get-test');
      expect(detail).toBeDefined();
      expect(detail?.name).toBe('get-test');
    });
  });

  describe('list and listDetailed', () => {
    beforeEach(() => {
      (registry as any).skills.set('skill1', {
        name: 'skill1',
        displayName: 'Skill 1',
        description: 'First skill',
        category: 'cat1',
        version: '1.0.0',
        params: [],
        steps: [],
        promptTemplate: 'Test 1',
        timeout: 300,
      });
      (registry as any).skills.set('skill2', {
        name: 'skill2',
        displayName: 'Skill 2',
        description: 'Second skill',
        category: 'cat2',
        version: '2.0.0',
        params: [],
        steps: [],
        promptTemplate: 'Test 2',
        timeout: 600,
      });
    });

    it('should list all skills with basic info', () => {
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map(s => s.name)).toContain('skill1');
      expect(list.map(s => s.name)).toContain('skill2');
    });

    it('should list all skills with full details', () => {
      const detailed = registry.listDetailed();
      expect(detailed).toHaveLength(2);
      expect(detailed[0].category).toBe('cat1');
    });
  });
});
