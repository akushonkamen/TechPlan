import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";

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
