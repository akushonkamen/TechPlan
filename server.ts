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
import { SkillWebSocket } from "./src/websocket.js";

// 配置文件上传（使用内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

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
        aliases: JSON.parse(row.aliases || "[]"),
        keywords: JSON.parse(row.keywords || "[]"),
        organizations: JSON.parse(row.organizations || "[]")
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
      await db.run("DELETE FROM topics WHERE id = ?", [req.params.id]);
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
          aliases: JSON.parse(row.aliases || "[]"),
          keywords: JSON.parse(row.keywords || "[]"),
          organizations: JSON.parse(row.organizations || "[]")
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
        metadata: row.metadata ? JSON.parse(row.metadata) : null
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
        metadata: row.metadata ? JSON.parse(row.metadata) : null
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
        metadata: row.metadata ? JSON.parse(row.metadata) : null
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
        metadata: created.metadata ? JSON.parse(created.metadata) : null
      };
      res.status(201).json(document);
    } catch (error) {
      console.error("Failed to create document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      await db.run("DELETE FROM documents WHERE id = ?", [req.params.id]);
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
        metadata: e.metadata ? JSON.parse(e.metadata) : null
      }));
      const parsedEvents = events.map((e: any) => ({
        ...e,
        participants: e.participants ? JSON.parse(e.participants) : []
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
        metadata: e.metadata ? JSON.parse(e.metadata) : null
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
      const depth = req.query.depth ? parseInt(req.query.depth as string) : 2;

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
      const depth = req.query.depth ? parseInt(req.query.depth as string) : 2;

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

      const reports = rows.map((row: any) => ({
        ...row,
        content: row.content ? JSON.parse(row.content) : null,
        metadata: row.metadata ? JSON.parse(row.metadata) : null
      }));

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

      const report = {
        ...row,
        content: row.content ? JSON.parse(row.content) : null,
        metadata: row.metadata ? JSON.parse(row.metadata) : null
      };

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
      await db.run("DELETE FROM reports WHERE id = ?", [req.params.id]);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ===== 配置管理 API =====

  const configPath = path.join(process.cwd(), "config.json");

  /**
   * GET /api/config
   * 获取当前配置
   */
  app.get("/api/config", async (req, res) => {
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

      // 返回完整配置（本地开发环境，直接返回完整 key）
      // 生产环境应该使用 session/cookie 来保护敏感信息
      res.json({
        aiProvider: config.aiProvider,
        openaiBaseUrl: config.openaiBaseUrl,
        openaiModel: config.openaiModel,
        openaiApiKey: config.openaiApiKey || "",
        geminiBaseUrl: config.geminiBaseUrl,
        geminiModel: config.geminiModel,
        geminiApiKey: config.geminiApiKey || "",
        customBaseUrl: config.customBaseUrl,
        customModel: config.customModel,
        customApiKey: config.customApiKey || "",
        neo4jUri: config.neo4jUri,
        neo4jUser: config.neo4jUser,
        neo4jPassword: config.neo4jPassword || "",
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
  app.post("/api/config", async (req, res) => {
    try {
      const {
        aiProvider,
        openaiApiKey,
        openaiBaseUrl,
        openaiModel,
        geminiApiKey,
        geminiBaseUrl,
        geminiModel,
        customApiKey,
        customBaseUrl,
        customModel,
        neo4jUri,
        neo4jUser,
        neo4jPassword,
      } = req.body;

      const config: any = {};

      if (aiProvider) config.aiProvider = aiProvider;
      if (openaiApiKey) config.openaiApiKey = openaiApiKey;
      if (openaiBaseUrl) config.openaiBaseUrl = openaiBaseUrl;
      if (openaiModel) config.openaiModel = openaiModel;
      if (geminiApiKey) config.geminiApiKey = geminiApiKey;
      if (geminiBaseUrl) config.geminiBaseUrl = geminiBaseUrl;
      if (geminiModel) config.geminiModel = geminiModel;
      if (customApiKey) config.customApiKey = customApiKey;
      if (customBaseUrl) config.customBaseUrl = customBaseUrl;
      if (customModel) config.customModel = customModel;
      if (neo4jUri) config.neo4jUri = neo4jUri;
      if (neo4jUser) config.neo4jUser = neo4jUser;
      if (neo4jPassword) config.neo4jPassword = neo4jPassword;

      // 保存到文件
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

      // 设置环境变量（用于当前进程）
      if (openaiApiKey) process.env.OPENAI_API_KEY = openaiApiKey;
      if (openaiBaseUrl) process.env.OPENAI_BASE_URL = openaiBaseUrl;
      if (geminiApiKey) process.env.GEMINI_API_KEY = geminiApiKey;
      if (geminiBaseUrl) process.env.GEMINI_BASE_URL = geminiBaseUrl;
      if (neo4jUri) process.env.NEO4J_URI = neo4jUri;
      if (neo4jUser) process.env.NEO4J_USER = neo4jUser;
      if (neo4jPassword) process.env.NEO4J_PASSWORD = neo4jPassword;

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
  app.post("/api/skills/:name/versions", async (req, res) => {
    try {
      const { name } = req.params;
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
  app.post("/api/skills/:name/restore/:version", async (req, res) => {
    try {
      const { name, version } = req.params;

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
  app.put("/api/skills/:name/optimization/config", async (req, res) => {
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

      res.json({ success: true });
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

  // Trigger a skill execution
  app.post("/api/skill/:name", async (req, res) => {
    const { name } = req.params;
    const params = req.body ?? {};

    if (!skillRegistry.get(name)) {
      res.status(404).json({ error: `Skill not found: ${name}` });
      return;
    }

    const { executionId, promise } = skillExecutor.startExecution(name, params);

    promise.then(async (execution) => {
      ws.send(execution.id, 'result', JSON.stringify(execution.result ?? { error: execution.error }));
    }).catch((err) => {
      console.error(`[SkillExecutor] Error executing ${name}:`, err);
    });

    res.json({ executionId, skillName: name, status: 'started' });
  });

  // Get progress lines for an execution (poll-based, reliable)
  app.get("/api/skill/:id/progress", (req, res) => {
    const { id } = req.params;
    const afterParam = parseInt(req.query.after as string) || 0;
    const lines = skillExecutor.getProgress(id);
    res.json({
      lines: lines.slice(afterParam),
      total: lines.length,
    });
  });

  // Check skill execution status
  app.get("/api/skill/:id/status", async (req, res) => {
    const { id } = req.params;
    const row = await db.get("SELECT * FROM skill_executions WHERE id = ?", [id]);
    if (!row) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }
    res.json(row);
  });

  // List execution history
  app.get("/api/skill/executions", async (_req, res) => {
    const rows = await db.all(
      "SELECT id, skill_name, status, started_at, completed_at, error FROM skill_executions ORDER BY started_at DESC LIMIT 50"
    );
    res.json(rows);
  });

  // Cancel a running skill
  app.post("/api/skill/:id/cancel", (req, res) => {
    const { id } = req.params;
    const cancelled = skillExecutor.cancel(id);
    res.json({ cancelled });
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
  });
}

startServer().catch(console.error);
