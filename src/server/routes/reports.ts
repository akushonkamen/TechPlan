import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import type { AppContext } from '../context.js';
import { REPORT_TYPE_TO_SKILL, computePeriod, triggerCollectionForPeriod, getDocumentsCountInPeriod, handleReportResult, startPipeline } from '../reportHandler.js';
import { exportReportToPptx, isPptMasterAvailable } from '../../services/pptxExport.js';
import { isServerOnline as isZImageOnline } from '../../services/imageGeneration.js';

export async function createReportsRouter(ctx: AppContext): Promise<Router> {
  // Run report table migrations
  const { migrateReportTables } = await import('../../services/reportService.js');
  await migrateReportTables(ctx.db);
  const router = Router();

  /**
   * GET /api/reports
   * 获取报告列表
   */
  router.get("/api/reports", async (req, res) => {
    try {
      const { topicId, limit = '20' } = req.query;

      let query = "SELECT * FROM reports";
      const params: any[] = [];

      if (topicId) {
        query += " WHERE topic_id = ?";
        params.push(topicId);
      }

      query += " ORDER BY generated_at DESC LIMIT ?";
      params.push(parseInt(limit as string));

      const rows = await ctx.db.all(query, params);

      const reports = rows.map((row: any) => {
        let parsedContent = row.content;
        let parsedMetadata = row.metadata;
        try { if (parsedContent) parsedContent = JSON.parse(parsedContent); } catch { /* keep raw string */ }
        try { if (parsedMetadata) parsedMetadata = JSON.parse(parsedMetadata); } catch { /* keep raw string */ }
        // Fix double-escaped newlines (\\n → real newline) in report content
        if (parsedContent && typeof parsedContent === 'object') {
          const fix = (s: string) => s.replace(/\\n/g, '\n');
          if (parsedContent.executiveSummary?.overview) parsedContent.executiveSummary.overview = fix(parsedContent.executiveSummary.overview);
          if (parsedContent.executiveSummary?.keyPoints) parsedContent.executiveSummary.keyPoints = parsedContent.executiveSummary.keyPoints.map((p: any) => typeof p === 'string' ? fix(p) : p);
          if (Array.isArray(parsedContent.sections)) parsedContent.sections = parsedContent.sections.map((s: any) => ({ ...s, content: typeof s.content === 'string' ? fix(s.content) : s.content }));
        } else if (typeof parsedContent === 'string') {
          parsedContent = parsedContent.replace(/\\n/g, '\n');
        }
        if (typeof row.summary === 'string') row.summary = row.summary.replace(/\\n/g, '\n');
        return { ...row, content: parsedContent, metadata: parsedMetadata };
      });

      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  /**
   * GET /api/reports/pptx-status
   * Check if PPTX export dependencies are available
   */
  router.get("/api/reports/pptx-status", async (_req, res) => {
    const zimageOk = await isZImageOnline();
    const pptmasterOk = isPptMasterAvailable();
    res.json({
      available: zimageOk && pptmasterOk,
      zimage: zimageOk,
      pptmaster: pptmasterOk,
    });
  });

  /**
   * GET /api/reports/:id
   * 获取单个报告
   */
  router.get("/api/reports/:id", async (req, res) => {
    try {
      const row = await ctx.db.get("SELECT * FROM reports WHERE id = ?", [req.params.id]);

      if (!row) {
        return res.status(404).json({ error: "Report not found" });
      }

      let parsedContent = row.content;
      let parsedMetadata = row.metadata;
      try { if (parsedContent) parsedContent = JSON.parse(parsedContent); } catch { /* keep raw string */ }
      try { if (parsedMetadata) parsedMetadata = JSON.parse(parsedMetadata); } catch { /* keep raw string */ }
      // Fix double-escaped newlines
      if (parsedContent && typeof parsedContent === 'object') {
        const fix = (s: string) => s.replace(/\\n/g, '\n');
        if (parsedContent.executiveSummary?.overview) parsedContent.executiveSummary.overview = fix(parsedContent.executiveSummary.overview);
        if (Array.isArray(parsedContent.sections)) parsedContent.sections = parsedContent.sections.map((s: any) => ({ ...s, content: typeof s.content === 'string' ? fix(s.content) : s.content }));
      } else if (typeof parsedContent === 'string') {
        parsedContent = parsedContent.replace(/\\n/g, '\n');
      }
      if (typeof row.summary === 'string') row.summary = row.summary.replace(/\\n/g, '\n');
      const report = { ...row, content: parsedContent, metadata: parsedMetadata };

      res.json(report);
    } catch (error) {
      console.error("Failed to fetch report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  /**
   * DELETE /api/reports/:id
   * 删除报告
   */
  router.delete("/api/reports/:id", async (req, res) => {
    try {
      console.log(`[DELETE] /api/reports/${req.params.id}`);
      const result = await ctx.db.run("DELETE FROM reports WHERE id = ?", [req.params.id]);
      console.log(`[DELETE] Result:`, result);
      if (!result.changes) {
        console.log(`[DELETE] Report not found: ${req.params.id}`);
        res.status(404).json({ error: "Report not found" });
        return;
      }
      console.log(`[DELETE] Report deleted: ${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  /**
   * GET /api/reports/:id/discussions
   * 获取报告的讨论记录
   */
  router.get("/api/reports/:id/discussions", async (req, res) => {
    try {
      const discussions = await ctx.db.all(
        "SELECT * FROM report_discussions WHERE report_id = ? ORDER BY pinned_at DESC",
        [req.params.id]
      );
      res.json(discussions);
    } catch (error) {
      console.error("Failed to fetch report discussions:", error);
      res.status(500).json({ error: "Failed to fetch report discussions" });
    }
  });

  /**
   * POST /api/reports/:id/discussions
   * 创建报告讨论记录
   */
  router.post("/api/reports/:id/discussions", async (req, res) => {
    try {
      const { selectedText, result, sectionId, userInput, topicId } = req.body;

      if (!selectedText || !result) {
        res.status(400).json({ error: "selectedText and result are required" });
        return;
      }

      const discussionId = uuidv4();
      const now = new Date().toISOString();

      await ctx.db.run(
        `INSERT INTO report_discussions (id, report_id, section_id, selected_text, user_input, result, topic_id, pinned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [discussionId, req.params.id, sectionId || null, selectedText, userInput || null, result, topicId || null, now]
      );

      const discussion = await ctx.db.get("SELECT * FROM report_discussions WHERE id = ?", [discussionId]);
      res.status(201).json(discussion);
    } catch (error) {
      console.error("Failed to create report discussion:", error);
      res.status(500).json({ error: "Failed to create report discussion" });
    }
  });

  /**
   * DELETE /api/reports/:id/discussions/:discussionId
   * 删除报告讨论记录
   */
  router.delete("/api/reports/:id/discussions/:discussionId", async (req, res) => {
    try {
      const result = await ctx.db.run(
        "DELETE FROM report_discussions WHERE id = ? AND report_id = ?",
        [req.params.discussionId, req.params.id]
      );
      if (!result.changes) {
        res.status(404).json({ error: "Discussion not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete report discussion:", error);
      res.status(500).json({ error: "Failed to delete report discussion" });
    }
  });

  // ── Report Generation ──
  router.post("/api/reports/generate", ctx.requireAdmin, async (req, res) => {
    try {
      const { topicId, reportType, period, options } = req.body;
      if (!topicId || !reportType) {
        res.status(400).json({ error: "topicId and reportType are required" });
        return;
      }
      const skillName = REPORT_TYPE_TO_SKILL[reportType];
      if (!skillName) {
        res.status(400).json({ error: `Unknown report type: ${reportType}. Valid: ${Object.keys(REPORT_TYPE_TO_SKILL).join(', ')}` });
        return;
      }
      if (!ctx.skillRegistry.get(skillName)) {
        res.status(400).json({ error: `Skill not found: ${skillName}. The skill file may not exist yet.` });
        return;
      }
      const topic = await ctx.db.get("SELECT id, name, keywords, organizations FROM topics WHERE id = ?", [topicId]);
      if (!topic) {
        res.status(404).json({ error: "Topic not found" });
        return;
      }
      const computedPeriod = computePeriod(reportType, period);
      const params: Record<string, any> = {
        topicId: topic.id,
        topicName: topic.name,
        reportType,
        timeRangeStart: computedPeriod.start,
        timeRangeEnd: computedPeriod.end,
        ...(options?.customParams ?? {}),
      };
      // Auto-select default competitor for competitor report type
      if (reportType === 'competitor' && !params.competitorName) {
        try {
          const orgs = typeof topic.organizations === 'string'
            ? JSON.parse(topic.organizations)
            : (Array.isArray(topic.organizations) ? topic.organizations : []);
          params.competitorName = orgs[0] || "Pinecone";
        } catch {
          params.competitorName = "Pinecone";
        }
      }
      if (reportType === 'tech_topic' && !params.technologyName) {
        params.technologyName = topic.name;
      }
      if (reportType === 'alert' && !params.alertType) {
        params.alertType = 'risk';
      }

      // Use pipeline orchestration — determines active steps based on data availability
      const pipelineResult = await startPipeline(ctx.db, ctx.skillExecutor, {
        topicId: topic.id,
        topicName: topic.name,
        reportType,
        timeRangeStart: computedPeriod.start,
        timeRangeEnd: computedPeriod.end,
        ...params,
      }, computedPeriod);

      res.json({
        pipelineId: pipelineResult.pipelineId,
        steps: pipelineResult.steps.map(s => ({ stepName: s.stepName, status: s.status, executionId: s.executionId })),
        reportType,
        period: computedPeriod,
        status: 'started',
      });
    } catch (error) {
      console.error("Failed to generate report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ── PPTX Export ──

  /**
   * POST /api/reports/:id/export-pptx
   * Export report as PPTX
   */
  router.post("/api/reports/:id/export-pptx", async (req, res) => {
    try {
      const row = await ctx.db.get("SELECT * FROM reports WHERE id = ?", [req.params.id]);
      if (!row) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      // Check dependencies
      const zimageOk = await isZImageOnline();
      if (!zimageOk) {
        res.status(503).json({ error: "Z-Image server not available. Start it first: cd ~/projects/z-image-inference && uv run python model_server.py" });
        return;
      }
      if (!isPptMasterAvailable()) {
        res.status(503).json({ error: "ppt-master not installed. Run: git clone https://github.com/akushonkamen/ppt-master.git ~/projects/ppt-master && cd ~/projects/ppt-master && pip install -r requirements.txt" });
        return;
      }

      // Parse report
      let parsedContent = row.content;
      try { if (parsedContent) parsedContent = JSON.parse(parsedContent); } catch { /* keep raw */ }
      const report = { ...row, content: parsedContent };

      // Export (async — could be slow with many sections)
      const pptxPath = await exportReportToPptx(report);

      // Update report record with pptx path
      await ctx.db.run(
        "UPDATE reports SET metadata = json_set(COALESCE(metadata, '{}'), '$.pptxPath', ?) WHERE id = ?",
        [pptxPath, req.params.id]
      );

      res.json({ pptxPath });
    } catch (error: any) {
      console.error("[PPTX] Export failed:", error);
      res.status(500).json({ error: error.message || "PPTX export failed" });
    }
  });

  /**
   * GET /api/reports/:id/pptx
   * Download exported PPTX
   */
  router.get("/api/reports/:id/pptx", async (req, res) => {
    try {
      const pptxFile = path.join(process.cwd(), 'generated_images', `${req.params.id}.pptx`);
      if (!fs.existsSync(pptxFile)) {
        res.status(404).json({ error: "PPTX not generated yet. POST to /api/reports/:id/export-pptx first." });
        return;
      }
      res.download(pptxFile, `report_${req.params.id}.pptx`);
    } catch (error) {
      console.error("[PPTX] Download failed:", error);
      res.status(500).json({ error: "PPTX download failed" });
    }
  });

  return router;
}
