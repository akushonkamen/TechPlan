import express from 'express';
import { execSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import fs from 'fs';
import { SkillRegistry } from '../skillRegistry.js';
import { SkillExecutor } from '../skillExecutor.js';
import { SkillWebSocket } from '../websocket.js';
import { SchedulerService } from '../scheduler.js';
import { closeKuzu } from '../db/kuzu.js';
import { initDatabase } from './db.js';
import { createRequireAdmin, upload, PORT } from './middleware.js';
import { handleReportResult, triggerCollectionForPeriod, getDocumentsCountInPeriod, startPipeline } from './reportHandler.js';
import { createTopicsRouter } from './routes/topics.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createEntitiesRouter } from './routes/entities.js';
import { createGraphRouter } from './routes/graph.js';
import { createReportsRouter } from './routes/reports.js';
import { createReviewsRouter } from './routes/reviews.js';
import { createSkillsRouter } from './routes/skills.js';
import { createConfigRouter } from './routes/config.js';
import { createSchedulerRouter } from './routes/scheduler.js';
import type { AppContext } from './context.js';

function ensureClaudeCli() {
  try {
    execSync("claude --version", { stdio: "pipe" });
    console.log("[cli] Claude Code CLI found");
  } catch {
    console.log("[cli] Claude Code CLI not found, installing...");
    try {
      execSync("npm install -g @anthropic-ai/claude-code", { stdio: "inherit" });
      console.log("[cli] Claude Code CLI installed successfully");
    } catch (installErr) {
      console.error("[cli] Failed to install Claude Code CLI:", installErr);
      console.error("[cli] Please install manually: npm install -g @anthropic-ai/claude-code");
      process.exit(1);
    }
  }
}

export async function startServer() {
  ensureClaudeCli();

  const app = express();
  app.use(express.json());

  // Serve generated cover images
  const generatedImagesDir = path.join(process.cwd(), 'generated_images');
  if (!fs.existsSync(generatedImagesDir)) {
    fs.mkdirSync(generatedImagesDir, { recursive: true });
  }
  app.use('/generated_images', express.static(generatedImagesDir));

  // CORS middleware
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Initialize database
  const { db, graphSensemaking } = await initDatabase();

  // Initialize skill system
  const skillsDir = path.resolve(process.cwd(), '.claude/skills');
  const skillRegistry = new SkillRegistry();
  skillRegistry.loadAll(skillsDir);

  // Startup version auto-registration
  for (const skill of skillRegistry.listDetailed()) {
    const existing = await db.get(
      "SELECT id FROM skill_versions WHERE skill_name = ? AND version = ?",
      [skill.name, skill.version]
    );

    if (!existing) {
      const filePath = path.join(skillsDir, `${skill.name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');

      await db.run(
        `INSERT INTO skill_versions (id, skill_name, version, content, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`sv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, skill.name, skill.version, content, 'Initial version', new Date().toISOString()]
      );
      console.log(`[SkillRegistry] Auto-registered version ${skill.version} for skill: ${skill.name}`);
    }
  }

  const skillExecutor = new SkillExecutor(skillRegistry, db);
  const httpServer = createHttpServer(app);
  const ws = new SkillWebSocket(httpServer);
  skillExecutor.setWebSocket(ws);

  // Clean up stale "running" executions from previous server session
  await skillExecutor.cleanupStale();

  // Initialize scheduler
  const configPath = path.join(process.cwd(), "config.json");
  let schedulerConfig: { schedulerEnabled?: boolean; schedulerCheckIntervalMinutes?: number } = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = await fs.promises.readFile(configPath, 'utf-8');
      schedulerConfig = JSON.parse(raw);
    }
  } catch { /* use defaults */ }
  const scheduler = new SchedulerService({
    enabled: schedulerConfig.schedulerEnabled ?? (process.env.SCHEDULER_ENABLED !== 'false'),
    checkIntervalMinutes: schedulerConfig.schedulerCheckIntervalMinutes ?? 30,
  });
  scheduler.setDb(db);
  scheduler.setStartExecution(skillExecutor.startExecution.bind(skillExecutor));
  scheduler.setReportHandler((execution: any, params: any, computedPeriod?: any) =>
    handleReportResult(db, execution, params, computedPeriod)
  );
  scheduler.setCollectFunction((topicId, topicName, start, end) =>
    triggerCollectionForPeriod(db, skillExecutor, topicId, topicName, start, end)
  );
  scheduler.setGetDocumentsCountInPeriod((topicId, start, end) =>
    getDocumentsCountInPeriod(db, topicId, start, end)
  );
  scheduler.setStartPipeline((params: any, computedPeriod: any) =>
    startPipeline(db, skillExecutor, params, computedPeriod)
  );

  // Build shared context
  const requireAdmin = createRequireAdmin();
  const ctx: AppContext = {
    db,
    skillRegistry,
    skillExecutor,
    scheduler,
    ws,
    upload,
    requireAdmin,
    configPath,
    skillsDir,
    graphSensemaking,
  };

  // Register all route modules
  app.use(createTopicsRouter(ctx));
  app.use(createDashboardRouter(ctx));
  app.use(createDocumentsRouter(ctx));
  app.use(createEntitiesRouter(ctx));
  app.use(createGraphRouter(ctx));
  app.use(await createReportsRouter(ctx));
  app.use(createReviewsRouter(ctx));
  app.use(createSkillsRouter(ctx));
  app.use(createConfigRouter(ctx));
  app.use(createSchedulerRouter(ctx));

  // Vite middleware for development (must be last)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    scheduler.start();
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    scheduler.stop();
    httpServer.close(() => {
      console.log('HTTP server closed');
      Promise.all([db.close(), closeKuzu()]).then(() => {
        console.log('Databases closed');
        process.exit(0);
      });
    });
    setTimeout(() => {
      console.error('Forcing exit after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
