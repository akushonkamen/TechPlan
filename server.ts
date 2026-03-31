import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { SkillRegistry } from "./src/skillRegistry.js";
import { SkillExecutor } from "./src/skillExecutor.js";
import type { SkillExecution } from "./src/skillExecutor.js";
import { SkillWebSocket } from "./src/websocket.js";
import { SchedulerService } from "./src/scheduler.js";

// 配置文件上传（使用内存存储）
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10') * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

const PORT = parseInt(process.env.PORT || '3000');

/** Safely parse JSON, returning fallback on failure */
function safeJsonParse(val: string | null | undefined, fallback: any = null): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return val; }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const adminToken = process.env.ADMIN_TOKEN;

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    // Backward compatibility: if ADMIN_TOKEN is not configured, keep current behavior.
    if (!adminToken) return next();

    const authHeader = req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const headerToken = req.header("x-admin-token");
    const token = bearer || headerToken;

    if (!token || token !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
  function validateSkillName(name: string): boolean {
    return SKILL_NAME_PATTERN.test(name);
  }

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

  // Initialize SQLite database
  const dbPath = path.resolve(process.cwd(), "database.sqlite");
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      aliases TEXT,
      owner TEXT,
      priority TEXT,
      scope TEXT,
      createdAt TEXT,
      keywords TEXT,
      organizations TEXT,
      schedule TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT,
      source_url TEXT,
      published_date TEXT,
      collected_date TEXT,
      content TEXT,
      topic_id TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      text TEXT NOT NULL,
      type TEXT,
      confidence REAL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      text TEXT NOT NULL,
      type TEXT,
      polarity TEXT,
      confidence REAL,
      source_context TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      source_text TEXT,
      target_text TEXT,
      relation TEXT,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      type TEXT,
      title TEXT,
      description TEXT,
      event_time TEXT,
      location TEXT,
      participants TEXT,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entities_document ON entities(document_id);
    CREATE INDEX IF NOT EXISTS idx_claims_document ON claims(document_id);
    CREATE INDEX IF NOT EXISTS idx_relations_document ON relations(document_id);
    CREATE INDEX IF NOT EXISTS idx_events_document ON events(document_id);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      topic_id TEXT,
      topic_name TEXT,
      type TEXT,
      title TEXT,
      summary TEXT,
      content TEXT,
      status TEXT,
      generated_at TEXT,
      period_start TEXT,
      period_end TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reports_topic ON reports(topic_id);
    CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      topic_id TEXT,
      topic_name TEXT,
      source TEXT,
      source_url TEXT,
      content TEXT NOT NULL,
      confidence REAL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_type ON reviews(type);

    -- Skill execution tracking
    CREATE TABLE IF NOT EXISTS skill_executions (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      params TEXT,
      status TEXT DEFAULT 'running',
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      result TEXT,
      error TEXT
    );

    -- Bilevel optimization lessons
    CREATE TABLE IF NOT EXISTS bilevel_lessons (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      lesson_type TEXT NOT NULL,
      stage TEXT,
      summary TEXT NOT NULL,
      reuse_rule TEXT,
      confidence REAL,
      outer_cycle INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Bilevel promoted skills (high-confidence lessons)
    CREATE TABLE IF NOT EXISTS bilevel_skills (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Bilevel execution traces
    CREATE TABLE IF NOT EXISTS bilevel_traces (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      run_number INTEGER,
      scores TEXT,
      overall INTEGER,
      strategy_used TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Skill version tracking
    CREATE TABLE IF NOT EXISTS skill_versions (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      changelog TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(skill_name, version)
    );

    -- Optimization configs
    CREATE TABLE IF NOT EXISTS optimization_configs (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL UNIQUE,
      evaluation_criteria TEXT DEFAULT 'relevance,depth,accuracy',
      max_iterations INTEGER DEFAULT 10,
      convergence_threshold REAL DEFAULT 8.0,
      focus_area TEXT DEFAULT 'general',
      custom_params TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Optimization history
    CREATE TABLE IF NOT EXISTS optimization_history (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      iterations_completed INTEGER,
      converged INTEGER DEFAULT 0,
      peak_score REAL,
      final_score REAL,
      lessons_extracted INTEGER DEFAULT 0,
      result_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_skill_executions_name ON skill_executions(skill_name);
    CREATE INDEX IF NOT EXISTS idx_skill_executions_status ON skill_executions(status);
    CREATE INDEX IF NOT EXISTS idx_bilevel_lessons_skill ON bilevel_lessons(skill_name);
    CREATE INDEX IF NOT EXISTS idx_bilevel_skills_skill ON bilevel_skills(skill_name);
    CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_name);
    CREATE INDEX IF NOT EXISTS idx_optimization_history_skill ON optimization_history(skill_name);
  `);

  // Add skill_version column to skill_executions if not exists
  try {
    await db.exec(`
      ALTER TABLE skill_executions ADD COLUMN skill_version TEXT DEFAULT '0.0.0'
    `);
  } catch (err: any) {
    // Column might already exist - ignore duplicate column error
    if (!err.message.includes('duplicate column')) {
      console.warn('[Server] Warning adding skill_version column:', err.message);
    }
  }

  // Seed data if empty
  const count = await db.get("SELECT COUNT(*) as count FROM topics");
  if (count.count === 0) {
    const mockTopics = [
      {
        id: '1',
        name: '端侧大模型',
        description: '关注端侧推理和轻量化模型方向，包括模型压缩、量化、NPU适配等。',
        aliases: ['on-device LLM', 'edge model'],
        owner: '张规划',
        priority: 'high',
        scope: '全球',
        createdAt: '2025-10-01',
        keywords: ['端侧推理', '模型压缩', 'NPU inference'],
        organizations: ['Apple', 'Qualcomm', 'Google', 'Meta', '华为'],
        schedule: 'daily'
      },
      {
        id: '2',
        name: '固态电池',
        description: '追踪全固态电池、半固态电池的材料突破、量产进度及车企合作动态。',
        aliases: ['Solid-state battery', 'SSB'],
        owner: '李研究',
        priority: 'high',
        scope: '全球',
        createdAt: '2025-11-15',
        keywords: ['硫化物固态', '氧化物固态', '聚合物固态', '能量密度'],
        organizations: ['丰田', '宁德时代', 'QuantumScape', 'SolidPower'],
        schedule: 'weekly'
      },
      {
        id: '3',
        name: '硅光芯片',
        description: '数据中心互联、CPO共封装光学技术演进及产业链成熟度。',
        aliases: ['Silicon Photonics', 'CPO'],
        owner: '王技术',
        priority: 'medium',
        scope: '北美、亚太',
        createdAt: '2026-01-20',
        keywords: ['CPO', '光电共封装', '硅光子', '光模块'],
        organizations: ['Intel', 'Cisco', 'Broadcom', '中际旭创'],
        schedule: 'weekly'
      }
    ];

    for (const topic of mockTopics) {
      await db.run(
        `INSERT INTO topics (id, name, description, aliases, owner, priority, scope, createdAt, keywords, organizations, schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          topic.id,
          topic.name,
          topic.description,
          JSON.stringify(topic.aliases),
          topic.owner,
          topic.priority,
          topic.scope,
          topic.createdAt,
          JSON.stringify(topic.keywords),
          JSON.stringify(topic.organizations),
          topic.schedule
        ]
      );
    }
  }

  // API Routes

  // ===== Topics CRUD =====

  app.get("/api/topics", async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM topics ORDER BY createdAt DESC");
      // Parse JSON arrays back to arrays
      const topics = rows.map(row => ({
        ...row,
        aliases: safeJsonParse(row.aliases, []),
        keywords: safeJsonParse(row.keywords, []),
        organizations: safeJsonParse(row.organizations, [])
      }));
      res.json(topics);
    } catch (error) {
      console.error("Failed to fetch topics:", error);
      res.status(500).json({ error: "Failed to fetch topics" });
    }
  });

  app.post("/api/topics", async (req, res) => {
    try {
      const topic = req.body;
      await db.run(
        `INSERT INTO topics (id, name, description, aliases, owner, priority, scope, createdAt, keywords, organizations, schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          topic.id,
          topic.name,
          topic.description,
          JSON.stringify(topic.aliases || []),
          topic.owner,
          topic.priority,
          topic.scope,
          topic.createdAt,
          JSON.stringify(topic.keywords || []),
          JSON.stringify(topic.organizations || []),
          topic.schedule
        ]
      );
      res.status(201).json(topic);
    } catch (error) {
      console.error("Failed to create topic:", error);
      res.status(500).json({ error: "Failed to create topic" });
    }
  });

  app.delete("/api/topics/:id", async (req, res) => {
    try {
      const result = await db.run("DELETE FROM topics WHERE id = ?", [req.params.id]);
      if (!result.changes) { res.status(404).json({ error: "Topic not found" }); return; }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete topic:", error);
      res.status(500).json({ error: "Failed to delete topic" });
    }
  });

  app.put("/api/topics/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const topic = req.body;

      await db.run(
        `UPDATE topics SET
          name = ?, description = ?, aliases = ?, owner = ?,
          priority = ?, scope = ?, createdAt = ?, keywords = ?,
          organizations = ?, schedule = ?
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
          id
        ]
      );

      // Fetch and return the updated topic
      const row = await db.get("SELECT * FROM topics WHERE id = ?", [id]);
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

  // ===== Dashboard API =====

  /**
   * GET /api/dashboard/stats
   * 获取仪表盘统计数据
   */
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const activeTopicsCount = await db.get("SELECT COUNT(*) as count FROM topics");
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekDocsCount = await db.get(
        "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ?",
        [weekAgo]
      );
      const pendingReviewsCount = await db.get(
        "SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'"
      );
      const highPriorityTopics = await db.get(
        "SELECT COUNT(*) as count FROM topics WHERE priority = 'high'"
      );

      const lastWeekDocs = await db.get(
        "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ? AND collected_date < ?",
        [new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), weekAgo]
      );

      const docsChange = lastWeekDocs && lastWeekDocs.count > 0
        ? Math.round(((weekDocsCount.count - lastWeekDocs.count) / lastWeekDocs.count) * 100)
        : 0;

      res.json({
        activeTopics: activeTopicsCount.count,
        weekDocs: weekDocsCount.count,
        pendingReviews: pendingReviewsCount.count,
        highPriorityAlerts: highPriorityTopics.count,
        docsChange: docsChange,
      });
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  /**
   * GET /api/dashboard/trend
   * 获取采集趋势数据（最近7天）
   */
  app.get("/api/dashboard/trend", async (req, res) => {
    try {
      const trendData = [];
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStart = new Date(date.setHours(0, 0, 0, 0)).toISOString();
        const dateEnd = new Date(date.setHours(23, 59, 59, 999)).toISOString();

        const papersCount = await db.get(
          "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ? AND collected_date <= ? AND source LIKE ?",
          [dateStart, dateEnd, '%arXiv%']
        );

        const newsCount = await db.get(
          "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ? AND collected_date <= ? AND (source NOT LIKE ? OR source IS NULL)",
          [dateStart, dateEnd, '%arXiv%']
        );

        trendData.push({
          name: dayNames[date.getDay()],
          papers: papersCount.count,
          news: newsCount.count,
        });
      }

      res.json(trendData);
    } catch (error) {
      console.error("Failed to fetch trend data:", error);
      res.status(500).json({ error: "Failed to fetch trend data" });
    }
  });

  /**
   * GET /api/dashboard/topic-distribution
   * 获取主题证据分布
   */
  app.get("/api/dashboard/topic-distribution", async (req, res) => {
    try {
      const distribution = await db.all(`
        SELECT t.name, COUNT(d.id) as value
        FROM topics t
        LEFT JOIN documents d ON t.id = d.topic_id
        GROUP BY t.id
        ORDER BY value DESC
        LIMIT 5
      `);

      res.json(distribution);
    } catch (error) {
      console.error("Failed to fetch topic distribution:", error);
      res.status(500).json({ error: "Failed to fetch topic distribution" });
    }
  });

  /**
   * GET /api/dashboard/alerts
   * 获取最新预警列表
   */
  app.get("/api/dashboard/alerts", async (req, res) => {
    try {
      const alerts = await db.all(`
        SELECT
          d.title,
          t.name as topic,
          d.collected_date as time,
          d.source,
          d.source_url as url
        FROM documents d
        LEFT JOIN topics t ON d.topic_id = t.id
        WHERE t.priority = 'high'
        ORDER BY d.collected_date DESC
        LIMIT 5
      `);

      const formattedAlerts = alerts.map((alert, i) => ({
        id: i,
        title: alert.title,
        topic: alert.topic || '未分类',
        time: formatTimeAgo(alert.time),
        type: getAlertType(alert.source),
        url: alert.url,
      }));

      res.json(formattedAlerts);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  function formatTimeAgo(dateStr: string): string {
    if (!dateStr) return '未知时间';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  }

  function getAlertType(source: string): string {
    if (!source) return '资讯更新';
    if (source.toLowerCase().includes('arxiv')) return '学术突破';
    if (source.toLowerCase().includes('nature') || source.toLowerCase().includes('science')) return '学术突破';
    if (source.toLowerCase().includes('policy') || source.toLowerCase().includes('regulation')) return '政策调整';
    return '重大发布';
  }

  // ===== Documents API =====

  app.get("/api/documents", async (req, res) => {
    try {
      const { topic_id } = req.query;
      let query = "SELECT * FROM documents";
      const params: string[] = [];

      if (topic_id) {
        query += " WHERE topic_id = ?";
        params.push(topic_id as string);
      }

      query += " ORDER BY collected_date DESC";

      const rows = await db.all(query, params);
      const documents = rows.map(row => ({
        ...row,
        metadata: safeJsonParse(row.metadata)
      }));
      res.json(documents);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM documents WHERE id = ?", [req.params.id]);
      if (!row) {
        return res.status(404).json({ error: "Document not found" });
      }
      const document = {
        ...row,
        metadata: safeJsonParse(row.metadata)
      };
      res.json(document);
    } catch (error) {
      console.error("Failed to fetch document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.get("/api/topics/:id/documents", async (req, res) => {
    try {
      const rows = await db.all(
        "SELECT * FROM documents WHERE topic_id = ? ORDER BY collected_date DESC",
        [req.params.id]
      );
      const documents = rows.map(row => ({
        ...row,
        metadata: safeJsonParse(row.metadata)
      }));
      res.json(documents);
    } catch (error) {
      console.error("Failed to fetch topic documents:", error);
      res.status(500).json({ error: "Failed to fetch topic documents" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const doc = req.body;
      const id = doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const collectedDate = doc.collected_date || new Date().toISOString();

      await db.run(
        `INSERT INTO documents (id, title, source, source_url, published_date, collected_date, content, topic_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          doc.title,
          doc.source || null,
          doc.source_url || null,
          doc.published_date || null,
          collectedDate,
          doc.content || null,
          doc.topic_id || null,
          doc.metadata ? JSON.stringify(doc.metadata) : null
        ]
      );

      const created = await db.get("SELECT * FROM documents WHERE id = ?", [id]);
      const document = {
        ...created,
        metadata: safeJsonParse(created.metadata)
      };
      res.status(201).json(document);
    } catch (error) {
      console.error("Failed to create document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const result = await db.run("DELETE FROM documents WHERE id = ?", [req.params.id]);
      if (!result.changes) { res.status(404).json({ error: "Document not found" }); return; }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // ===== 文件上传 API =====

  // 确保上传目录存在
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  /**
   * POST /api/upload
   * 上传内部文档（PDF、Word、TXT、Markdown）
   */
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "没有上传文件" });
      }

      // 动态导入文件处理服务
      const { processUploadedFile } = await import('./src/services/fileUploadService.js');

      // 处理上传的文件
      const result = await processUploadedFile(req.file, uploadsDir);

      if (!result.success || !result.file) {
        return res.status(400).json({ error: result.error });
      }

      // 保存到数据库
      const documentId = uuidv4();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO documents (id, title, source, source_url, published_date, collected_date, content, topic_id, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          result.file.title,
          '内部文档',
          `file://${result.file.id}`,
          now.split('T')[0],
          now,
          result.file.content,
          req.body.topicId || null,
          JSON.stringify({
            type: '内部文档',
            originalName: result.file.originalName,
            mimeType: result.file.mimeType,
            size: result.file.size,
            fileId: result.file.id,
          }),
          now,
        ]
      );

      // 返回文档信息
      res.json({
        id: documentId,
        title: result.file.title,
        source: '内部文档',
        content: result.file.content,
        contentLength: result.file.content.length,
        extractedAt: result.file.extractedAt,
      });
    } catch (error) {
      console.error("Failed to upload file:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "文件上传失败" });
    }
  });

  // ===== Entities Read API =====

  /**
   * GET /api/documents/:id/extraction
   * 获取文档的所有抽取结果
   */
  app.get("/api/documents/:id/extraction", async (req, res) => {
    try {
      const { id } = req.params;

      // 并行获取所有抽取数据
      const [entities, claims, relations, events] = await Promise.all([
        db.all("SELECT * FROM entities WHERE document_id = ?", [id]),
        db.all("SELECT * FROM claims WHERE document_id = ?", [id]),
        db.all("SELECT * FROM relations WHERE document_id = ?", [id]),
        db.all("SELECT * FROM events WHERE document_id = ?", [id])
      ]);

      // 解析 JSON 字段
      const parsedEntities = entities.map((e: any) => ({
        ...e,
        metadata: safeJsonParse(e.metadata)
      }));
      const parsedEvents = events.map((e: any) => ({
        ...e,
        participants: safeJsonParse(e.participants, [])
      }));

      res.json({
        entities: parsedEntities,
        claims,
        relations,
        events: parsedEvents,
        stats: {
          entityCount: parsedEntities.length,
          claimCount: claims.length,
          relationCount: relations.length,
          eventCount: parsedEvents.length
        }
      });
    } catch (error) {
      console.error("Failed to fetch extraction results:", error);
      res.status(500).json({ error: "Failed to fetch extraction results" });
    }
  });

  /**
   * GET /api/topics/:id/entities
   * 获取主题下的所有实体（聚合）
   */
  app.get("/api/topics/:id/entities", async (req, res) => {
    try {
      const { id } = req.params;

      const entities = await db.all(
        `SELECT e.*, d.title as document_title, d.source
         FROM entities e
         JOIN documents d ON e.document_id = d.id
         WHERE d.topic_id = ?
         ORDER BY e.confidence DESC`,
        [id]
      );

      const parsedEntities = entities.map((e: any) => ({
        ...e,
        metadata: safeJsonParse(e.metadata)
      }));

      // 按类型分组统计
      const byType = parsedEntities.reduce((acc: any, e: any) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {});

      res.json({
        entities: parsedEntities,
        stats: {
          total: parsedEntities.length,
          byType
        }
      });
    } catch (error) {
      console.error("Failed to fetch topic entities:", error);
      res.status(500).json({ error: "Failed to fetch topic entities" });
    }
  });

  // ===== Graph Data (ReactFlow) =====

  /**
   * GET /api/topics/:id/graph
   * 获取主题的知识图谱（节点和边）
   */
  app.get("/api/topics/:id/graph", async (req, res) => {
    try {
      const { id } = req.params;

      // 获取所有实体作为节点
      const entities = await db.all(
        `SELECT DISTINCT e.text, e.type
         FROM entities e
         JOIN documents d ON e.document_id = d.id
         WHERE d.topic_id = ?
         ORDER BY e.text`,
        [id]
      );

      // 获取所有关系作为边
      const relations = await db.all(
        `SELECT r.source_text, r.target_text, r.relation, r.confidence
         FROM relations r
         JOIN documents d ON r.document_id = d.id
         WHERE d.topic_id = ?`,
        [id]
      );

      const nodes = entities.map((e: any, idx: number) => ({
        id: `node_${idx}`,
        label: e.text,
        type: e.type
      }));

      const nodeMap = new Map(entities.map((e: any, idx: number) => [e.text.toLowerCase(), `node_${idx}`]));

      const links = relations
        .map((r: any) => {
          const sourceId = nodeMap.get(r.source_text.toLowerCase());
          const targetId = nodeMap.get(r.target_text.toLowerCase());
          if (sourceId && targetId) {
            return {
              source: sourceId,
              target: targetId,
              label: r.relation,
              confidence: r.confidence
            };
          }
          return null;
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      res.json({ nodes, links });
    } catch (error) {
      console.error("Failed to fetch topic graph:", error);
      res.status(500).json({ error: "Failed to fetch topic graph" });
    }
  });

  // ===== Graph Database API =====

  // Import graph service
  const { getGraphService } = await import('./src/services/graphService.js');
  const graphService = getGraphService();
  await graphService.init();

  console.log(`Graph database initialized with backend: ${graphService.getBackendType()}`);

  /**
   * GET /api/graph/status
   * 获取图数据库状态
   */
  app.get("/api/graph/status", async (req, res) => {
    try {
      const syncStatus = await graphService.getSyncStatus();
      res.json({
        backend: graphService.getBackendType(),
        ...syncStatus,
      });
    } catch (error) {
      console.error("Failed to get graph status:", error);
      res.status(500).json({ error: "Failed to get graph status" });
    }
  });

  /**
   * GET /api/graph/topic/:id
   * 获取主题图谱（节点和边）
   */
  app.get("/api/graph/topic/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const depth = Math.max(1, Math.min(10, parseInt(req.query.depth as string) || 2));

      const subgraph = await graphService.getTopicGraph(id, depth);

      // 转换为前端可用的格式
      const nodes = subgraph.nodes.map(n => ({
        id: n.id,
        label: n.properties.name || n.properties.title || n.id,
        type: n.label.toLowerCase(),
        properties: n.properties,
      }));

      const links = subgraph.relationships.map(r => ({
        id: r.id,
        source: r.from,
        target: r.to,
        label: r.type,
        properties: r.properties || {},
      }));

      res.json({ nodes, links });
    } catch (error) {
      console.error("Failed to get topic graph:", error);
      res.status(500).json({ error: "Failed to get topic graph" });
    }
  });

  /**
   * GET /api/graph/entity/:id
   * 获取实体详情和邻域
   */
  app.get("/api/graph/entity/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const neighborhood = await graphService.getEntityNeighborhood(id);

      if (!neighborhood) {
        return res.status(404).json({ error: "Entity not found" });
      }

      // 转换为前端可用的格式
      const nodes = [
        {
          id: neighborhood.entity.id,
          label: neighborhood.entity.properties.name || neighborhood.entity.id,
          type: neighborhood.entity.label.toLowerCase(),
          properties: neighborhood.entity.properties,
        },
        ...neighborhood.neighbors.map(n => ({
          id: n.node.id,
          label: n.node.properties.name || n.node.properties.title || n.node.id,
          type: n.node.label.toLowerCase(),
          properties: n.node.properties,
        })),
      ];

      const links = neighborhood.neighbors.map(n => ({
        id: n.relationship.id,
        source: n.relationship.from,
        target: n.relationship.to,
        label: n.relationship.type,
        properties: n.relationship.properties || {},
      }));

      res.json({
        entity: neighborhood.entity,
        neighbors: neighborhood.neighbors,
        graph: { nodes, links },
      });
    } catch (error) {
      console.error("Failed to get entity neighborhood:", error);
      res.status(500).json({ error: "Failed to get entity neighborhood" });
    }
  });

  /**
   * GET /api/graph/claims/:topicId
   * 查找主题相关的 Claims
   */
  app.get("/api/graph/claims/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const claims = await graphService.findClaimsByTopic(topicId);

      res.json({
        claims,
        count: claims.length,
      });
    } catch (error) {
      console.error("Failed to find claims:", error);
      res.status(500).json({ error: "Failed to find claims" });
    }
  });

  /**
   * GET /api/graph/related/:entityId
   * 查找相关实体
   */
  app.get("/api/graph/related/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      const depth = Math.max(1, Math.min(10, parseInt(req.query.depth as string) || 2));

      const entities = await graphService.findRelatedEntities(entityId, depth);

      res.json({
        entities,
        count: entities.length,
      });
    } catch (error) {
      console.error("Failed to find related entities:", error);
      res.status(500).json({ error: "Failed to find related entities" });
    }
  });

  // ===== Reports Read API =====

  // 创建 reports 表（补充索引）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      topic_name TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      status TEXT DEFAULT 'completed',
      generated_at TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reports_topic_id ON reports(topic_id);
    CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at DESC);
  `);

  /**
   * GET /api/reports
   * 获取报告列表
   */
  app.get("/api/reports", async (req, res) => {
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

      const rows = await db.all(query, params);

      const reports = rows.map((row: any) => {
        let parsedContent = row.content;
        let parsedMetadata = row.metadata;
        try { if (parsedContent) parsedContent = JSON.parse(parsedContent); } catch { /* keep raw string */ }
        try { if (parsedMetadata) parsedMetadata = JSON.parse(parsedMetadata); } catch { /* keep raw string */ }
        return { ...row, content: parsedContent, metadata: parsedMetadata };
      });

      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  /**
   * GET /api/reports/:id
   * 获取单个报告
   */
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM reports WHERE id = ?", [req.params.id]);

      if (!row) {
        return res.status(404).json({ error: "Report not found" });
      }

      let parsedContent = row.content;
      let parsedMetadata = row.metadata;
      try { if (parsedContent) parsedContent = JSON.parse(parsedContent); } catch { /* keep raw string */ }
      try { if (parsedMetadata) parsedMetadata = JSON.parse(parsedMetadata); } catch { /* keep raw string */ }
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
  app.delete("/api/reports/:id", async (req, res) => {
    try {
      const result = await db.run("DELETE FROM reports WHERE id = ?", [req.params.id]);
      if (!result.changes) { res.status(404).json({ error: "Report not found" }); return; }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ===== Report Pipeline API (v2) =====

  const { migrateReportTables } = await import('./src/services/reportService.js');
  await migrateReportTables(db);

  const { ReportReviewService } = await import('./src/services/reportReviewService.js');
  const { ReportGraphService } = await import('./src/services/reportGraphService.js');
  const reviewService = new ReportReviewService(db);
  const reportGraphService = new ReportGraphService(db);

  app.get("/api/reports/templates", async (_req, res) => {
    try {
      const rows = await db.all("SELECT * FROM report_templates WHERE is_active = 1");
      res.json(rows.map(r => ({
        ...r,
        structure: safeJsonParse(r.structure, {}),
        validation_rules: safeJsonParse(r.validation_rules, {}),
      })));
    } catch (error) {
      console.error("Failed to fetch templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // ── Report Type Configs ──
  app.get("/api/report-types", async (req, res) => {
    try {
      const { active } = req.query;
      let query = "SELECT * FROM report_type_configs";
      const params: any[] = [];
      if (active === '1' || active === 'true') {
        query += " WHERE is_active = 1";
      }
      query += " ORDER BY schedule, type";
      const rows = await db.all(query, params);
      res.json(rows.map((r: any) => ({
        ...r,
        review_config: r.review_config ? JSON.parse(r.review_config) : null,
        distribution_config: r.distribution_config ? JSON.parse(r.distribution_config) : null,
        trigger_rules: r.trigger_rules ? JSON.parse(r.trigger_rules) : null,
      })));
    } catch (error) {
      console.error("Failed to fetch report types:", error);
      res.status(500).json({ error: "Failed to fetch report types" });
    }
  });

  // ── Unified Report Generation ──
  const REPORT_TYPE_TO_SKILL: Record<string, string> = {
    daily: 'report-daily',
    weekly: 'report',
    monthly: 'report-monthly',
    quarterly: 'report-quarterly',
    tech_topic: 'report-tech-topic',
    competitor: 'report-competitor',
    alert: 'report-alert',
  };

  function computePeriod(reportType: string, period?: { start?: string; end?: string }) {
    const now = new Date();
    if (period?.start && period?.end) return period;
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    switch (reportType) {
      case 'daily': {
        const today = fmt(now);
        return { start: today, end: today };
      }
      case 'weekly': {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        return { start: fmt(weekAgo), end: fmt(now) };
      }
      case 'monthly': {
        const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const monthEnd = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        return { start: monthStart, end: monthEnd };
      }
      case 'quarterly': {
        const q = Math.floor(now.getMonth() / 3);
        const qStart = new Date(now.getFullYear(), q * 3, 1);
        const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
        return { start: fmt(qStart), end: fmt(qEnd) };
      }
      default: {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        return { start: fmt(weekAgo), end: fmt(now) };
      }
    }
  }

  app.post("/api/reports/generate", requireAdmin, async (req, res) => {
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
      if (!skillRegistry.get(skillName)) {
        res.status(400).json({ error: `Skill not found: ${skillName}. The skill file may not exist yet.` });
        return;
      }
      const topic = await db.get("SELECT id, name FROM topics WHERE id = ?", [topicId]);
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
          const orgs = JSON.parse(typeof topic.organizations === 'string' ? JSON.parse(topic.organizations) : []);
          params.competitorName = orgs[0] || "Pinecone";
        } catch {
          params.competitorName = "Pinecone";
        }
      }
      const { executionId, promise } = skillExecutor.startExecution(skillName, params);

      // Route report results through handleReportResult
      promise.then(async (execution) => {
        if (reportType === 'alert') {
          // Alerts skip review — direct insert
          await handleReportResult(execution, params);
        } else {
          await handleReportResult(execution, params);
        }
        ws.send(execution.id, 'result', JSON.stringify(execution.result ?? { error: execution.error }));
      }).catch((err) => {
        console.error(`[ReportGenerate] Error:`, err);
      });

      res.json({ executionId, skillName, reportType, period: computedPeriod, status: 'started' });
    } catch (error) {
      console.error("Failed to generate report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/reports/:id/reviews", async (req, res) => {
    try {
      const reviews = await reviewService.getReviews(req.params.id);
      res.json(reviews);
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  app.post("/api/reports/:id/reviews", async (req, res) => {
    try {
      const { reviewType, checklistResults, issues, comments, action } = req.body;
      const review = await reviewService.submitReview(
        req.params.id,
        req.body.reviewerId || 'system',
        reviewType,
        checklistResults,
        issues,
        comments,
        action
      );
      res.status(201).json(review);
    } catch (error) {
      console.error("Failed to submit review:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  app.get("/api/reports/:id/graph", async (req, res) => {
    try {
      const snapshot = await reportGraphService.getGraphSnapshot(req.params.id);
      res.json(snapshot);
    } catch (error) {
      console.error("Failed to get report graph:", error);
      res.status(500).json({ error: "Failed to get report graph" });
    }
  });

  app.get("/api/reports/:id/section/:sectionId/evidence", async (req, res) => {
    try {
      const evidence = await reportGraphService.getSectionEvidence(req.params.id, req.params.sectionId);
      res.json(evidence);
    } catch (error) {
      console.error("Failed to get section evidence:", error);
      res.status(500).json({ error: "Failed to get section evidence" });
    }
  });

  app.get("/api/reports/:id/evidence-path", async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        res.status(400).json({ error: "Missing 'from' or 'to' parameter" });
        return;
      }
      const path = await reportGraphService.findEvidencePath(req.params.id, from as string, to as string);
      if (!path) {
        res.status(404).json({ error: "Path not found" });
        return;
      }
      res.json(path);
    } catch (error) {
      console.error("Failed to find evidence path:", error);
      res.status(500).json({ error: "Failed to find evidence path" });
    }
  });

  app.post("/api/reports/:id/feedback", async (req, res) => {
    try {
      const { type, content } = req.body;
      const id = uuidv4();
      await db.run(
        `INSERT INTO report_feedback (id, report_id, user_id, feedback_type, content, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'new', ?)`,
        [id, req.params.id, req.body.userId || null, type, JSON.stringify(content), new Date().toISOString()]
      );
      res.status(201).json({ id, status: 'created' });
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/reports/:id/feedback", async (req, res) => {
    try {
      const rows = await db.all(
        "SELECT * FROM report_feedback WHERE report_id = ? ORDER BY created_at DESC",
        [req.params.id]
      );
      const feedback = rows.map(r => ({
        ...r,
        content: safeJsonParse(r.content, {}),
      }));

      const ratingRows = rows.filter(r => r.feedback_type === 'rating');
      const avgRating = ratingRows.length > 0
        ? ratingRows.reduce((sum, r) => sum + (safeJsonParse(r.content, {}).rating || 0), 0) / ratingRows.length
        : 0;

      res.json({
        feedback,
        stats: {
          averageRating: Math.round(avgRating * 10) / 10,
          totalFeedback: rows.length,
          byType: rows.reduce((acc, r) => {
            acc[r.feedback_type] = (acc[r.feedback_type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      });
    } catch (error) {
      console.error("Failed to fetch feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.post("/api/reports/:id/publish", async (req, res) => {
    try {
      const { publishedBy } = req.body;
      await db.run(
        `UPDATE reports SET status = 'published', review_status = 'approved', published_at = ?, published_by = ? WHERE id = ?`,
        [new Date().toISOString(), publishedBy || 'system', req.params.id]
      );
      res.json({ status: 'published' });
    } catch (error) {
      console.error("Failed to publish report:", error);
      res.status(500).json({ error: "Failed to publish report" });
    }
  });

  app.post("/api/reports/:id/versions", async (req, res) => {
    try {
      const { changeSummary, changedBy } = req.body;
      const report = await db.get("SELECT * FROM reports WHERE id = ?", [req.params.id]);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const latestVersion = await db.get(
        "SELECT version FROM report_versions WHERE report_id = ? ORDER BY created_at DESC LIMIT 1",
        [req.params.id]
      );

      let newVersion = '1.0.0';
      if (latestVersion) {
        const parts = latestVersion.version.split('.');
        if (parts.length === 3) {
          const patch = parseInt(parts[2]) + 1;
          newVersion = `${parts[0]}.${parts[1]}.${patch}`;
        }
      }

      const id = uuidv4();
      await db.run(
        `INSERT INTO report_versions (id, report_id, version, content, change_summary, changed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.params.id, newVersion, report.content, changeSummary || '', changedBy || 'system', new Date().toISOString()]
      );

      await db.run(
        `UPDATE reports SET version = ? WHERE id = ?`,
        [newVersion, req.params.id]
      );

      res.status(201).json({ id, version: newVersion });
    } catch (error) {
      console.error("Failed to create version:", error);
      res.status(500).json({ error: "Failed to create version" });
    }
  });

  app.get("/api/reports/:id/versions", async (req, res) => {
    try {
      const rows = await db.all(
        "SELECT id, version, change_summary, changed_by, created_at FROM report_versions WHERE report_id = ? ORDER BY created_at DESC",
        [req.params.id]
      );
      res.json(rows);
    } catch (error) {
      console.error("Failed to fetch versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  // ===== 配置管理 API =====

  const configPath = path.join(process.cwd(), "config.json");

  /**
   * GET /api/config
   * 获取当前配置
   */
  app.get("/api/config", requireAdmin, async (req, res) => {
    try {
      let config = {
        aiProvider: "openai",
        openaiApiKey: "",
        openaiBaseUrl: "https://api.openai.com/v1",
        openaiModel: "gpt-4o",
        geminiApiKey: "",
        geminiBaseUrl: "",
        geminiModel: "gemini-2.5-flash-preview",
        customApiKey: "",
        customBaseUrl: "",
        customModel: "",
        neo4jUri: "",
        neo4jUser: "",
        neo4jPassword: "",
      };

      // 从文件读取配置
      if (fs.existsSync(configPath)) {
        const fileContent = await fs.promises.readFile(configPath, "utf-8");
        config = { ...config, ...JSON.parse(fileContent) };
      }

      // 从环境变量读取（优先级更高）
      if (process.env.OPENAI_API_KEY) config.openaiApiKey = process.env.OPENAI_API_KEY;
      if (process.env.OPENAI_BASE_URL) config.openaiBaseUrl = process.env.OPENAI_BASE_URL;
      if (process.env.GEMINI_API_KEY) config.geminiApiKey = process.env.GEMINI_API_KEY;
      if (process.env.GEMINI_BASE_URL) config.geminiBaseUrl = process.env.GEMINI_BASE_URL;
      if (process.env.NEO4J_URI) config.neo4jUri = process.env.NEO4J_URI;
      if (process.env.NEO4J_USER) config.neo4jUser = process.env.NEO4J_USER;
      if (process.env.NEO4J_PASSWORD) config.neo4jPassword = process.env.NEO4J_PASSWORD;

      // Mask sensitive fields before sending to client
      const mask = (val: string | undefined) => {
        if (!val || val.length <= 4) return val ? '****' : '';
        return '****' + val.slice(-4);
      };
      res.json({
        aiProvider: config.aiProvider,
        openaiBaseUrl: config.openaiBaseUrl,
        openaiModel: config.openaiModel,
        openaiApiKey: mask(config.openaiApiKey),
        geminiBaseUrl: config.geminiBaseUrl,
        geminiModel: config.geminiModel,
        geminiApiKey: mask(config.geminiApiKey),
        customBaseUrl: config.customBaseUrl,
        customModel: config.customModel,
        customApiKey: mask(config.customApiKey),
        neo4jUri: config.neo4jUri,
        neo4jUser: config.neo4jUser,
        neo4jPassword: mask(config.neo4jPassword),
      });
    } catch (error) {
      console.error("Failed to load config:", error);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * POST /api/config
   * 保存配置
   */
  app.post("/api/config", requireAdmin, async (req, res) => {
    try {
      const payload = req.body ?? {};
      let config: any = {};
      if (fs.existsSync(configPath)) {
        const raw = await fs.promises.readFile(configPath, "utf-8");
        config = JSON.parse(raw);
      }

      const allowList = [
        "aiProvider",
        "openaiApiKey",
        "openaiBaseUrl",
        "openaiModel",
        "geminiApiKey",
        "geminiBaseUrl",
        "geminiModel",
        "customApiKey",
        "customBaseUrl",
        "customModel",
        "neo4jUri",
        "neo4jUser",
        "neo4jPassword",
      ];

      for (const key of allowList) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          config[key] = payload[key];
        }
      }

      // 保存到文件
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

      // 设置环境变量（用于当前进程）
      if (Object.prototype.hasOwnProperty.call(payload, "openaiApiKey")) process.env.OPENAI_API_KEY = String(payload.openaiApiKey ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "openaiBaseUrl")) process.env.OPENAI_BASE_URL = String(payload.openaiBaseUrl ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "geminiApiKey")) process.env.GEMINI_API_KEY = String(payload.geminiApiKey ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "geminiBaseUrl")) process.env.GEMINI_BASE_URL = String(payload.geminiBaseUrl ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "neo4jUri")) process.env.NEO4J_URI = String(payload.neo4jUri ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "neo4jUser")) process.env.NEO4J_USER = String(payload.neo4jUser ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "neo4jPassword")) process.env.NEO4J_PASSWORD = String(payload.neo4jPassword ?? "");

      res.json({ success: true, message: "配置已保存" });
    } catch (error) {
      console.error("Failed to save config:", error);
      res.status(500).json({ error: "Failed to save config" });
    }
  });

  // ===== Skill Execution System (must be before Vite middleware) =====
  const skillRegistry = new SkillRegistry();
  skillRegistry.loadAll(path.resolve(process.cwd(), '.claude/skills'));

  // Startup version auto-registration
  const skillsDir = path.resolve(process.cwd(), '.claude/skills');
  for (const skill of skillRegistry.listDetailed()) {
    // Check if current version exists in skill_versions
    const existing = await db.get(
      "SELECT id FROM skill_versions WHERE skill_name = ? AND version = ?",
      [skill.name, skill.version]
    );

    if (!existing) {
      // Read the current file content
      const filePath = path.join(skillsDir, `${skill.name}.md`);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Insert initial version record
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

  // List available skills (enriched with displayName, version, category)
  app.get("/api/skills", (_req, res) => {
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
  app.get("/api/skills/:name", (req, res) => {
    const { name } = req.params;
    const skill = skillRegistry.getDetail(name);
    if (!skill) {
      return res.status(404).json({ error: `Skill not found: ${name}` });
    }
    res.json(skill);
  });

  // Get skill version history
  app.get("/api/skills/:name/versions", async (req, res) => {
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
  app.post("/api/skills/:name/versions", requireAdmin, async (req, res) => {
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

      // Get latest version number and increment
      const latest = await db.get(
        "SELECT version FROM skill_versions WHERE skill_name = ? ORDER BY created_at DESC LIMIT 1",
        [name]
      );

      let newVersion = "1.0.0";
      if (latest) {
        // Simple patch version increment
        const parts = latest.version.split('.');
        if (parts.length === 3) {
          const patch = parseInt(parts[2]) + 1;
          newVersion = `${parts[0]}.${parts[1]}.${patch}`;
        }
      }

      // Read current file content
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
  app.post("/api/skills/:name/restore/:version", requireAdmin, async (req, res) => {
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

      // Write content to file
      const filePath = path.join(skillsDir, `${name}.md`);
      fs.writeFileSync(filePath, versionRecord.content, 'utf-8');

      // Reload the skill registry
      skillRegistry.loadAll(skillsDir);

      res.json({ success: true, message: `Restored ${name} to version ${version}` });
    } catch (error) {
      console.error("Failed to restore skill version:", error);
      res.status(500).json({ error: "Failed to restore skill version" });
    }
  });

  // Get optimization config
  app.get("/api/skills/:name/optimization/config", async (req, res) => {
    try {
      const { name } = req.params;
      const config = await db.get(
        "SELECT * FROM optimization_configs WHERE skill_name = ?",
        [name]
      );

      if (!config) {
        // Return defaults
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
  app.put("/api/skills/:name/optimization/config", requireAdmin, async (req, res) => {
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
            id,
            name,
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
  app.get("/api/skills/:name/optimization/history", async (req, res) => {
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

  // ── Helpers for robust report JSON extraction ──
  function tryParseReportJson(str: string): any {
    if (!str || typeof str !== 'string') return null;
    let cleaned = str.trim();
    const fm = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fm) cleaned = fm[1].trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    let candidate = cleaned.slice(first, last + 1);

    // Strategy: try multiple repair levels
    const repairs = [
      // Level 0: direct parse
      candidate,
      // Level 1: trailing commas + control chars
      candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\t/g, '\\t')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''),
      // Level 2: line-based newline escaping inside strings
      (() => {
        const lines = candidate.split('\n');
        const fixed: string[] = [];
        let inStr = false;
        for (const line of lines) {
          const qc = (line.match(/(?<!\\)"/g) || []).length;
          if (!inStr) {
            fixed.push(line);
            if (qc % 2 === 1) inStr = true;
          } else {
            fixed.push('\\n' + line);
            if (qc % 2 === 1) inStr = false;
          }
        }
        return fixed.join('\n')
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/\t/g, '\\t');
      })(),
      // Level 3: aggressive — escape ALL newlines that look like they're inside strings
      candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\t/g, '\\t')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
        // Replace literal newlines inside JSON string values
        .split('\n').map((line, i, arr) => {
          // Count open quotes up to this line
          const soFar = arr.slice(0, i + 1).join('').replace(/\\"/g, '');
          const quoteCount = (soFar.match(/"/g) || []).length;
          // If odd number of quotes, we're inside a string
          if (quoteCount % 2 === 1 && i > 0) return '\\n' + line;
          return line;
        }).join(''),
    ];

    for (const repaired of repairs) {
      try {
        const obj = JSON.parse(repaired);
        if (obj && typeof obj === 'object') return obj;
      } catch { /* try next repair */ }
    }

    // Last resort: find the deepest nested JSON with "title" or "sections"
    const titleIdx = candidate.indexOf('"title"');
    if (titleIdx > -1) {
      // Walk back to find enclosing {
      let depth = 0, start = -1;
      for (let i = titleIdx; i >= 0; i--) {
        if (candidate[i] === '}') depth++;
        if (candidate[i] === '{') { depth--; if (depth < 0) { start = i; break; } }
      }
      if (start >= 0) {
        for (const repaired of repairs.slice(0, 3)) {
          const sub = repaired.slice(start);
          const lastBrace = sub.lastIndexOf('}');
          if (lastBrace > 0) {
            try {
              const obj = JSON.parse(sub.slice(0, lastBrace + 1));
              if (obj && typeof obj === 'object') return obj;
            } catch { /* continue */ }
          }
        }
      }
    }

    return null;
  }

  function extractReportFromStdout(stdout: string): any {
    if (!stdout) return null;
    const clean = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const lines = clean.split('\n');

    // Strategy 1: Scan stream-json "result" lines from end
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result' && parsed.result) {
          const resultStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
          const report = tryParseReportJson(resultStr);
          if (report) return report;
        }
      } catch { /* not a JSON line */ }
    }

    // Strategy 2: Scan assistant text blocks for report JSON
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || !line.includes('"sections"')) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'assistant' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              const report = tryParseReportJson(block.text);
              if (report) return report;
            }
          }
        }
      } catch { /* not a JSON line */ }
    }

    // Strategy 3: Brute-force — find "sections" key and extract enclosing JSON
    const sectionsIdx = clean.indexOf('"sections"');
    if (sectionsIdx > -1) {
      let braceCount = 0, start = -1;
      for (let i = sectionsIdx; i >= 0; i--) {
        if (clean[i] === '}') braceCount++;
        if (clean[i] === '{') { braceCount--; if (braceCount < 0) { start = i; break; } }
      }
      if (start >= 0) {
        braceCount = 0;
        for (let i = start; i < clean.length; i++) {
          if (clean[i] === '{') braceCount++;
          if (clean[i] === '}') { braceCount--; if (braceCount === 0) {
            const report = tryParseReportJson(clean.slice(start, i + 1));
            if (report) return report;
            break;
          } }
        }
      }
    }
    return null;
  }

  // ── Extracted report persistence handler (shared by HTTP endpoint & scheduler) ──
  async function handleReportResult(execution: SkillExecution, params: Record<string, any>) {
    try {
      const envelope = execution.result ?? {};
      let rawOutput = envelope.result ?? envelope.raw ?? envelope;

      let parsed: any;
      if (typeof rawOutput === 'string') {
        let cleaned = rawOutput.trim();
        const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenceMatch) cleaned = fenceMatch[1].trim();
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          console.error('[Report] Failed to parse Claude output as JSON');
          parsed = {};
        }
      } else if (typeof rawOutput === 'object' && rawOutput !== null) {
        parsed = rawOutput;
      } else {
        parsed = {};
      }

      // Fallback: scan raw stdout for report JSON when primary parsing yields nothing useful
      const hasReportStructure = (obj: any): boolean =>
        obj && typeof obj === 'object' && (
          Array.isArray(obj.sections) ||
          (obj.content && Array.isArray(obj.content.sections)) ||
          Array.isArray(obj.keyUpdates) ||
          Array.isArray(obj.alerts) ||
          obj.alertSummary ||
          obj.technologyOverview ||
          obj.companyProfile ||
          obj.swotAnalysis ||
          obj.monthlyOverview ||
          obj.strategicExecution ||
          obj.title ||
          obj.summary ||
          (obj.content && (obj.content.keyUpdates || obj.content.alertSummary || obj.content.swotAnalysis))
        );
      if (!hasReportStructure(parsed)) {
        console.log('[Report] Primary parsing empty, scanning stdout for report JSON...');
        const report = extractReportFromStdout(execution.stdout);
        if (report) {
          parsed = report;
          console.log('[Report] Recovered report JSON from stdout fallback');
        }
      }

      const content = parsed.content ?? parsed;
      const meta = content.meta ?? {};
      const reportType = params.reportType ?? parsed.type ?? meta.type ?? 'weekly';

      // ── Multi-type report normalization ──
      // All report types are normalized to { executiveSummary, sections, timeline, metrics }
      let normalizedContent: any;

      if (reportType === 'daily' && (content.keyUpdates || content.dataHighlights || content.alerts)) {
        // Daily report format
        normalizedContent = {
          executiveSummary: {
            overview: parsed.summary ?? content.summary ?? '',
            keyPoints: (content.keyUpdates ?? []).map((u: any) =>
              typeof u === 'object' ? `[${u.type ?? 'update'}] ${u.title}: ${u.summary ?? ''}` : String(u)
            ),
            confidence: meta.confidence ?? 'low',
            period: meta.period ?? { start: params.timeRangeStart, end: params.timeRangeEnd },
          },
          sections: [
            ...(content.keyUpdates?.length ? [{
              id: 'key_updates', title: '关键更新', thesis: `检测到 ${content.keyUpdates.length} 条重要更新`,
              content: content.keyUpdates.map((u: any) => `**${u.title}** (${u.significance ?? '中'}影响): ${u.summary ?? ''}`).join('\n'),
              highlights: content.keyUpdates.map((u: any) => u.title),
              signals: content.keyUpdates.map((u: any) => ({ type: u.type ?? 'trend', title: u.title, description: u.summary ?? '', confidence: 0.7 })),
              entityRefs: [],
            }] : []),
            ...(content.dataHighlights ? [{
              id: 'data_highlights', title: '数据亮点', thesis: '24h 数据采集概况',
              content: [
                content.dataHighlights.documentsAdded?.length ? `新增文档: ${content.dataHighlights.documentsAdded.join('; ')}` : '',
                content.dataHighlights.topEntities?.length ? `高频实体: ${content.dataHighlights.topEntities.join(', ')}` : '',
              ].filter(Boolean).join('\n'),
              highlights: [...(content.dataHighlights.documentsAdded ?? []), ...(content.dataHighlights.topEntities ?? [])],
              signals: [], entityRefs: content.dataHighlights.topEntities ?? [],
            }] : []),
            ...(content.alerts?.length ? [{
              id: 'alerts', title: '预警信号', thesis: `检测到 ${content.alerts.length} 条预警`,
              content: content.alerts.map((a: any) => `**[${a.alertType ?? 'alert'}]** ${a.title}: ${a.description ?? ''}\n建议: ${a.recommendedAction ?? ''}`).join('\n\n'),
              highlights: content.alerts.map((a: any) => a.title),
              signals: content.alerts.map((a: any) => ({ type: 'threat', title: a.title, description: a.description ?? '', confidence: 0.7 })),
              entityRefs: [],
            }] : []),
          ],
          timeline: (content.dataHighlights?.eventsTimeline ?? []).map((e: any) => ({
            date: e.time ?? params.timeRangeStart, event: e.event ?? String(e), significance: '', entityRefs: [],
          })),
          metrics: meta.dataCoverage ?? {},
        };
      } else if (reportType === 'alert' && (content.alertSummary || content.eventAnalysis)) {
        // Alert report format
        const alert = content.alertSummary ?? {};
        normalizedContent = {
          executiveSummary: {
            overview: `${alert.title ?? '预警报告'}: ${alert.description ?? parsed.summary ?? ''}`,
            keyPoints: [alert.title ?? '预警'].filter(Boolean),
            confidence: alert.confidence ?? 'medium',
            period: meta.period ?? {},
          },
          sections: [
            ...(content.eventAnalysis ? [{
              id: 'event_analysis', title: '事件分析', thesis: '事件经过与上下文',
              content: [content.eventAnalysis.what, content.eventAnalysis.who, content.eventAnalysis.timeline, content.eventAnalysis.context].filter(Boolean).join('\n\n'),
              highlights: [content.eventAnalysis.what, content.eventAnalysis.who].filter(Boolean),
              signals: [], entityRefs: content.entityRefs ?? [],
            }] : []),
            ...(content.impactAssessment ? [{
              id: 'impact', title: '影响评估', thesis: `影响范围: ${content.impactAssessment.scope ?? '待评估'}`,
              content: `范围: ${content.impactAssessment.scope ?? '-'}\n程度: ${content.impactAssessment.magnitude ?? '-'}\n紧迫性: ${content.impactAssessment.urgency ?? '-'}`,
              highlights: content.impactAssessment.affectedAreas ?? [],
              signals: [{ type: alert.severity === 'critical' ? 'threat' : 'trend', title: alert.title ?? '预警', description: alert.description ?? '', confidence: alert.confidence ?? 0.7 }],
              entityRefs: [],
            }] : []),
            ...(content.recommendedActions?.length ? [{
              id: 'actions', title: '建议行动', thesis: `${content.recommendedActions.length} 条建议行动`,
              content: content.recommendedActions.map((a: any) => `[${a.priority ?? '中'}] ${a.action}${a.timeline ? ` (${a.timeline})` : ''}: ${a.rationale ?? ''}`).join('\n'),
              highlights: content.recommendedActions.map((a: any) => a.action),
              signals: [], entityRefs: [],
            }] : []),
          ],
          timeline: [],
          metrics: {},
        };
      } else {
        // Weekly/monthly/quarterly/tech-topic/competitor — standard format with sections
        const execSummary = content.executiveSummary ?? {};
        const rawKeyPoints = execSummary.keyPoints ?? [];
        const normalizedKeyPoints = rawKeyPoints.map((kp: any) =>
          typeof kp === 'object' ? (kp.point ?? kp.text ?? JSON.stringify(kp)) : String(kp)
        );

        normalizedContent = {
          executiveSummary: {
            overview: execSummary.overview ?? content.monthlyOverview ?? content.summary ?? parsed.summary ?? '',
            keyPoints: normalizedKeyPoints,
            confidence: execSummary.confidence ?? meta.confidence ?? 'medium',
            period: execSummary.period ?? meta.period ?? {},
          },
          sections: content.sections ?? [],
          timeline: content.timeline ?? [],
          metrics: content.metrics ?? {},
        };

        // Handle monthly report specific fields — convert to sections if no sections exist
        if (reportType === 'monthly' && !content.sections?.length) {
          const monthlySections: any[] = [];
          if (content.technologyTrends?.length) monthlySections.push({
            id: 'tech_trends', title: '技术趋势', thesis: '技术发展趋势分析',
            content: content.technologyTrends.map((t: any) => `${t.trend} (${t.direction}, ${t.changeRate ?? '-'}): ${(t.keyDrivers ?? []).join(', ')}`).join('\n'),
            highlights: content.technologyTrends.map((t: any) => t.trend), signals: [], entityRefs: [],
          });
          if (content.competitiveLandscape) monthlySections.push({
            id: 'competitive', title: '竞争格局', thesis: '竞争格局变化分析',
            content: JSON.stringify(content.competitiveLandscape, null, 2),
            highlights: [], signals: [], entityRefs: [],
          });
          if (content.riskAssessment?.length) monthlySections.push({
            id: 'risk', title: '风险评估', thesis: '风险与机遇',
            content: content.riskAssessment.map((r: any) => `[${r.probability}/${r.impact}] ${r.risk}: ${r.mitigation ?? ''}`).join('\n'),
            highlights: content.riskAssessment.map((r: any) => r.risk), signals: [], entityRefs: [],
          });
          if (content.nextMonthOutlook) monthlySections.push({
            id: 'outlook', title: '下月展望', thesis: '未来关注重点',
            content: (content.nextMonthOutlook.focusAreas ?? []).join('\n'),
            highlights: content.nextMonthOutlook.focusAreas ?? [], signals: [], entityRefs: [],
          });
          normalizedContent.sections = monthlySections;
          normalizedContent.executiveSummary.overview = normalizedContent.executiveSummary.overview || content.monthlyOverview || '';
        }

        // Handle tech-topic report fields
        if (reportType === 'tech_topic' && !content.sections?.length) {
          const sections: any[] = [];
          if (content.technologyOverview) sections.push({
            id: 'tech_overview', title: '技术概述', thesis: `${content.technologyOverview.definition ?? ''}`,
            content: `原理: ${(content.technologyOverview.corePrinciples ?? []).join(', ')}\n组件: ${(content.technologyOverview.keyComponents ?? []).join(', ')}\n领域: ${(content.technologyOverview.applicationDomains ?? []).join(', ')}`,
            highlights: content.technologyOverview.keyComponents ?? [], signals: [], entityRefs: [],
          });
          if (content.competitiveLandscape?.competitiveMatrix) sections.push({
            id: 'competitive', title: '竞争格局', thesis: '竞争矩阵分析',
            content: content.competitiveLandscape.competitiveMatrix.map((p: any) => `${p.player}: 优势[${(p.strengths ?? []).join(',')}] 劣势[${(p.weaknesses ?? []).join(',')}]`).join('\n'),
            highlights: [], signals: [], entityRefs: [],
          });
          if (content.riskOpportunity) sections.push({
            id: 'risk_opp', title: '风险与机遇', thesis: '风险评估与机会识别',
            content: `风险: ${(content.riskOpportunity.risks ?? []).map((r: any) => r.risk).join('; ')}\n机遇: ${(content.riskOpportunity.opportunities ?? []).map((o: any) => o.opportunity).join('; ')}`,
            highlights: [], signals: [], entityRefs: [],
          });
          normalizedContent.sections = sections;
        }

        // Handle competitor report fields
        if (reportType === 'competitor' && !content.sections?.length) {
          const sections: any[] = [];
          if (content.companyProfile) sections.push({
            id: 'profile', title: '公司概况', thesis: content.companyProfile.basicInfo?.name ?? params.competitorName ?? '',
            content: JSON.stringify(content.companyProfile, null, 2), highlights: [], signals: [], entityRefs: [],
          });
          if (content.swotAnalysis) sections.push({
            id: 'swot', title: 'SWOT 分析', thesis: '优势/劣势/机遇/威胁',
            content: `优势: ${(content.swotAnalysis.strengths ?? []).map((s: any) => s.strength ?? s).join('; ')}\n劣势: ${(content.swotAnalysis.weaknesses ?? []).map((w: any) => w.weakness ?? w).join('; ')}\n机遇: ${(content.swotAnalysis.opportunities ?? []).map((o: any) => o.opportunity ?? o).join('; ')}\n威胁: ${(content.swotAnalysis.threats ?? []).map((t: any) => t.threat ?? t).join('; ')}`,
            highlights: [], signals: [], entityRefs: [],
          });
          if (content.competitiveAssessment) sections.push({
            id: 'assessment', title: '竞争评估', thesis: `威胁等级: ${content.competitiveAssessment.threatLevel ?? '-'}`,
            content: `威胁领域: ${(content.competitiveAssessment.threatAreas ?? []).join(', ')}\n建议: ${(content.competitiveAssessment.recommendedResponse ?? []).map((r: any) => r.action).join('; ')}`,
            highlights: content.competitiveAssessment.threatAreas ?? [], signals: [], entityRefs: [],
          });
          normalizedContent.sections = sections;
        }
      }

      const hasSubstantialContent = (normalizedContent.sections?.length ?? 0) > 0
        || (normalizedContent.executiveSummary.overview?.length ?? 0) > 50;
      const rawStr = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
      if (!hasSubstantialContent && rawStr.length > 100) {
        const lastFenceEnd = rawStr.lastIndexOf('```');
        const markdownBody = lastFenceEnd > 0 ? rawStr.slice(lastFenceEnd + 3).trim() : rawStr;
        const overviewLine = rawStr.split('\n').find((l: string) =>
          l.trim().length > 20 && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('{')
        );
        normalizedContent.executiveSummary.overview = overviewLine ?? '';
        normalizedContent.sections = [{
          id: 'raw_report',
          title: '完整报告',
          thesis: '',
          content: markdownBody,
          highlights: [],
          signals: [],
          entityRefs: [],
        }];
      }

      const title = parsed.title ?? `${params.topicName ?? ''} 分析报告`;
      const summary = parsed.summary ?? normalizedContent.executiveSummary.overview ?? '';
      const period = normalizedContent.executiveSummary.period ?? {};
      const rptId = `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log('[Report] Parsed report:', {
        title,
        hasSummary: !!summary,
        sectionsCount: normalizedContent.sections.length,
        timelineCount: normalizedContent.timeline.length,
        confidence: normalizedContent.executiveSummary.confidence,
      });

      const docCount = await db.get(
        "SELECT COUNT(*) as count FROM documents WHERE topic_id = ?",
        [params.topicId]
      );
      const entityCount = await db.get(
        `SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?`,
        [params.topicId]
      );

      await db.run(
        `INSERT INTO reports (id, topic_id, topic_name, type, title, summary, content, status, generated_at, period_start, period_end, metadata, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 'pending')`,
        [
          rptId,
          params.topicId ?? null,
          params.topicName ?? params.topicContext ?? '',
          params.reportType ?? 'weekly',
          title,
          summary,
          JSON.stringify(normalizedContent),
          new Date().toISOString(),
          period.start ?? null,
          period.end ?? null,
          JSON.stringify({
            executionId: execution.id,
            documentCount: docCount?.count || 0,
            entityCount: entityCount?.count || 0,
            ...(parsed.metadata ?? meta)
          }),
        ]
      );
      console.log(`[Report] Saved report ${rptId} for topic ${params.topicId}`);

      try {
        const autoReview = await reviewService.createAutoReview(rptId, normalizedContent, {
          documentCount: docCount?.count || 0,
          entityCount: entityCount?.count || 0,
        });
        console.log(`[Report] Auto review completed: ${autoReview.status}`);
      } catch (reviewErr) {
        console.error('[Report] Auto review failed:', reviewErr);
      }

      if (params.topicId && normalizedContent.sections) {
        try {
          const links = await reportGraphService.buildGraphLinks(rptId, params.topicId, normalizedContent);
          console.log(`[Report] Built ${links.length} graph links`);
        } catch (graphErr) {
          console.error('[Report] Failed to build graph links:', graphErr);
        }
      }
    } catch (err) {
      console.error('[Report] Failed to persist report:', err);
    }
  }

  // ── Scheduler ──
  let schedulerConfig: { schedulerEnabled?: boolean; schedulerCheckIntervalMinutes?: number } = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = await fs.promises.readFile(configPath, 'utf-8');
      schedulerConfig = JSON.parse(raw);
    }
  } catch { /* use defaults */ }
  const scheduler = new SchedulerService({
    enabled: schedulerConfig.schedulerEnabled ?? false,
    checkIntervalMinutes: schedulerConfig.schedulerCheckIntervalMinutes ?? 30,
  });
  scheduler.setDb(db);
  scheduler.setStartExecution(skillExecutor.startExecution.bind(skillExecutor));
  scheduler.setReportHandler(handleReportResult);

  // Trigger a skill execution
  app.post("/api/skill/:name", requireAdmin, async (req, res) => {
    const { name } = req.params;
    const params = req.body ?? {};

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
        await handleReportResult(execution, params);
      }

      ws.send(execution.id, 'result', JSON.stringify(execution.result ?? { error: execution.error }));
    }).catch((err) => {
      console.error(`[SkillExecutor] Error executing ${name}:`, err);
    });

    res.json({ executionId, skillName: name, status: 'started' });
  });

  // Get progress lines for an execution (poll-based, reliable)
  app.get("/api/skill/:id/progress", (req, res) => {
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
  app.get("/api/skill/:id/status", async (req, res) => {
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

  // List execution history
  app.get("/api/skill/executions", async (_req, res) => {
    try {
      const rows = await db.all(
        "SELECT id, skill_name, params, status, started_at, completed_at, result, error FROM skill_executions ORDER BY started_at DESC LIMIT 50"
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
  app.get("/api/skill/executions/:id", async (req, res) => {
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
  app.post("/api/skill/:id/cancel", (req, res) => {
    try {
      const { id } = req.params;
      const cancelled = skillExecutor.cancel(id);
      res.json({ cancelled });
    } catch (error) {
      console.error("Failed to cancel execution:", error);
      res.status(500).json({ error: "Failed to cancel execution" });
    }
  });

  // ===== Scheduler API =====

  /**
   * GET /api/scheduler/status
   * 获取调度器状态
   */
  app.get("/api/scheduler/status", async (_req, res) => {
    try {
      const status = scheduler.getStatus();
      status.pendingTopics = await scheduler.getPendingTopics();
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
  app.post("/api/scheduler/toggle", async (req, res) => {
    try {
      const { enabled, checkIntervalMinutes } = req.body;

      const newConfig: any = {};
      if (typeof enabled === 'boolean') newConfig.enabled = enabled;
      if (typeof checkIntervalMinutes === 'number') newConfig.checkIntervalMinutes = checkIntervalMinutes;

      scheduler.restart(newConfig);

      // Persist to config.json
      try {
        let existing: any = {};
        if (fs.existsSync(configPath)) {
          existing = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        }
        if (newConfig.enabled !== undefined) existing.schedulerEnabled = newConfig.enabled;
        if (newConfig.checkIntervalMinutes !== undefined) existing.schedulerCheckIntervalMinutes = newConfig.checkIntervalMinutes;
        await fs.promises.writeFile(configPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (cfgErr) {
        console.error('[Scheduler] Failed to persist config:', cfgErr);
      }

      res.json({ success: true, config: scheduler.getConfig() });
    } catch (error) {
      console.error("Failed to toggle scheduler:", error);
      res.status(500).json({ error: "Failed to toggle scheduler" });
    }
  });

  // ===== Vite middleware for development (must be last) =====
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    // Start scheduler if enabled
    scheduler.start();
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    scheduler.stop();
    httpServer.close(() => {
      console.log('HTTP server closed');
      db.close().then(() => {
        console.log('Database closed');
        process.exit(0);
      });
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error('Forcing exit after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(console.error);
