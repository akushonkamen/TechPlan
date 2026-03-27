import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";
import { getScheduler } from "./src/services/schedulerService.js";

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
  `);

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

  // Documents API Routes
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

  // ===== 知识抽取 API =====

  // Import extraction service functions
  const {
    extractEntities,
    extractRelations,
    extractClaims,
    extractEvents,
    analyzeText,
    toGraphFormat
  } = await import('./src/services/extractionService.ts');

  /**
   * POST /api/extraction/entities
   * 从文本中抽取实体
   */
  app.post("/api/extraction/entities", async (req, res) => {
    try {
      const { text, options } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const entities = await extractEntities(text, options);

      // 如果提供了 document_id，保存到数据库
      if (req.body.document_id && entities.length > 0) {
        const { document_id } = req.body;
        for (const entity of entities) {
          await db.run(
            `INSERT INTO entities (id, document_id, text, type, confidence, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entity.id,
              document_id,
              entity.text,
              entity.type,
              entity.confidence,
              entity.metadata ? JSON.stringify(entity.metadata) : null
            ]
          );
        }
      }

      res.json({ entities, count: entities.length });
    } catch (error) {
      console.error("Failed to extract entities:", error);
      res.status(500).json({ error: "Failed to extract entities" });
    }
  });

  /**
   * POST /api/extraction/relations
   * 从文本中抽取关系
   */
  app.post("/api/extraction/relations", async (req, res) => {
    try {
      const { text, entities } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const relations = await extractRelations(text, entities);

      // 如果提供了 document_id，保存到数据库
      if (req.body.document_id && relations.length > 0) {
        const { document_id } = req.body;
        for (const relation of relations) {
          await db.run(
            `INSERT INTO relations (id, document_id, source_text, target_text, relation, confidence)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              relation.id,
              document_id,
              relation.source,
              relation.target,
              relation.relation,
              relation.confidence
            ]
          );
        }
      }

      res.json({ relations, count: relations.length });
    } catch (error) {
      console.error("Failed to extract relations:", error);
      res.status(500).json({ error: "Failed to extract relations" });
    }
  });

  /**
   * POST /api/extraction/claims
   * 从文本中抽取 Claims
   */
  app.post("/api/extraction/claims", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const claims = await extractClaims(text);

      // 如果提供了 document_id，保存到数据库
      if (req.body.document_id && claims.length > 0) {
        const { document_id } = req.body;
        for (const claim of claims) {
          await db.run(
            `INSERT INTO claims (id, document_id, text, type, polarity, confidence, source_context)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              claim.id,
              document_id,
              claim.text,
              claim.type,
              claim.polarity,
              claim.confidence,
              claim.sourceContext || null
            ]
          );
        }
      }

      res.json({ claims, count: claims.length });
    } catch (error) {
      console.error("Failed to extract claims:", error);
      res.status(500).json({ error: "Failed to extract claims" });
    }
  });

  /**
   * POST /api/extraction/events
   * 从文本中抽取事件
   */
  app.post("/api/extraction/events", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const events = await extractEvents(text);

      // 如果提供了 document_id，保存到数据库
      if (req.body.document_id && events.length > 0) {
        const { document_id } = req.body;
        for (const event of events) {
          await db.run(
            `INSERT INTO events (id, document_id, type, title, description, event_time, location, participants, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              event.id,
              document_id,
              event.type,
              event.title,
              event.description,
              event.time || null,
              event.location || null,
              JSON.stringify(event.participants),
              event.confidence
            ]
          );
        }
      }

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("Failed to extract events:", error);
      res.status(500).json({ error: "Failed to extract events" });
    }
  });

  /**
   * POST /api/extraction/analyze
   * 综合分析（一次性抽取所有）
   */
  app.post("/api/extraction/analyze", async (req, res) => {
    try {
      const { text, options, document_id } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "text is required and must be a string" });
      }

      const result = await analyzeText(text, options);

      // 如果提供了 document_id，保存所有结果到数据库
      if (document_id) {
        // 保存实体
        for (const entity of result.entities) {
          await db.run(
            `INSERT INTO entities (id, document_id, text, type, confidence, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entity.id,
              document_id,
              entity.text,
              entity.type,
              entity.confidence,
              entity.metadata ? JSON.stringify(entity.metadata) : null
            ]
          );
        }

        // 保存关系
        for (const relation of result.relations) {
          await db.run(
            `INSERT INTO relations (id, document_id, source_text, target_text, relation, confidence)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              relation.id,
              document_id,
              relation.source,
              relation.target,
              relation.relation,
              relation.confidence
            ]
          );
        }

        // 保存 Claims
        for (const claim of result.claims) {
          await db.run(
            `INSERT INTO claims (id, document_id, text, type, polarity, confidence, source_context)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              claim.id,
              document_id,
              claim.text,
              claim.type,
              claim.polarity,
              claim.confidence,
              claim.sourceContext || null
            ]
          );
        }

        // 保存事件
        for (const event of result.events) {
          await db.run(
            `INSERT INTO events (id, document_id, type, title, description, event_time, location, participants, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              event.id,
              document_id,
              event.type,
              event.title,
              event.description,
              event.time || null,
              event.location || null,
              JSON.stringify(event.participants),
              event.confidence
            ]
          );
        }
      }

      // 同时返回图谱格式
      const graphFormat = toGraphFormat(result);

      res.json({
        ...result,
        graph: graphFormat
      });
    } catch (error) {
      console.error("Failed to analyze text:", error);
      res.status(500).json({ error: "Failed to analyze text" });
    }
  });

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

  // ===== 去重 API =====

  interface Document {
    title: string;
    url: string;
    source?: string;
    type?: string;
    date?: string;
  }

  interface DedupRequest {
    documents: Document[];
    similarityThreshold?: number;
  }

  /**
   * 规范化标题
   */
  function normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—|:：,.。]+/, '')
      .replace(/[\s\-–—|:：,.。]+$/, '')
      .replace(/[\-–—]/g, '-')
      .trim();
  }

  /**
   * 计算字符串相似度 (Levenshtein 距离)
   */
  function calculateSimilarity(str1: string, str2: string): number {
    const s1 = normalizeTitle(str1);
    const s2 = normalizeTitle(str2);

    if (s1 === s2) return 1;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 || len2 === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[len2][len1];
    return 1 - distance / Math.max(len1, len2);
  }

  /**
   * URL 去重判断
   */
  function isDuplicateUrl(url1: string, url2: string): boolean {
    const normalizeUrl = (url: string): string => {
      return url
        .toLowerCase()
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .split('?')[0]
        .split('#')[0];
    };

    return normalizeUrl(url1) === normalizeUrl(url2);
  }

  /**
   * 去重 API 端点
   */
  app.post("/api/documents/dedup", async (req, res) => {
    try {
      const { documents, similarityThreshold = 0.85 }: DedupRequest = req.body;

      if (!Array.isArray(documents)) {
        return res.status(400).json({ error: "documents must be an array" });
      }

      const unique: Document[] = [];
      const duplicates: Array<{
        document: Document;
        reason: string;
        duplicateOf?: Document;
      }> = [];
      const seenUrls = new Set<string>();
      const seenTitles: string[] = [];

      let byUrl = 0;
      let byTitleSimilarity = 0;

      for (const doc of documents) {
        let isDuplicate = false;
        let reason = '';
        let duplicateOf: Document | undefined;

        // URL 去重
        const isUrlDup = Array.from(seenUrls).some(seenUrl => isDuplicateUrl(seenUrl, doc.url));
        if (isUrlDup) {
          isDuplicate = true;
          reason = 'duplicate_url';
          byUrl++;
          duplicateOf = unique.find(u => isDuplicateUrl(u.url, doc.url));
        }

        // 标题相似度去重
        if (!isDuplicate) {
          for (const seenTitle of seenTitles) {
            if (calculateSimilarity(seenTitle, doc.title) >= similarityThreshold) {
              isDuplicate = true;
              reason = 'similar_title';
              byTitleSimilarity++;
              duplicateOf = unique.find(u => calculateSimilarity(u.title, doc.title) >= similarityThreshold);
              break;
            }
          }
        }

        if (isDuplicate) {
          duplicates.push({ document: doc, reason, duplicateOf });
        } else {
          unique.push(doc);
          seenUrls.add(doc.url);
          seenTitles.push(doc.title);
        }
      }

      res.json({
        unique,
        duplicates,
        stats: {
          original: documents.length,
          unique: unique.length,
          removed: duplicates.length,
          byUrl,
          byTitleSimilarity
        }
      });
    } catch (error) {
      console.error("Failed to deduplicate documents:", error);
      res.status(500).json({ error: "Failed to deduplicate documents" });
    }
  });

  // ===== 报告 API =====

  // 创建 reports 表
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
   * POST /api/reports
   * 保存生成的报告
   */
  app.post("/api/reports", async (req, res) => {
    try {
      const { topicId, topicName, type, title, summary, keyFindings, documentSummary, generatedAt } = req.body;

      const id = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await db.run(
        `INSERT INTO reports (id, topic_id, topic_name, type, title, summary, content, generated_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          topicId,
          topicName,
          type || 'weekly',
          title,
          summary || '',
          JSON.stringify({ keyFindings: keyFindings || [], documentSummary }),
          generatedAt || new Date().toISOString(),
          JSON.stringify({ documentSummary })
        ]
      );

      const report = await db.get("SELECT * FROM reports WHERE id = ?", [id]);
      res.status(201).json(report);
    } catch (error) {
      console.error("Failed to create report:", error);
      res.status(500).json({ error: "Failed to create report" });
    }
  });

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

  /**
   * POST /api/reports/generate
   * 生成主题报告
   */
  app.post("/api/reports/generate", async (req, res) => {
    try {
      const { topicId, timeRange } = req.body;

      if (!topicId) {
        return res.status(400).json({ error: "topicId is required" });
      }

      // 获取主题信息
      const topic = await db.get("SELECT * FROM topics WHERE id = ?", [topicId]);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      // 获取主题下的文档
      let docsQuery = "SELECT * FROM documents WHERE topic_id = ?";
      const params: any[] = [topicId];

      if (timeRange?.start && timeRange?.end) {
        docsQuery += " AND published_date BETWEEN ? AND ?";
        params.push(timeRange.start, timeRange.end);
      }

      docsQuery += " ORDER BY published_date DESC LIMIT 50";

      const documents = await db.all(docsQuery, params);

      // 导入报告服务
      const { generateWeeklyReport, saveReport } = await import('./src/services/reportService.ts');

      // 生成报告
      const report = await generateWeeklyReport({
        topicId,
        topicName: topic.name,
        timeRange,
        documents
      });

      // 保存到数据库
      await saveReport(report);

      res.json(report);
    } catch (error) {
      console.error("Failed to generate report:", error);
      res.status(500).json({ error: "Failed to generate report", message: String(error) });
    }
  });

  // ===== 调度器 API =====

  // 获取调度器实例
  const scheduler = getScheduler(db);

  // POST /api/scheduler/start - 启动调度器
  app.post("/api/scheduler/start", async (req, res) => {
    try {
      await scheduler.start();
      res.json({ message: "Scheduler started", status: scheduler.getStatus() });
    } catch (error) {
      console.error("Failed to start scheduler:", error);
      res.status(500).json({ error: "Failed to start scheduler" });
    }
  });

  // POST /api/scheduler/stop - 停止调度器
  app.post("/api/scheduler/stop", async (req, res) => {
    try {
      await scheduler.stop();
      res.json({ message: "Scheduler stopped", status: scheduler.getStatus() });
    } catch (error) {
      console.error("Failed to stop scheduler:", error);
      res.status(500).json({ error: "Failed to stop scheduler" });
    }
  });

  // GET /api/scheduler/status - 获取调度器状态
  app.get("/api/scheduler/status", async (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Failed to get scheduler status:", error);
      res.status(500).json({ error: "Failed to get scheduler status" });
    }
  });

  // POST /api/scheduler/reload - 重新加载任务配置
  app.post("/api/scheduler/reload", async (req, res) => {
    try {
      await scheduler.reload();
      res.json({ message: "Scheduler reloaded", status: scheduler.getStatus() });
    } catch (error) {
      console.error("Failed to reload scheduler:", error);
      res.status(500).json({ error: "Failed to reload scheduler" });
    }
  });

  // POST /api/scheduler/sync - 从主题同步任务
  app.post("/api/scheduler/sync", async (req, res) => {
    try {
      const created = await scheduler.syncTopics();
      res.json({ message: `Synced ${created} new tasks`, created });
    } catch (error) {
      console.error("Failed to sync topics:", error);
      res.status(500).json({ error: "Failed to sync topics" });
    }
  });

  // GET /api/scheduler/jobs - 获取已注册的任务列表
  app.get("/api/scheduler/jobs", async (req, res) => {
    try {
      const tasks = scheduler.getTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Failed to get jobs:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  // POST /api/scheduler/jobs - 创建新任务
  app.post("/api/scheduler/jobs", async (req, res) => {
    try {
      const { topic_id, schedule } = req.body;
      if (!topic_id || !schedule) {
        return res.status(400).json({ error: "topic_id and schedule are required" });
      }
      const task = await scheduler.createTask(topic_id, schedule);
      res.status(201).json(task);
    } catch (error) {
      console.error("Failed to create job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create job" });
    }
  });

  // PUT /api/scheduler/jobs/:id - 更新任务
  app.put("/api/scheduler/jobs/:id", async (req, res) => {
    try {
      const task = await scheduler.updateTask(req.params.id, req.body);
      res.json(task);
    } catch (error) {
      console.error("Failed to update job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update job" });
    }
  });

  // DELETE /api/scheduler/jobs/:id - 删除任务
  app.delete("/api/scheduler/jobs/:id", async (req, res) => {
    try {
      await scheduler.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // POST /api/scheduler/jobs/:id/trigger - 手动触发任务
  app.post("/api/scheduler/jobs/:id/trigger", async (req, res) => {
    try {
      const execution = await scheduler.triggerTask(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(execution);
    } catch (error) {
      console.error("Failed to trigger job:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to trigger job" });
    }
  });

  // GET /api/scheduler/logs - 获取执行日志
  app.get("/api/scheduler/logs", async (req, res) => {
    try {
      const { limit, task_id, status } = req.query;
      await scheduler.loadExecutionsFromDb(
        limit ? parseInt(limit as string) : 100
      );
      const executions = scheduler.getExecutions({
        limit: limit ? parseInt(limit as string) : undefined,
        taskId: task_id as string,
        status: status as string
      });
      res.json(executions);
    } catch (error) {
      console.error("Failed to get logs:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });

  // GET /api/scheduler/logs/:id - 获取单个执行日志详情
  app.get("/api/scheduler/logs/:id", async (req, res) => {
    try {
      await scheduler.loadExecutionsFromDb(1000);
      const execution = scheduler.getExecutions().find(e => e.id === req.params.id);
      if (!execution) {
        return res.status(404).json({ error: "Execution log not found" });
      }
      res.json(execution);
    } catch (error) {
      console.error("Failed to get log:", error);
      res.status(500).json({ error: "Failed to get log" });
    }
  });

  // ===== 图数据库 API =====

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

  /**
   * POST /api/graph/sync
   * 同步 SQLite 数据到图数据库
   */
  app.post("/api/graph/sync", async (req, res) => {
    try {
      const result = await graphService.syncFromSQLite(db);

      res.json({
        message: "Sync completed",
        ...result,
      });
    } catch (error) {
      console.error("Failed to sync data:", error);
      res.status(500).json({ error: "Failed to sync data" });
    }
  });

  /**
   * POST /api/graph/nodes
   * 创建新节点
   */
  app.post("/api/graph/nodes", async (req, res) => {
    try {
      const { label, properties } = req.body;

      if (!label || !properties) {
        return res.status(400).json({ error: "label and properties are required" });
      }

      const node = await graphService.createNode(label, properties);
      res.status(201).json(node);
    } catch (error) {
      console.error("Failed to create node:", error);
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  /**
   * PUT /api/graph/nodes/:id
   * 更新节点
   */
  app.put("/api/graph/nodes/:id", async (req, res) => {
    try {
      const { properties } = req.body;

      if (!properties) {
        return res.status(400).json({ error: "properties are required" });
      }

      const node = await graphService.updateNode(req.params.id, properties);

      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }

      res.json(node);
    } catch (error) {
      console.error("Failed to update node:", error);
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  /**
   * DELETE /api/graph/nodes/:id
   * 删除节点
   */
  app.delete("/api/graph/nodes/:id", async (req, res) => {
    try {
      const deleted = await graphService.deleteNode(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Node not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete node:", error);
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  /**
   * POST /api/graph/relationships
   * 创建新关系
   */
  app.post("/api/graph/relationships", async (req, res) => {
    try {
      const { from, to, type, properties } = req.body;

      if (!from || !to || !type) {
        return res.status(400).json({ error: "from, to, and type are required" });
      }

      const relationship = await graphService.createRelationship(
        from,
        to,
        type,
        properties || {}
      );

      if (!relationship) {
        return res.status(404).json({ error: "Source or target node not found" });
      }

      res.status(201).json(relationship);
    } catch (error) {
      console.error("Failed to create relationship:", error);
      res.status(500).json({ error: "Failed to create relationship" });
    }
  });

  /**
   * GET /api/graph/path
   * 查找两个节点之间的路径
   */
  app.get("/api/graph/path", async (req, res) => {
    try {
      const { from, to, maxDepth } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: "from and to are required" });
      }

      const path = await graphService.findPath(
        from as string,
        to as string,
        maxDepth ? parseInt(maxDepth as string) : 4
      );

      res.json({
        path,
        length: path.length,
      });
    } catch (error) {
      console.error("Failed to find path:", error);
      res.status(500).json({ error: "Failed to find path" });
    }
  });

  /**
   * POST /api/graph/save
   * 保存当前图状态到磁盘
   */
  app.post("/api/graph/save", async (req, res) => {
    try {
      await graphService.save();
      res.json({ message: "Graph data saved successfully" });
    } catch (error) {
      console.error("Failed to save graph:", error);
      res.status(500).json({ error: "Failed to save graph" });
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

  /**
   * POST /api/config/test
   * 测试 API 连接
   */
  app.post("/api/config/test", async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model } = req.body;

      if (!apiKey) {
        return res.status(400).json({ success: false, error: "API Key is required" });
      }

      if (provider === "openai" || provider === "custom") {
        // 测试 OpenAI 兼容接口
        const OpenAI = await import("openai");
        const client = new OpenAI.OpenAI({
          apiKey: apiKey,
          baseURL: baseUrl || "https://api.openai.com/v1",
        });

        const response = await client.chat.completions.create({
          model: model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 10,
        });

        res.json({ success: true, message: "连接成功！" });
      } else if (provider === "gemini") {
        // 测试 Gemini
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({
          model: model || "gemini-2.5-flash-preview",
          contents: "Hello",
        });

        res.json({ success: true, message: "连接成功！" });
      } else {
        res.status(400).json({ success: false, error: "不支持的提供商" });
      }
    } catch (error: any) {
      console.error("API test failed:", error);
      res.status(400).json({
        success: false,
        error: error.message || "API 连接失败，请检查 API Key 和网络"
      });
    }
  });

  // ===== 推理编排 API =====

  // Import reasoning service functions
  const {
    executeWorkflow,
    calculateScoringCard,
    quickAnalysis,
    evaluateDirections,
  } = await import('./src/services/reasoningService.ts');

  /**
   * POST /api/analysis/run
   * 执行技术规划工作流（完整推理链）
   */
  app.post("/api/analysis/run", async (req, res) => {
    try {
      const { topicId, type = 'special_analysis', depth = 2, options } = req.body;

      if (!topicId) {
        return res.status(400).json({ error: "topicId is required" });
      }

      const request = {
        topicId,
        type,
        depth,
        options,
      };

      const execution = await executeWorkflow(request, db);

      if (execution.status === 'completed') {
        res.json(execution.result);
      } else {
        res.status(500).json({
          error: "Analysis failed",
          execution: {
            id: execution.id,
            status: execution.status,
            stages: execution.stages,
          },
        });
      }
    } catch (error) {
      console.error("Failed to run analysis:", error);
      res.status(500).json({ error: "Failed to run analysis" });
    }
  });

  /**
   * GET /api/topics/:id/scoring
   * 获取主题的评分卡
   */
  app.get("/api/topics/:id/scoring", async (req, res) => {
    try {
      const { id } = req.params;
      const topic = await db.get('SELECT * FROM topics WHERE id = ?', [id]);

      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      // 解析 topic 数据
      const parsedTopic = {
        ...topic,
        aliases: JSON.parse(topic.aliases || '[]'),
        keywords: JSON.parse(topic.keywords || '[]'),
        organizations: JSON.parse(topic.organizations || '[]'),
      };

      // 执行快速分析
      const scoringCard = await quickAnalysis(id, db);

      res.json(scoringCard);
    } catch (error) {
      console.error("Failed to calculate scoring:", error);
      res.status(500).json({ error: "Failed to calculate scoring" });
    }
  });

  /**
   * POST /api/analysis/evaluate
   * 批量评估多个技术方向
   */
  app.post("/api/analysis/evaluate", async (req, res) => {
    try {
      const { directions } = req.body;

      if (!Array.isArray(directions) || directions.length === 0) {
        return res.status(400).json({ error: "directions must be a non-empty array" });
      }

      const results = await evaluateDirections(directions, db);

      // 按综合评分排序
      const sorted = results.sort((a, b) => b.overallScore - a.overallScore);

      res.json({
        results: sorted,
        count: sorted.length,
      });
    } catch (error) {
      console.error("Failed to evaluate directions:", error);
      res.status(500).json({ error: "Failed to evaluate directions" });
    }
  });

  /**
   * POST /api/topics/:id/collect
   * 触发按需采集（设计稿要求）
   */
  app.post("/api/topics/:id/collect", async (req, res) => {
    try {
      const { id } = req.params;

      // 检查主题是否存在
      const topic = await db.get('SELECT * FROM topics WHERE id = ?', [id]);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      // 获取调度器实例
      const scheduler = getScheduler(db);

      // 检查是否有该主题的任务
      const tasks = scheduler.getTasks().filter(t => t.topicId === id);

      if (tasks.length === 0) {
        return res.status(400).json({ error: "No scheduled task for this topic" });
      }

      // 触发任务执行
      const result = await scheduler.triggerTask(tasks[0].id);

      res.json({
        success: true,
        execution: result,
      });
    } catch (error) {
      console.error("Failed to trigger collection:", error);
      res.status(500).json({ error: "Failed to trigger collection" });
    }
  });

  /**
   * GET /api/reports/:id
   * 获取报告详情（设计稿要求）
   */
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const row = await db.get("SELECT * FROM reports WHERE id = ?", [id]);
      if (!row) {
        return res.status(404).json({ error: "Report not found" });
      }

      const report = {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        period: row.period_start && row.period_end ? {
          start: row.period_start,
          end: row.period_end,
        } : null,
      };

      res.json(report);
    } catch (error) {
      console.error("Failed to fetch report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  /**
   * GET /api/reports
   * 获取报告列表
   */
  app.get("/api/reports", async (req, res) => {
    try {
      const { topicId, type } = req.query;
      let query = "SELECT * FROM reports WHERE 1=1";
      const params: any[] = [];

      if (topicId) {
        query += " AND topic_id = ?";
        params.push(topicId);
      }

      if (type) {
        query += " AND type = ?";
        params.push(type);
      }

      query += " ORDER BY generated_at DESC";

      const rows = await db.all(query, params);
      const reports = rows.map((row: any) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));

      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  /**
   * POST /api/reports
   * 保存报告
   */
  app.post("/api/reports", async (req, res) => {
    try {
      const report = req.body;
      const id = report.id || `report_${Date.now()}`;

      await db.run(
        `INSERT INTO reports (id, topic_id, topic_name, type, title, summary, status, generated_at, period_start, period_end, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          report.topicId,
          report.topicName,
          report.type,
          report.title,
          report.summary || '',
          report.status || 'completed',
          report.generatedAt || new Date().toISOString(),
          report.period?.start || null,
          report.period?.end || null,
          report.metadata ? JSON.stringify(report.metadata) : null,
        ]
      );

      const created = await db.get("SELECT * FROM reports WHERE id = ?", [id]);
      res.status(201).json(created);
    } catch (error) {
      console.error("Failed to save report:", error);
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  // ===== 数据源采集 API =====

  const {
    collectByTopic,
    fetchArxivPapers,
    fetchRSSFeeds,
    fetchGDELTNews,
    createCollectionTask,
    startTaskProcessing,
    getQueueStatus,
    getAllTasks,
  } = await import('./src/services/dataSourceService.js');

  /**
   * POST /api/sources/arxiv
   * 采集 arXiv 论文
   */
  app.post("/api/sources/arxiv", async (req, res) => {
    try {
      const { query, maxResults = 10 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const papers = await fetchArxivPapers(query, maxResults);
      res.json({ papers, count: papers.length });
    } catch (error) {
      console.error("Failed to fetch arXiv papers:", error);
      res.status(500).json({ error: "Failed to fetch arXiv papers" });
    }
  });

  /**
   * POST /api/sources/rss
   * 采集 RSS 订阅源
   */
  app.post("/api/sources/rss", async (req, res) => {
    try {
      const { urls } = req.body;

      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "urls must be a non-empty array" });
      }

      const items = await fetchRSSFeeds(urls);
      res.json({ items, count: items.length });
    } catch (error) {
      console.error("Failed to fetch RSS feeds:", error);
      res.status(500).json({ error: "Failed to fetch RSS feeds" });
    }
  });

  /**
   * POST /api/sources/gdelt
   * 采集 GDELT 新闻
   */
  app.post("/api/sources/gdelt", async (req, res) => {
    try {
      const { query, dateRange, maxResults = 50 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const news = await fetchGDELTNews(query, dateRange, maxResults);
      res.json({ news, count: news.length });
    } catch (error) {
      console.error("Failed to fetch GDELT news:", error);
      res.status(500).json({ error: "Failed to fetch GDELT news" });
    }
  });

  /**
   * POST /api/topics/:id/collect-sources
   * 按主题采集所有数据源
   */
  app.post("/api/topics/:id/collect-sources", async (req, res) => {
    try {
      const { id } = req.params;
      const { config } = req.body;

      // 获取主题信息
      const topic = await db.get('SELECT * FROM topics WHERE id = ?', [id]);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      // 解析主题数据
      const parsedTopic = {
        ...topic,
        aliases: JSON.parse(topic.aliases || '[]'),
        keywords: JSON.parse(topic.keywords || '[]'),
        organizations: JSON.parse(topic.organizations || '[]'),
      };

      // 执行采集
      const result = await collectByTopic(parsedTopic, config || {});

      // 保存文档到数据库
      let savedCount = 0;
      for (const doc of result.arxivPapers) {
        try {
          await db.run(
            `INSERT OR IGNORE INTO documents (id, title, source, source_url, published_date, collected_date, topic_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [doc.id, doc.title, doc.source, doc.url, doc.date, new Date().toISOString(), id, JSON.stringify(doc.metadata)]
          );
          savedCount++;
        } catch (e) {
          // 忽略重复
        }
      }

      for (const item of result.rssItems) {
        try {
          const itemId = `rss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.run(
            `INSERT OR IGNORE INTO documents (id, title, source, source_url, published_date, collected_date, topic_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [itemId, item.title, item.source, item.link, item.pubDate, new Date().toISOString(), id, JSON.stringify({ type: 'news' })]
          );
          savedCount++;
        } catch (e) {
          // 忽略重复
        }
      }

      for (const news of result.gdeltNews) {
        try {
          const newsId = `gdelt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await db.run(
            `INSERT OR IGNORE INTO documents (id, title, source, source_url, published_date, collected_date, topic_id, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [newsId, news.title, 'GDELT', news.url, news.publishedDate, new Date().toISOString(), id, JSON.stringify({ source: news.source, language: news.language, tone: news.tone, themes: news.themes, type: 'news' })]
          );
          savedCount++;
        } catch (e) {
          // 忽略重复
        }
      }

      res.json({
        ...result,
        savedCount,
        totalCount: result.arxivPapers.length + result.rssItems.length + result.gdeltNews.length
      });
    } catch (error) {
      console.error("Failed to collect sources:", error);
      res.status(500).json({ error: "Failed to collect sources" });
    }
  });

  /**
   * GET /api/sources/queue/status
   * 获取采集队列状态
   */
  app.get("/api/sources/queue/status", async (req, res) => {
    try {
      const status = getQueueStatus();
      res.json(status);
    } catch (error) {
      console.error("Failed to get queue status:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  /**
   * GET /api/sources/queue/tasks
   * 获取采集任务列表
   */
  app.get("/api/sources/queue/tasks", async (req, res) => {
    try {
      const tasks = getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Failed to get tasks:", error);
      res.status(500).json({ error: "Failed to get tasks" });
    }
  });

  /**
   * POST /api/sources/queue/tasks
   * 创建采集任务
   */
  app.post("/api/sources/queue/tasks", async (req, res) => {
    try {
      const { topicId, config } = req.body;

      if (!topicId) {
        return res.status(400).json({ error: "topicId is required" });
      }

      // 获取主题信息
      const topic = await db.get('SELECT * FROM topics WHERE id = ?', [topicId]);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      const parsedTopic = {
        ...topic,
        aliases: JSON.parse(topic.aliases || '[]'),
        keywords: JSON.parse(topic.keywords || '[]'),
        organizations: JSON.parse(topic.organizations || '[]'),
      };

      const task = await createCollectionTask(parsedTopic, config || {});
      res.status(201).json(task);
    } catch (error) {
      console.error("Failed to create task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // ===== 检索 API =====

  const {
    fulltextSearch,
    vectorSearch,
    graphNeighborhood,
    hybridSearch,
    assembleEvidencePackage,
  } = await import('./src/services/retrievalService.ts');

  /**
   * POST /api/retrieval/fulltext
   * 全文检索
   */
  app.post("/api/retrieval/fulltext", async (req, res) => {
    try {
      const { query, filters } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const results = await fulltextSearch(db, query, filters);
      res.json({ results, count: results.length });
    } catch (error) {
      console.error("Failed to search:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  /**
   * POST /api/retrieval/vector
   * 向量检索
   */
  app.post("/api/retrieval/vector", async (req, res) => {
    try {
      const { query, limit = 10 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const results = await vectorSearch(db, query, limit);
      res.json({ results, count: results.length });
    } catch (error) {
      console.error("Failed to search vectors:", error);
      res.status(500).json({ error: "Failed to search vectors" });
    }
  });

  /**
   * GET /api/retrieval/graph/:entityId
   * 图谱邻域检索
   */
  app.get("/api/retrieval/graph/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      const depth = req.query.depth ? parseInt(req.query.depth as string) : 2;

      const results = await graphNeighborhood(db, entityId, depth);
      res.json({ results, count: results.length });
    } catch (error) {
      console.error("Failed to search graph:", error);
      res.status(500).json({ error: "Failed to search graph" });
    }
  });

  /**
   * POST /api/retrieval/hybrid
   * 混合检索
   */
  app.post("/api/retrieval/hybrid", async (req, res) => {
    try {
      const { text, topicId, filters, options } = req.body;

      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }

      const result = await hybridSearch(db, { text, topicId, filters, options });
      res.json(result);
    } catch (error) {
      console.error("Failed to run hybrid search:", error);
      res.status(500).json({ error: "Failed to run hybrid search" });
    }
  });

  /**
   * GET /api/retrieval/evidence/:topicId
   * 组装证据包
   */
  app.get("/api/retrieval/evidence/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const { query } = req.query;

      const evidence = await assembleEvidencePackage(db, topicId, query as string);
      res.json(evidence);
    } catch (error) {
      console.error("Failed to assemble evidence:", error);
      res.status(500).json({ error: "Failed to assemble evidence" });
    }
  });

  // ===== 审核台 API =====

  /**
   * GET /api/reviews
   * 获取待审核列表
   */
  app.get("/api/reviews", async (req, res) => {
    try {
      const { status, type, limit = 50, offset = 0 } = req.query;

      let query = "SELECT * FROM reviews WHERE 1=1";
      const params: any[] = [];

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }

      if (type) {
        query += " AND type = ?";
        params.push(type);
      }

      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(Number(limit), Number(offset));

      const rows = await db.all(query, params);
      const reviews = rows.map(row => ({
        ...row,
        time: formatTimeAgo(row.created_at),
      }));

      res.json(reviews);
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  /**
   * GET /api/reviews/stats
   * 获取审核统计
   */
  app.get("/api/reviews/stats", async (req, res) => {
    try {
      const pending = await db.get("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'");
      const entityDisambig = await db.get("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending' AND type = 'entity_disambig'");
      const claimReview = await db.get("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending' AND type = 'claim_review'");
      const conflictResolve = await db.get("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending' AND type = 'conflict_resolve'");

      res.json({
        total: pending.count,
        entityDisambig: entityDisambig.count,
        claimReview: claimReview.count,
        conflictResolve: conflictResolve.count,
      });
    } catch (error) {
      console.error("Failed to fetch review stats:", error);
      res.status(500).json({ error: "Failed to fetch review stats" });
    }
  });

  /**
   * GET /api/reviews/:id
   * 获取审核详情
   */
  app.get("/api/reviews/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM reviews WHERE id = ?", [req.params.id]);
      if (!row) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.json(row);
    } catch (error) {
      console.error("Failed to fetch review:", error);
      res.status(500).json({ error: "Failed to fetch review" });
    }
  });

  /**
   * POST /api/reviews
   * 创建审核任务
   */
  app.post("/api/reviews", async (req, res) => {
    try {
      const { type, topicId, topicName, source, sourceUrl, content, confidence, reason } = req.body;

      const id = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await db.run(
        `INSERT INTO reviews (id, type, topic_id, topic_name, source, source_url, content, confidence, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [id, type, topicId, topicName, source, sourceUrl, content, confidence, reason, new Date().toISOString()]
      );

      const created = await db.get("SELECT * FROM reviews WHERE id = ?", [id]);
      res.status(201).json(created);
    } catch (error) {
      console.error("Failed to create review:", error);
      res.status(500).json({ error: "Failed to create review" });
    }
  });

  /**
   * POST /api/reviews/:id/approve
   * 审核通过
   */
  app.post("/api/reviews/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      await db.run(
        `UPDATE reviews SET status = 'approved', reviewed_at = ?, review_notes = ? WHERE id = ?`,
        [new Date().toISOString(), notes || null, id]
      );

      const updated = await db.get("SELECT * FROM reviews WHERE id = ?", [id]);
      res.json(updated);
    } catch (error) {
      console.error("Failed to approve review:", error);
      res.status(500).json({ error: "Failed to approve review" });
    }
  });

  /**
   * POST /api/reviews/:id/reject
   * 审核拒绝
   */
  app.post("/api/reviews/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      await db.run(
        `UPDATE reviews SET status = 'rejected', reviewed_at = ?, review_notes = ? WHERE id = ?`,
        [new Date().toISOString(), notes || null, id]
      );

      const updated = await db.get("SELECT * FROM reviews WHERE id = ?", [id]);
      res.json(updated);
    } catch (error) {
      console.error("Failed to reject review:", error);
      res.status(500).json({ error: "Failed to reject review" });
    }
  });

  /**
   * POST /api/reviews/batch-approve
   * 批量审核通过
   */
  app.post("/api/reviews/batch-approve", async (req, res) => {
    try {
      const { ids, notes } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }

      const placeholders = ids.map(() => '?').join(',');
      await db.run(
        `UPDATE reviews SET status = 'approved', reviewed_at = ?, review_notes = ? WHERE id IN (${placeholders})`,
        [new Date().toISOString(), notes || null, ...ids]
      );

      res.json({ success: true, count: ids.length });
    } catch (error) {
      console.error("Failed to batch approve:", error);
      res.status(500).json({ error: "Failed to batch approve" });
    }
  });

  // ===== 实体消歧 API =====

  const {
    normalizeEntityAliases,
    disambiguateEntities,
    mergeEntityOrganizations,
    resolveEntities,
  } = await import('./src/services/entityResolutionService.ts');

  /**
   * POST /api/entities/resolve
   * 实体消歧
   */
  app.post("/api/entities/resolve", async (req, res) => {
    try {
      const { entities, config } = req.body;

      if (!Array.isArray(entities)) {
        return res.status(400).json({ error: "entities must be an array" });
      }

      const result = await resolveEntities(entities, config || {});
      res.json({ resolved: result.entities, count: result.entities.length, statistics: result.statistics });
    } catch (error) {
      console.error("Failed to resolve entities:", error);
      res.status(500).json({ error: "Failed to resolve entities" });
    }
  });

  /**
   * POST /api/entities/normalize
   * 别名归一化
   */
  app.post("/api/entities/normalize", async (req, res) => {
    try {
      const { entities } = req.body;

      if (!Array.isArray(entities)) {
        return res.status(400).json({ error: "entities must be an array" });
      }

      const normalized = await normalizeEntityAliases(entities);
      res.json({ normalized, count: normalized.length });
    } catch (error) {
      console.error("Failed to normalize entities:", error);
      res.status(500).json({ error: "Failed to normalize entities" });
    }
  });

  /**
   * POST /api/entities/disambiguate
   * 同名消歧
   */
  app.post("/api/entities/disambiguate", async (req, res) => {
    try {
      const { entities, context } = req.body;

      if (!Array.isArray(entities)) {
        return res.status(400).json({ error: "entities must be an array" });
      }

      const disambiguated = await disambiguateEntities(entities, context || "");
      res.json({ disambiguated, count: disambiguated.length });
    } catch (error) {
      console.error("Failed to disambiguate entities:", error);
      res.status(500).json({ error: "Failed to disambiguate entities" });
    }
  });

  /**
   * POST /api/entities/merge-orgs
   * 机构归并
   */
  app.post("/api/entities/merge-orgs", async (req, res) => {
    try {
      const { entities } = req.body;

      if (!Array.isArray(entities)) {
        return res.status(400).json({ error: "entities must be an array" });
      }

      const merged = await mergeEntityOrganizations(entities);
      res.json({ merged, count: merged.length });
    } catch (error) {
      console.error("Failed to merge organizations:", error);
      res.status(500).json({ error: "Failed to merge organizations" });
    }
  });

  // Vite middleware for development
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
