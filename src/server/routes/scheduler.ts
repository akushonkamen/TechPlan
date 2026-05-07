import { Router } from 'express';
import fs from 'fs';
import type { AppContext } from '../context.js';

export function createSchedulerRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/scheduler/status
   * 获取调度器状态
   */
  router.get("/api/scheduler/status", async (_req, res) => {
    try {
      const status = ctx.scheduler.getStatus();
      status.pendingTopics = await ctx.scheduler.getPendingTopics();
      res.json(status);
    } catch (error) {
      console.error("Failed to get scheduler status:", error);
      res.status(500).json({ error: "Failed to get scheduler status" });
    }
  });

  /**
   * POST /api/scheduler/toggle
   * 开关调度器、修改检查间隔
   */
  router.post("/api/scheduler/toggle", async (req, res) => {
    try {
      const { enabled, checkIntervalMinutes } = req.body;

      const newConfig: any = {};
      if (typeof enabled === 'boolean') newConfig.enabled = enabled;
      if (typeof checkIntervalMinutes === 'number') newConfig.checkIntervalMinutes = checkIntervalMinutes;

      ctx.scheduler.restart(newConfig);

      // Persist to config.json
      try {
        let existing: any = {};
        if (fs.existsSync(ctx.configPath)) {
          existing = JSON.parse(await fs.promises.readFile(ctx.configPath, 'utf-8'));
        }
        if (newConfig.enabled !== undefined) existing.schedulerEnabled = newConfig.enabled;
        if (newConfig.checkIntervalMinutes !== undefined) existing.schedulerCheckIntervalMinutes = newConfig.checkIntervalMinutes;
        await fs.promises.writeFile(ctx.configPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (cfgErr) {
        console.error('[Scheduler] Failed to persist config:', cfgErr);
      }

      res.json({ success: true, config: ctx.scheduler.getConfig() });
    } catch (error) {
      console.error("Failed to toggle scheduler:", error);
      res.status(500).json({ error: "Failed to toggle scheduler" });
    }
  });

  return router;
}
