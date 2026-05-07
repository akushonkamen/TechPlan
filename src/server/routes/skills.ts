import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import type { AppContext } from '../context.js';
import { validateSkillName } from '../middleware.js';
import { safeJsonParse } from '../helpers.js';
import { handleReportResult } from '../reportHandler.js';
import { validateExtractionOutput } from '../../schemas/extraction.js';

export function createSkillsRouter(ctx: AppContext): Router {
  const router = Router();
  const { db, skillRegistry, skillExecutor, requireAdmin, ws, skillsDir } = ctx;

  // List available skills
  router.get("/api/skills", (_req, res) => {
    const skills = skillRegistry.listDetailed();
    res.json(skills.map(s => ({
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      version: s.version,
      params: s.params,
      steps: s.steps,
    })));
  });

  // Get full skill detail
  router.get("/api/skills/:name", (req, res) => {
    const { name } = req.params;
    const skill = skillRegistry.getDetail(name);
    if (!skill) {
      return res.status(404).json({ error: `Skill not found: ${name}` });
    }
    res.json(skill);
  });

  // Get skill version history
  router.get("/api/skills/:name/versions", async (req, res) => {
    try {
      const { name } = req.params;
      const versions = await db.all(
        "SELECT * FROM skill_versions WHERE skill_name = ? ORDER BY created_at DESC",
        [name]
      );
      res.json(versions);
    } catch (error) {
      console.error("Failed to fetch skill versions:", error);
      res.status(500).json({ error: "Failed to fetch skill versions" });
    }
  });

  // Create new skill version
  router.post("/api/skills/:name/versions", requireAdmin, async (req, res) => {
    try {
      const { name } = req.params;
      if (!validateSkillName(name)) {
        return res.status(400).json({ error: "Invalid skill name" });
      }
      const { changelog } = req.body;

      const skill = skillRegistry.getDetail(name);
      if (!skill) {
        return res.status(404).json({ error: `Skill not found: ${name}` });
      }

      const latest = await db.get(
        "SELECT version FROM skill_versions WHERE skill_name = ? ORDER BY created_at DESC LIMIT 1",
        [name]
      );

      let newVersion = "1.0.0";
      if (latest) {
        const parts = latest.version.split('.');
        if (parts.length === 3) {
          const patch = parseInt(parts[2]) + 1;
          newVersion = `${parts[0]}.${parts[1]}.${patch}`;
        }
      }

      const filePath = path.join(skillsDir, `${name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');

      const id = `sv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.run(
        `INSERT INTO skill_versions (id, skill_name, version, content, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, newVersion, content, changelog || '', new Date().toISOString()]
      );

      res.status(201).json({ id, skill_name: name, version: newVersion });
    } catch (error) {
      console.error("Failed to create skill version:", error);
      res.status(500).json({ error: "Failed to create skill version" });
    }
  });

  // Restore skill from version
  router.post("/api/skills/:name/restore/:version", requireAdmin, async (req, res) => {
    try {
      const { name, version } = req.params;
      if (!validateSkillName(name)) {
        return res.status(400).json({ error: "Invalid skill name" });
      }

      const versionRecord = await db.get(
        "SELECT * FROM skill_versions WHERE skill_name = ? AND version = ?",
        [name, version]
      );

      if (!versionRecord) {
        return res.status(404).json({ error: "Version not found" });
      }

      const filePath = path.join(skillsDir, `${name}.md`);
      fs.writeFileSync(filePath, versionRecord.content, 'utf-8');

      skillRegistry.loadAll(skillsDir);

      res.json({ success: true, message: `Restored ${name} to version ${version}` });
    } catch (error) {
      console.error("Failed to restore skill version:", error);
      res.status(500).json({ error: "Failed to restore skill version" });
    }
  });

  // Get optimization config
  router.get("/api/skills/:name/optimization/config", async (req, res) => {
    try {
      const { name } = req.params;
      const config = await db.get(
        "SELECT * FROM optimization_configs WHERE skill_name = ?",
        [name]
      );

      if (!config) {
        return res.json({
          skill_name: name,
          evaluation_criteria: 'relevance,depth,accuracy',
          max_iterations: 10,
          convergence_threshold: 8.0,
          focus_area: 'general',
          custom_params: null,
        });
      }

      res.json(config);
    } catch (error) {
      console.error("Failed to get optimization config:", error);
      res.status(500).json({ error: "Failed to get optimization config" });
    }
  });

  // Update optimization config
  router.put("/api/skills/:name/optimization/config", requireAdmin, async (req, res) => {
    try {
      const { name } = req.params;
      const { evaluation_criteria, max_iterations, convergence_threshold, focus_area, custom_params } = req.body;

      const existing = await db.get(
        "SELECT id FROM optimization_configs WHERE skill_name = ?",
        [name]
      );

      const now = new Date().toISOString();
      if (existing) {
        await db.run(
          `UPDATE optimization_configs
           SET evaluation_criteria = ?, max_iterations = ?, convergence_threshold = ?,
               focus_area = ?, custom_params = ?, updated_at = ?
           WHERE skill_name = ?`,
          [
            evaluation_criteria ?? 'relevance,depth,accuracy',
            max_iterations ?? 10,
            convergence_threshold ?? 8.0,
            focus_area ?? 'general',
            custom_params ? JSON.stringify(custom_params) : null,
            now,
            name
          ]
        );
      } else {
        const id = `optcfg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
          `INSERT INTO optimization_configs (id, skill_name, evaluation_criteria, max_iterations, convergence_threshold, focus_area, custom_params, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, name,
            evaluation_criteria ?? 'relevance,depth,accuracy',
            max_iterations ?? 10,
            convergence_threshold ?? 8.0,
            focus_area ?? 'general',
            custom_params ? JSON.stringify(custom_params) : null,
            now
          ]
        );
      }

      const saved = await db.get(
        "SELECT * FROM optimization_configs WHERE skill_name = ?",
        [name]
      );
      res.json(saved ?? { success: true });
    } catch (error) {
      console.error("Failed to update optimization config:", error);
      res.status(500).json({ error: "Failed to update optimization config" });
    }
  });

  // Get optimization history
  router.get("/api/skills/:name/optimization/history", async (req, res) => {
    try {
      const { name } = req.params;
      const history = await db.all(
        "SELECT * FROM optimization_history WHERE skill_name = ? ORDER BY created_at DESC",
        [name]
      );
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch optimization history:", error);
      res.status(500).json({ error: "Failed to fetch optimization history" });
    }
  });

  // Trigger a skill execution
  router.post("/api/skill/:name", requireAdmin, async (req, res) => {
    const { name } = req.params;
    const params = req.body ?? {};

    if (name === 'research') {
      res.status(400).json({ error: 'Use /api/reports/generate with autoCollect=true instead of calling research directly' });
      return;
    }

    if (!skillRegistry.get(name)) {
      res.status(404).json({ error: `Skill not found: ${name}` });
      return;
    }

    const { executionId, promise } = skillExecutor.startExecution(name, params);

    promise.then(async (execution) => {
      if (name === 'optimize') {
        try {
          const result = execution.result ?? {};
          const optimization = result.optimizationResult ?? {};
          const toNumber = (value: any, fallback = 0) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
          };

          const id = `opth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const iterationsCompleted = toNumber(optimization.iterations ?? result.total_runs, 0);
          const peakScore = toNumber(optimization.peakScore ?? result.peak_score, 0);
          const finalScore = toNumber(optimization.finalScore ?? result.final_score ?? peakScore, peakScore);
          const lessonsExtracted = toNumber(result.lessonsExtracted ?? result.lessons_extracted, 0);
          const converged = optimization.converged ?? result.converged;
          const resultSummary = typeof result === 'string'
            ? result
            : JSON.stringify({
              skillName: result.skillName ?? params.skillName ?? '',
              optimizationResult: optimization,
              strategyChanges: result.strategyChanges ?? [],
            });

          await db.run(
            `INSERT INTO optimization_history
             (id, skill_name, iterations_completed, converged, peak_score, final_score, lessons_extracted, result_summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              params.skillName ?? 'unknown',
              iterationsCompleted,
              converged ? 1 : 0,
              peakScore,
              finalScore,
              lessonsExtracted,
              resultSummary,
              new Date().toISOString(),
            ]
          );
        } catch (err) {
          console.error('[Optimize] Failed to persist optimization_history:', err);
        }
      }

      if (name === 'report' || name.startsWith('report-')) {
        await handleReportResult(db, execution, params);
      }

      if (name === 'extract') {
        const validation = validateExtractionOutput(execution.result);
        if (validation.warnings.length > 0) {
          console.warn('[Extract] Schema validation warnings:', validation.warnings);
        }

        if (!validation.valid) {
          execution.status = 'failed';
          execution.error = `Extraction schema validation failed: ${validation.warnings.slice(0, 3).join('; ')}`;
          await db.run(
            "UPDATE skill_executions SET status = 'failed', error = ? WHERE id = ?",
            [execution.error, execution.id]
          );
          ws.send(execution.id, 'error', execution.error);
        } else {
          execution.result = validation.data;
          // Auto-trigger sync-graph after successful extraction
          if (params.topicId) {
            const { executionId: syncId } = skillExecutor.startExecution('sync-graph', { topicId: params.topicId });
            console.log(`[AutoSync] Triggered sync-graph ${syncId} for topic ${params.topicId}`);
          }
        }
      }

      ws.send(execution.id, 'result', JSON.stringify(execution.result ?? { error: execution.error }));
    }).catch((err) => {
      console.error(`[SkillExecutor] Error executing ${name}:`, err);
    });

    res.json({
      executionId,
      skillName: name,
      status: 'started',
    });
  });

  // Get progress lines for an execution
  router.get("/api/skill/:id/progress", (req, res) => {
    try {
      const { id } = req.params;
      const afterParam = parseInt(req.query.after as string) || 0;
      const lines = skillExecutor.getProgress(id);
      res.json({
        lines: lines.slice(afterParam),
        total: lines.length,
      });
    } catch (error) {
      console.error("Failed to get progress:", error);
      res.status(500).json({ error: "Failed to get progress" });
    }
  });

  // Check skill execution status
  router.get("/api/skill/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.get("SELECT * FROM skill_executions WHERE id = ?", [id]);
      if (!row) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }
      res.json(row);
    } catch (error) {
      console.error("Failed to get execution status:", error);
      res.status(500).json({ error: "Failed to get execution status" });
    }
  });

  // List execution history (exclude pipeline child executions)
  router.get("/api/skill/executions", async (_req, res) => {
    try {
      const rows = await db.all(
        "SELECT id, skill_name, params, status, started_at, completed_at, result, error, pipeline_id, pipeline_step FROM skill_executions WHERE pipeline_id IS NULL ORDER BY started_at DESC LIMIT 50"
      );
      const executions = rows.map((row: any) => ({
        ...row,
        params: safeJsonParse(row.params),
        result: safeJsonParse(row.result),
      }));
      res.json(executions);
    } catch (error) {
      console.error("Failed to list executions:", error);
      res.status(500).json({ error: "Failed to list executions" });
    }
  });

  // Get single execution detail
  router.get("/api/skill/executions/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM skill_executions WHERE id = ?", [req.params.id]);
      if (!row) { return res.status(404).json({ error: "Execution not found" }); }
      res.json({
        ...row,
        params: safeJsonParse(row.params),
        result: safeJsonParse(row.result),
      });
    } catch (error) {
      console.error("Failed to fetch execution:", error);
      res.status(500).json({ error: "Failed to fetch execution" });
    }
  });

  // Cancel a running skill
  router.post("/api/skill/:id/cancel", (req, res) => {
    try {
      const { id } = req.params;
      const cancelled = skillExecutor.cancel(id);
      res.json({ cancelled });
    } catch (error) {
      console.error("Failed to cancel execution:", error);
      res.status(500).json({ error: "Failed to cancel execution" });
    }
  });

  // ── Pipeline endpoints ──

  // List recent pipelines
  router.get("/api/pipelines", async (_req, res) => {
    try {
      const rows = await db.all(
        `SELECT pipeline_id,
                MIN(started_at) as started_at,
                MAX(COALESCE(completed_at, started_at)) as completed_at,
                GROUP_CONCAT(pipeline_step || ':' || status) as step_statuses
         FROM skill_executions
         WHERE pipeline_id IS NOT NULL
         GROUP BY pipeline_id
         ORDER BY MIN(started_at) DESC
         LIMIT 20`
      );
      const pipelines = rows.map((row: any) => {
        const stepMap: Record<string, string> = {};
        if (row.step_statuses) {
          for (const pair of row.step_statuses.split(',')) {
            const [step, status] = pair.split(':');
            stepMap[step] = status;
          }
        }
        // Determine overall status
        const statuses = Object.values(stepMap) as string[];
        let overallStatus = 'completed';
        if (statuses.some(s => s === 'running')) overallStatus = 'running';
        else if (statuses.some(s => s === 'failed')) overallStatus = 'failed';
        else if (statuses.every(s => s === 'pending' || s === 'skipped')) overallStatus = 'pending';

        return {
          pipelineId: row.pipeline_id,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          steps: stepMap,
          status: overallStatus,
          title: '',
        };
      });

      // Enrich pipelines with titles derived from report step params
      const TYPE_LABELS: Record<string, string> = {
        daily: '日报', weekly: '周报', monthly: '月报', quarterly: '季报',
        tech_topic: '技术专题', competitor: '友商分析', alert: '预警',
      };
      for (const p of pipelines) {
        try {
          const reportStep = await db.get(
            `SELECT params FROM skill_executions WHERE pipeline_id = ? AND pipeline_step = 'report' LIMIT 1`,
            [p.pipelineId]
          );
          if (reportStep?.params) {
            const rp = typeof reportStep.params === 'string' ? JSON.parse(reportStep.params) : reportStep.params;
            p.title = `${rp.topicName || ''} ${TYPE_LABELS[rp.reportType] || '报告'}`.trim();
          }
        } catch { /* ignore parse errors */ }
      }

      res.json(pipelines);
    } catch (error) {
      console.error("Failed to list pipelines:", error);
      res.status(500).json({ error: "Failed to list pipelines" });
    }
  });

  // Get single pipeline detail with all steps
  router.get("/api/pipeline/:pipelineId", async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT id, skill_name, params, status, started_at, completed_at, result, error, pipeline_step
         FROM skill_executions
         WHERE pipeline_id = ?
         ORDER BY started_at ASC`,
        [req.params.pipelineId],
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Pipeline not found" });
      }
      const steps = rows.map((row: any) => ({
        executionId: row.id,
        skillName: row.skill_name,
        stepName: row.pipeline_step,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: row.error,
        result: safeJsonParse(row.result),
        params: safeJsonParse(row.params),
      }));

      // Determine overall status
      const statuses = steps.map((s: any) => s.status);
      let overallStatus = 'completed';
      if (statuses.some((s: string) => s === 'running')) overallStatus = 'running';
      else if (statuses.some((s: string) => s === 'failed')) overallStatus = 'failed';
      else if (statuses.includes('pending')) overallStatus = 'pending';

      res.json({
        pipelineId: req.params.pipelineId,
        steps,
        status: overallStatus,
        startedAt: rows[0]?.started_at,
        completedAt: rows[rows.length - 1]?.completed_at,
      });
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
      res.status(500).json({ error: "Failed to fetch pipeline" });
    }
  });

  return router;
}
