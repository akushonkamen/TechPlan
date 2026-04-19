// Tests for scheduler

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerService } from './scheduler.js';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    scheduler = new SchedulerService({
      enabled: false,
      checkIntervalMinutes: 30,
    });
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultScheduler = new SchedulerService();
      const config = defaultScheduler.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.checkIntervalMinutes).toBe(30);
    });

    it('should use provided config', () => {
      const customScheduler = new SchedulerService({
        enabled: true,
        checkIntervalMinutes: 60,
      });
      const config = customScheduler.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.checkIntervalMinutes).toBe(60);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const config1 = scheduler.getConfig();
      config1.enabled = true;
      const config2 = scheduler.getConfig();
      expect(config2.enabled).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return not running status initially', () => {
      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
      expect(status.checkIntervalMinutes).toBe(30);
      expect(status.lastCheckAt).toBeNull();
      expect(status.nextCheckAt).toBeNull();
    });

    it('should return empty pending topics array', () => {
      const status = scheduler.getStatus();
      expect(status.pendingTopics).toEqual([]);
    });

    it('should return empty recent triggers array', () => {
      const status = scheduler.getStatus();
      expect(status.recentTriggers).toEqual([]);
    });
  });

  describe('setDb', () => {
    it('should accept database instance', () => {
      const mockDb = {};
      expect(() => scheduler.setDb(mockDb)).not.toThrow();
    });
  });

  describe('setStartExecution', () => {
    it('should accept startExecution function', () => {
      const mockFn = vi.fn();
      expect(() => scheduler.setStartExecution(mockFn)).not.toThrow();
    });
  });

  describe('setReportHandler', () => {
    it('should accept report handler function', () => {
      const mockFn = vi.fn();
      expect(() => scheduler.setReportHandler(mockFn)).not.toThrow();
    });
  });

  describe('restart', () => {
    it('should update config values', () => {
      scheduler.restart({
        enabled: true,
        checkIntervalMinutes: 15,
      });
      const config = scheduler.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.checkIntervalMinutes).toBe(15);
    });

    it('should clamp checkIntervalMinutes to valid range', () => {
      scheduler.restart({ checkIntervalMinutes: 1 });
      expect(scheduler.getConfig().checkIntervalMinutes).toBe(5);

      scheduler.restart({ checkIntervalMinutes: 2000 });
      expect(scheduler.getConfig().checkIntervalMinutes).toBe(1440);
    });

    it('should not start when disabled', () => {
      scheduler.restart({ enabled: false });
      const statusAfter = scheduler.getStatus();
      expect(statusAfter.running).toBe(false);
    });
  });

  describe('getPendingTopics', () => {
    it('should return empty array when no db set', async () => {
      const pending = await scheduler.getPendingTopics();
      expect(pending).toEqual([]);
    });
  });
});
