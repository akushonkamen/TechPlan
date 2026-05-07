import { Router } from 'express';
import type { AppContext } from '../context.js';
import { safeJsonParse } from '../helpers.js';

export function createTopicsRouter(ctx: AppContext): Router {
  const router = Router();

  // ===== Topics CRUD =====

  router.get("/api/topics", async (_req, res) => {
    try {
      const rows = await ctx.db.all("SELECT * FROM topics ORDER BY createdAt DESC");
      // Parse JSON arrays back to arrays
      const topics = rows.map(row => ({
        ...row,
        aliases: safeJsonParse(row.aliases, []),
        keywords: safeJsonParse(row.keywords, []),
        organizations: safeJsonParse(row.organizations, []),
        dailyReportEnabled: !!row.daily_report_enabled,
        weeklyReportEnabled: !!row.weekly_report_enabled,
        monthlyReportEnabled: !!row.monthly_report_enabled,
        quarterlyReportEnabled: !!row.quarterly_report_enabled,
        collectionTime: row.collection_time || '06:00',
      }));
      res.json(topics);
    } catch (error) {
      console.error("Failed to fetch topics:", error);
      res.status(500).json({ error: "Failed to fetch topics" });
    }
  });

  router.post("/api/topics", async (req, res) => {
    try {
      const topic = req.body;
      const id = topic.id || `topic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const now = new Date().toISOString();
      const topicData = {
        ...topic,
        id,
        createdAt: topic.createdAt || now,
      };
      await ctx.db.run(
        `INSERT INTO topics (id, name, description, aliases, owner, priority, scope, createdAt, keywords, organizations, schedule, daily_report_enabled, weekly_report_enabled, monthly_report_enabled, quarterly_report_enabled, collection_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          topicData.id,
          topicData.name,
          topicData.description || '',
          JSON.stringify(topicData.aliases || []),
          topicData.owner || '',
          topicData.priority || 'medium',
          topicData.scope || '',
          topicData.createdAt,
          JSON.stringify(topicData.keywords || []),
          JSON.stringify(topicData.organizations || []),
          topicData.schedule || 'daily',
          topicData.dailyReportEnabled ? 1 : 0,
          topicData.weeklyReportEnabled ? 1 : 0,
          topicData.monthlyReportEnabled ? 1 : 0,
          topicData.quarterlyReportEnabled ? 1 : 0,
          topicData.collectionTime || '06:00',
        ]
      );
      res.status(201).json(topicData);
    } catch (error) {
      console.error("Failed to create topic:", error);
      res.status(500).json({ error: "Failed to create topic" });
    }
  });

  router.delete("/api/topics/:id", async (req, res) => {
    try {
      const result = await ctx.db.run("DELETE FROM topics WHERE id = ?", [req.params.id]);
      if (!result.changes) { res.status(404).json({ error: "Topic not found" }); return; }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete topic:", error);
      res.status(500).json({ error: "Failed to delete topic" });
    }
  });

  router.put("/api/topics/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const topic = req.body;

      await ctx.db.run(
        `UPDATE topics SET
          name = ?, description = ?, aliases = ?, owner = ?,
          priority = ?, scope = ?, createdAt = ?, keywords = ?,
          organizations = ?, schedule = ?,
          daily_report_enabled = ?, weekly_report_enabled = ?,
          monthly_report_enabled = ?, quarterly_report_enabled = ?,
          collection_time = ?
        WHERE id = ?`,
        [
          topic.name,
          topic.description,
          JSON.stringify(topic.aliases || []),
          topic.owner,
          topic.priority,
          topic.scope,
          topic.createdAt,
          JSON.stringify(topic.keywords || []),
          JSON.stringify(topic.organizations || []),
          topic.schedule,
          topic.dailyReportEnabled ? 1 : 0,
          topic.weeklyReportEnabled ? 1 : 0,
          topic.monthlyReportEnabled ? 1 : 0,
          topic.quarterlyReportEnabled ? 1 : 0,
          topic.collectionTime || '06:00',
          id
        ]
      );

      // Fetch and return the updated topic
      const row = await ctx.db.get("SELECT * FROM topics WHERE id = ?", [id]);
      if (row) {
        const updatedTopic = {
          ...row,
          aliases: safeJsonParse(row.aliases, []),
          keywords: safeJsonParse(row.keywords, []),
          organizations: safeJsonParse(row.organizations, [])
        };
        res.json(updatedTopic);
      } else {
        res.status(404).json({ error: "Topic not found" });
      }
    } catch (error) {
      console.error("Failed to update topic:", error);
      res.status(500).json({ error: "Failed to update topic" });
    }
  });

  // Trigger data collection for a topic
  router.post("/api/topics/:id/collect", ctx.requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const topic = await ctx.db.get("SELECT * FROM topics WHERE id = ?", [id]);
      if (!topic) return res.status(404).json({ error: "Topic not found" });

      const keywords = topic.keywords ? JSON.parse(topic.keywords) : [];
      const organizations = topic.organizations ? JSON.parse(topic.organizations) : [];
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      // Default: collect from 7 days ago to today
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const periodStart = req.body?.periodStart || fmt(weekAgo);
      const periodEnd = req.body?.periodEnd || fmt(now);

      const researchParams = {
        topicId: id,
        topicName: topic.name,
        keywords: JSON.stringify(keywords),
        organizations: JSON.stringify(organizations),
        timeRangeStart: periodStart,
        timeRangeEnd: periodEnd,
        maxResults: req.body?.maxResults || 20,
      };

      const { executionId } = ctx.skillExecutor.startExecution('research', researchParams);
      console.log(`[Collection] Started collection for topic "${topic.name}" (${periodStart} - ${periodEnd}), execution ${executionId}`);

      res.json({ executionId, topicName: topic.name, periodStart, periodEnd });
    } catch (error) {
      console.error("Failed to start collection:", error);
      res.status(500).json({ error: "Failed to start collection" });
    }
  });

  return router;
}
