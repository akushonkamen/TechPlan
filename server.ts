import express from "express";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import { SkillRegistry } from "./src/skillRegistry.js";
import { SkillExecutor } from "./src/skillExecutor.js";

import type { SkillExecution } from "./src/skillExecutor.js";
import { SkillWebSocket } from "./src/websocket.js";
import { validateReportOutput } from "./src/schemas/report.js";
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

/**
 * Calculate time decay score based on published date vs now
 * @param publishedDate ISO date string
 * @param urgency Urgency level: 'breaking' | 'developing' | 'ongoing' | 'archival'
 * @returns Relevance score 0-1
 */
function calculateTimeDecay(publishedDate: string | null, urgency: string = 'ongoing'): number {
  if (!publishedDate) return 0.5;

  const now = new Date();
  const published = new Date(publishedDate);
  const hoursSince = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

  // Urgency multipliers for decay rate
  const urgencyMultiplier: Record<string, number> = {
    'breaking': 0.1,    // Decay 10% per hour
    'developing': 0.05, // Decay 5% per hour
    'ongoing': 0.01,    // Decay 1% per hour
    'archival': 0.001   // Decay 0.1% per hour
  };

  const decay = urgencyMultiplier[urgency] || 0.01;
  const relevance = Math.max(0, Math.exp(-decay * hoursSince));

  return relevance;
}

/**
 * Calculate freshness hours since published date
 * @param publishedDate ISO date string
 * @returns Hours since publication
 */
function calculateFreshnessHours(publishedDate: string | null): number {
  if (!publishedDate) return 0;

  const now = new Date();
  const published = new Date(publishedDate);
  return (now.getTime() - published.getTime()) / (1000 * 60 * 60);
}

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

async function startServer() {
  ensureClaudeCli();
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
      urgency TEXT DEFAULT 'ongoing',
      relevance_score REAL DEFAULT 0.5,
      freshness_hours REAL DEFAULT 0,
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
      review_status TEXT DEFAULT 'pending',
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

    -- Create indexes for timeliness queries
    CREATE INDEX IF NOT EXISTS idx_documents_urgency ON documents(urgency);
    CREATE INDEX IF NOT EXISTS idx_documents_relevance ON documents(relevance_score);
    CREATE INDEX IF NOT EXISTS idx_documents_published_date ON documents(published_date);

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

    -- Source tracking table for deduplication and rate limiting
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      title TEXT,
      first_seen TEXT NOT NULL,
      last_collected TEXT,
      fingerprint TEXT NOT NULL,
      content_hash TEXT,
      collect_count INTEGER DEFAULT 1,
      last_checked TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Report time periods table for linking reports to their declared time ranges
    CREATE TABLE IF NOT EXISTS report_time_periods (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      preset_type TEXT,  -- '24h', '7d', '30d', 'custom', etc.
      documents_count INTEGER DEFAULT 0,
      sources_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_skill_executions_name ON skill_executions(skill_name);
    CREATE INDEX IF NOT EXISTS idx_skill_executions_status ON skill_executions(status);
    CREATE INDEX IF NOT EXISTS idx_bilevel_lessons_skill ON bilevel_lessons(skill_name);
    CREATE INDEX IF NOT EXISTS idx_bilevel_skills_skill ON bilevel_skills(skill_name);
    CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_name);
    CREATE INDEX IF NOT EXISTS idx_optimization_history_skill ON optimization_history(skill_name);
    CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);
    CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
    CREATE INDEX IF NOT EXISTS idx_sources_fingerprint ON sources(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_sources_last_collected ON sources(last_collected);
    CREATE INDEX IF NOT EXISTS idx_report_time_periods_report_id ON report_time_periods(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_time_periods_period_start ON report_time_periods(period_start);
    CREATE INDEX IF NOT EXISTS idx_report_time_periods_period_end ON report_time_periods(period_end);
  `);

  // Migration: Add timeliness columns to documents table
  try {
    await db.exec(`ALTER TABLE documents ADD COLUMN urgency TEXT DEFAULT 'ongoing'`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding documents.urgency:', e.message);
    }
  }
  try {
    await db.exec(`ALTER TABLE documents ADD COLUMN relevance_score REAL DEFAULT 0.5`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding documents.relevance_score:', e.message);
    }
  }
  try {
    await db.exec(`ALTER TABLE documents ADD COLUMN freshness_hours REAL DEFAULT 0`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding documents.freshness_hours:', e.message);
    }
  }

  // Create indexes for timeliness queries (if not exists)
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_urgency ON documents(urgency)`);
  } catch (e: any) {
    console.warn('[Migration] Warning creating idx_documents_urgency:', e.message);
  }
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_relevance ON documents(relevance_score)`);
  } catch (e: any) {
    console.warn('[Migration] Warning creating idx_documents_relevance:', e.message);
  }
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_published_date ON documents(published_date)`);
  } catch (e: any) {
    console.warn('[Migration] Warning creating idx_documents_published_date:', e.message);
  }

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

  // Migrate: add review_status column to reports if missing
  try {
    await db.exec(`ALTER TABLE reports ADD COLUMN review_status TEXT DEFAULT 'pending'`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding reports.review_status:', e.message);
    }
  }

  // Migrate: add review_status column to claims if missing
  try {
    await db.exec(`ALTER TABLE claims ADD COLUMN review_status TEXT DEFAULT 'pending'`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding claims.review_status:', e.message);
    }
  }

  // Migrate: add review_status column to entities if missing
  try {
    await db.exec(`ALTER TABLE entities ADD COLUMN review_status TEXT DEFAULT 'pending'`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) {
      console.warn('[Migration] Warning adding entities.review_status:', e.message);
    }
  }

  // Migration: Add source tracking and deduplication columns to documents
  const sourceTrackingColumns = [
    'original_source TEXT',      // First source where document was found
    'dedup_hash TEXT',           // Hash for duplicate detection (URL + title normalized)
    'collection_count INTEGER DEFAULT 1',  // Number of times collected
    'first_collected_at TEXT',   // First collection timestamp
    'last_collected_at TEXT'     // Most recent collection timestamp
  ];

  for (const columnDef of sourceTrackingColumns) {
    const columnName = columnDef.split(' ')[0];
    try {
      await db.exec(`ALTER TABLE documents ADD COLUMN ${columnDef}`);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn(`[Migration] Warning adding documents.${columnName}:`, e.message);
      }
    }
  }

  // Create index for deduplication lookups
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_dedup_hash ON documents(dedup_hash)`);
  } catch (e: any) {
    console.warn('[Migration] Warning creating idx_documents_dedup_hash:', e.message);
  }

  // Create index for source tracking queries
  try {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_original_source ON documents(original_source)`);
  } catch (e: any) {
    console.warn('[Migration] Warning creating idx_documents_original_source:', e.message);
  }

  /**
   * Generate content fingerprint using crypto.createHash
   * Creates a SHA-256 hash of normalized content for deduplication
   * @param content - The content to fingerprint (title, url, or full content)
   * @returns Hex string hash
   */
  function generateFingerprint(content: string): string {
    const normalized = content
      .toLowerCase()
      .trim()
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove common tracking parameters
      .replace(/[?&](utm_[^&]*|ref=[^&]*|source=[^&]*|fbclid=[^&]*|gclid=[^&]*)/gi, '')
      // Remove trailing slashes
      .replace(/\/+$/, '');

    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Extract domain from URL for rate limiting and grouping
   * @param url - The URL to extract domain from
   * @returns Domain name or null
   */
  function extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Compute deduplication hash for a document (legacy, uses generateFingerprint now)
   * Hash is based on normalized URL + title to identify duplicates
   */
  function computeDedupHash(sourceUrl: string | null, title: string): string {
    const normalizedUrl = sourceUrl
      ? sourceUrl.toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
          .split('?')[0]
          .split('#')[0]
      : '';
    const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
    const combined = `${normalizedUrl}|||${normalizedTitle}`;
    // Use crypto.createHash for better fingerprinting
    const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').substring(0, 16);
    return `dedup_${hash}`;
  }

  /**
   * Find existing document by dedup hash
   */
  async function findDuplicateByHash(dedupHash: string): Promise<any | null> {
    return await db.get(
      `SELECT id, title, source_url, collected_date, collection_count FROM documents WHERE dedup_hash = ? LIMIT 1`,
      [dedupHash]
    );
  }

  /**
   * Update document when it's collected again (increment count, update last_collected_at)
   */
  async function updateOnRecollect(documentId: string): Promise<void> {
    await db.run(
      `UPDATE documents SET
        collection_count = collection_count + 1,
        last_collected_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [documentId]
    );
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
      const id = topic.id || `topic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const now = new Date().toISOString();
      const topicData = {
        ...topic,
        id,
        createdAt: topic.createdAt || now,
      };
      await db.run(
        `INSERT INTO topics (id, name, description, aliases, owner, priority, scope, createdAt, keywords, organizations, schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          topicData.schedule || 'weekly'
        ]
      );
      res.status(201).json(topicData);
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
   * 获取最新预警列表 - 按发布时间排序，显示"发布于X小时前"
   * 优先级: breaking news → developing stories → trending topics
   */
  app.get("/api/dashboard/alerts", async (req, res) => {
    try {
      // 获取所有高优先级主题的文档，按 published_date 排序
      const alerts = await db.all(`
        SELECT
          d.id,
          d.title,
          t.name as topic,
          d.published_date,
          d.source,
          d.source_url as url,
          d.urgency,
          d.relevance_score,
          d.freshness_hours
        FROM documents d
        LEFT JOIN topics t ON d.topic_id = t.id
        WHERE t.priority = 'high' OR d.urgency IN ('breaking', 'developing')
        ORDER BY
          CASE d.urgency
            WHEN 'breaking' THEN 1
            WHEN 'developing' THEN 2
            WHEN 'ongoing' THEN 3
            ELSE 4
          END ASC,
          d.relevance_score DESC,
          d.published_date DESC
        LIMIT 20
      `);

      // 分类为不同层级
      const breakingNews: typeof alerts = [];
      const developingStories: typeof alerts = [];
      const trendingTopics: typeof alerts = [];

      for (const alert of alerts) {
        // 动态计算相关性分数（结合时效性，基于 published_date）
        const dynamicScore = alert.relevance_score ?? calculateTimeDecay(alert.published_date, alert.urgency || 'ongoing');
        const isVeryFresh = alert.freshness_hours < 6;
        const isRecent = alert.freshness_hours < 24;

        if (alert.urgency === 'breaking' || (isVeryFresh && dynamicScore > 0.8)) {
          breakingNews.push(alert);
        } else if (alert.urgency === 'developing' || (isRecent && dynamicScore > 0.6)) {
          developingStories.push(alert);
        } else if (dynamicScore > 0.3) {
          trendingTopics.push(alert);
        }
      }

      // 格式化输出，使用 published_date 显示"发布于X小时前"
      const formatAlert = (alert: any, category: string) => ({
        id: alert.id,
        title: alert.title,
        topic: alert.topic || '未分类',
        time: formatTimeAgoPublished(alert.published_date),
        type: getAlertType(alert.source),
        url: alert.url,
        category, // 'breaking', 'developing', 'trending'
        relevanceScore: alert.relevance_score ?? 0.5,
        urgency: alert.urgency || 'ongoing',
      });

      const formattedAlerts = [
        ...breakingNews.slice(0, 3).map(a => formatAlert(a, 'breaking')),
        ...developingStories.slice(0, 5).map(a => formatAlert(a, 'developing')),
        ...trendingTopics.slice(0, 7).map(a => formatAlert(a, 'trending')),
      ].slice(0, 15); // 最多返回15条

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

  /**
   * Format time ago as "发布于X小时前" (Published X hours ago)
   * Used for activity feed to show published date instead of collected date
   */
  function formatTimeAgoPublished(dateStr: string | null): string {
    if (!dateStr) return '发布时间未知';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `发布于${diffMins}分钟前`;
    if (diffHours < 24) return `发布于${diffHours}小时前`;
    if (diffDays < 7) return `发布于${diffDays}天前`;
    return `发布于${date.toLocaleDateString('zh-CN')}`;
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

  /**
   * Get documents filtered by time period (for report generation)
   * Ensures only documents with published_date within the period are included
   * Query params:
   *   - topic_id: required, topic to filter by
   *   - period_start: required, start date (ISO format or YYYY-MM-DD)
   *   - period_end: required, end date (ISO format or YYYY-MM-DD)
   *   - use_published_date: if true, filter by published_date (default: true)
   *   - include_metadata: if true, include full metadata (default: false)
   */
  app.get("/api/documents/by-period", async (req, res) => {
    try {
      const { topic_id, period_start, period_end, use_published_date = 'true', include_metadata = 'false' } = req.query;

      if (!topic_id || !period_start || !period_end) {
        return res.status(400).json({
          error: "Missing required parameters: topic_id, period_start, period_end"
        });
      }

      // Normalize dates to ISO format for consistent comparison
      const normalizeDate = (dateStr: string): string => {
        // If already ISO format with time, return as-is
        if (dateStr.includes('T') || dateStr.includes(' ')) {
          return dateStr;
        }
        // Convert YYYY-MM-DD to YYYY-MM-DDT00:00:00.000Z
        return `${dateStr}T00:00:00.000Z`;
      };

      const startDate = normalizeDate(period_start as string);
      const endDateStr = period_end as string;
      const endDate = (endDateStr.includes('T') || endDateStr.includes(' '))
        ? endDateStr
        : `${endDateStr}T23:59:59.999Z`;

      const usePublished = use_published_date === 'true';
      const dateColumn = usePublished ? 'published_date' : 'collected_date';

      // Build query with strict time filtering
      const query = `
        SELECT id, title, source, source_url, ${dateColumn} as date,
               published_date, collected_date, substr(content, 1, 500) as excerpt,
               urgency, relevance_score, freshness_hours
        FROM documents
        WHERE topic_id = ?
          AND ${dateColumn} IS NOT NULL
          AND ${dateColumn} >= ?
          AND ${dateColumn} <= ?
        ORDER BY ${dateColumn} DESC
        LIMIT 200
      `;

      const rows = await db.all(query, [topic_id, startDate, endDate]);

      // Get counts for verification
      const countQuery = `
        SELECT COUNT(*) as total
        FROM documents
        WHERE topic_id = ?
          AND ${dateColumn} IS NOT NULL
          AND ${dateColumn} >= ?
          AND ${dateColumn} <= ?
      `;
      const countResult = await db.get(countQuery, [topic_id, startDate, endDate]);

      res.json({
        documents: rows.map(row => ({
          ...row,
          metadata: include_metadata === 'true' ? safeJsonParse(row.metadata) : undefined
        })),
        period: { start: startDate, end: endDate },
        date_column: dateColumn,
        total_in_period: countResult?.total || 0,
        returned: rows.length
      });
    } catch (error) {
      console.error("Failed to fetch documents by period:", error);
      res.status(500).json({ error: "Failed to fetch documents by period" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const doc = req.body;
      const collectedDate = doc.collected_date || new Date().toISOString();

      // Calculate timeliness metrics
      const urgency = doc.urgency || 'ongoing';
      const freshnessHours = calculateFreshnessHours(doc.published_date || null);
      const relevanceScore = doc.relevance_score ?? calculateTimeDecay(doc.published_date || null, urgency);

      // Calculate deduplication hash
      const dedupHash = computeDedupHash(doc.source_url || null, doc.title);

      // Check for duplicate
      const existing = await findDuplicateByHash(dedupHash);
      if (existing) {
        // Update existing document instead of creating duplicate
        await updateOnRecollect(existing.id);
        const updated = await db.get("SELECT * FROM documents WHERE id = ?", [existing.id]);
        const document = {
          ...updated,
          metadata: safeJsonParse(updated.metadata)
        };
        res.status(200).json({
          ...document,
          _action: 'updated',
          _message: 'Document already exists, updated collection metadata'
        });
        return;
      }

      const id = doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO documents (id, title, source, source_url, published_date, collected_date, content, topic_id, metadata, urgency, relevance_score, freshness_hours, original_source, dedup_hash, collection_count, first_collected_at, last_collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          doc.title,
          doc.source || null,
          doc.source_url || null,
          doc.published_date || null,
          collectedDate,
          doc.content || null,
          doc.topic_id || null,
          doc.metadata ? JSON.stringify(doc.metadata) : null,
          urgency,
          relevanceScore,
          freshnessHours,
          doc.source || null,  // original_source
          dedupHash,            // dedup_hash
          1,                    // collection_count
          now,                  // first_collected_at
          now                   // last_collected_at
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
      const sourceUrl = `file://${result.file.id}`;
      const source = '内部文档';

      // Calculate deduplication hash for uploaded file
      const dedupHash = computeDedupHash(sourceUrl, result.file.title);

      // Check for duplicate (same file uploaded again)
      const existing = await findDuplicateByHash(dedupHash);
      if (existing) {
        // Update existing document
        await updateOnRecollect(existing.id);
        return res.json({
          id: existing.id,
          title: result.file.title,
          source: source,
          _action: 'updated',
          _message: 'File already exists, updated collection metadata'
        });
      }

      await db.run(
        `INSERT INTO documents (id, title, source, source_url, published_date, collected_date, content, topic_id, metadata, created_at, original_source, dedup_hash, collection_count, first_collected_at, last_collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentId,
          result.file.title,
          source,
          sourceUrl,
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
          source,               // original_source
          dedupHash,            // dedup_hash
          1,                    // collection_count
          now,                  // first_collected_at
          now                   // last_collected_at
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
   * GET /api/topics/:id/scoring
   * 获取主题的数据评分
   */
  app.get("/api/topics/:id/scoring", requireAdmin, async (req, res) => {
    try {
      const topicId = req.params.id;
      const docCount = await db.get("SELECT COUNT(*) as count FROM documents WHERE topic_id = ?", [topicId]);
      const entityCount = await db.get("SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?", [topicId]);
      const claimCount = await db.get("SELECT COUNT(*) as count FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = ?", [topicId]);
      const eventCount = await db.get("SELECT COUNT(*) as count FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ?", [topicId]);

      const docs = docCount?.count || 0;
      const entities = entityCount?.count || 0;
      const claims = claimCount?.count || 0;
      const events = eventCount?.count || 0;
      const score = Math.min(100, docs * 5 + entities * 2 + claims * 3 + events * 4);

      let recommendation = '建议增加数据采集量';
      if (score >= 70) recommendation = '数据充分，可以生成深度分析报告';
      else if (score >= 40) recommendation = '数据基本充足，建议补充采集后生成报告';

      res.json({ score, breakdown: { documents: docs, entities, claims, events }, recommendation });
    } catch (error) {
      res.status(500).json({ error: "Failed to compute scoring" });
    }
  });

  // ===== Graph Database API =====

  /**
   * GET /api/graph/status
   * 获取图数据库状态
   */
  app.get("/api/graph/status", async (req, res) => {
    try {
      const entityCount = await db.get("SELECT COUNT(*) as count FROM entities");
      const relCount = await db.get("SELECT COUNT(*) as count FROM relations");
      const claimCount = await db.get("SELECT COUNT(*) as count FROM claims");
      const eventCount = await db.get("SELECT COUNT(*) as count FROM events");
      const lastEntity = await db.get("SELECT MAX(created_at) as last FROM entities");
      res.json({
        backend: "sqlite",
        nodeCount: entityCount?.count || 0,
        relationshipCount: relCount?.count || 0,
        claimCount: claimCount?.count || 0,
        eventCount: eventCount?.count || 0,
        lastSyncAt: lastEntity?.last || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get graph status" });
    }
  });

  // ── Graph helpers: deterministic node IDs from entity text ──
  function entityNodeId(text: string): string {
    return 'e_' + Buffer.from(text, 'utf-8').toString('base64url');
  }
  function nodeIdToText(id: string): string | null {
    if (!id.startsWith('e_')) return null;
    try { return Buffer.from(id.slice(2), 'base64url').toString('utf-8'); } catch { return null; }
  }

  /**
   * GET /api/graph/topic/:id
   * 获取主题图谱 — SQLite-direct (entities, relations, events, claims)
   */
  app.get("/api/graph/topic/:id", async (req, res) => {
    try {
      const topicId = req.params.id;

      const topic = await db.get("SELECT * FROM topics WHERE id = ?", [topicId]);
      if (!topic) return res.status(404).json({ error: "Topic not found" });

      const nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }> = [];
      const links: Array<{ id: string; source: string; target: string; label: string; properties: Record<string, any> }> = [];

      // Topic center node
      nodes.push({
        id: topicId,
        label: topic.name,
        type: 'topic',
        properties: { description: topic.description },
      });

      // Deduplicated entity nodes (top 80 by document count)
      const entities = await db.all(`
        SELECT e.text, e.type, COUNT(DISTINCT e.document_id) as doc_count,
               MAX(e.confidence) as confidence, MIN(e.created_at) as first_seen
        FROM entities e JOIN documents d ON e.document_id = d.id
        WHERE d.topic_id = ?
        GROUP BY e.text ORDER BY doc_count DESC LIMIT 80
      `, [topicId]);

      const entityTexts = new Set(entities.map(e => e.text));
      for (const ent of entities) {
        const nid = entityNodeId(ent.text);
        nodes.push({
          id: nid, label: ent.text,
          type: (ent.type || 'entity').toLowerCase(),
          properties: { docCount: ent.doc_count, confidence: ent.confidence, firstSeen: ent.first_seen },
        });
        links.push({ id: `t-${nid}`, source: topicId, target: nid, label: 'HAS_ENTITY', properties: {} });
      }

      // Relations between deduplicated entities (best confidence per pair+type)
      const rawRels = await db.all(`
        SELECT r.source_text, r.target_text, r.relation, MAX(r.confidence) as confidence
        FROM relations r JOIN documents d ON r.document_id = d.id
        WHERE d.topic_id = ? AND r.source_text != r.target_text
        GROUP BY r.source_text, r.target_text, r.relation
        ORDER BY confidence DESC LIMIT 60
      `, [topicId]);

      let relIdx = 0;
      for (const rel of rawRels) {
        if (!entityTexts.has(rel.source_text) || !entityTexts.has(rel.target_text)) continue;
        links.push({
          id: `r${relIdx++}`,
          source: entityNodeId(rel.source_text),
          target: entityNodeId(rel.target_text),
          label: (rel.relation || 'RELATED_TO').toUpperCase(),
          properties: { confidence: rel.confidence },
        });
      }

      // Event nodes (top 15)
      const events = await db.all(`
        SELECT ev.id, ev.title, ev.type, ev.event_time, ev.participants, ev.confidence
        FROM events ev JOIN documents d ON ev.document_id = d.id
        WHERE d.topic_id = ?
        ORDER BY ev.confidence DESC, ev.event_time DESC LIMIT 15
      `, [topicId]);

      for (const ev of events) {
        const evId = `ev_${ev.id}`;
        nodes.push({
          id: evId, label: ev.title || ev.type, type: 'event',
          properties: { eventType: ev.type, eventTime: ev.event_time, confidence: ev.confidence },
        });
        links.push({ id: `ev-${evId}`, source: topicId, target: evId, label: 'HAS_EVENT', properties: {} });
        // Link participants to event
        if (ev.participants) {
          try {
            const parts = typeof ev.participants === 'string' ? JSON.parse(ev.participants) : ev.participants;
            for (const p of Array.isArray(parts) ? parts : []) {
              const name = typeof p === 'string' ? p : (p.name || p.text);
              if (name && entityTexts.has(name)) {
                links.push({ id: `ep-${evId}-${entityNodeId(name)}`, source: entityNodeId(name), target: evId, label: 'PARTICIPATED_IN', properties: {} });
              }
            }
          } catch { /* skip malformed participants */ }
        }
      }

      // Claim nodes (top 10)
      const claims = await db.all(`
        SELECT c.id, c.text, c.polarity, c.confidence
        FROM claims c JOIN documents d ON c.document_id = d.id
        WHERE d.topic_id = ?
        ORDER BY c.confidence DESC LIMIT 10
      `, [topicId]);

      for (const cl of claims) {
        const clId = `cl_${cl.id}`;
        nodes.push({
          id: clId,
          label: cl.text?.length > 60 ? cl.text.slice(0, 60) + '…' : cl.text,
          type: 'claim',
          properties: { polarity: cl.polarity, confidence: cl.confidence, fullText: cl.text },
        });
        links.push({ id: `cl-${clId}`, source: topicId, target: clId, label: 'HAS_CLAIM', properties: {} });
      }

      res.json({ nodes, links });
    } catch (error) {
      console.error("Failed to get topic graph:", error);
      res.status(500).json({ error: "Failed to get topic graph" });
    }
  });

  /**
   * GET /api/graph/entity/:id
   * 获取实体详情和邻域 — SQLite-direct
   */
  app.get("/api/graph/entity/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const entityText = nodeIdToText(decodeURIComponent(id));

      if (!entityText) {
        // Fallback: try direct DB lookup
        const entity = await db.get("SELECT * FROM entities WHERE id = ?", [id]);
        if (!entity) return res.status(404).json({ error: "Entity not found" });
        return res.json({
          entity: { id, name: entity.text, type: entity.type, properties: { confidence: entity.confidence } },
          relations: [], graph: { nodes: [], links: [] },
        });
      }

      // Find all mentions of this entity
      const entityRecords = await db.all(`
        SELECT e.id, e.text, e.type, e.confidence, e.document_id, d.topic_id
        FROM entities e JOIN documents d ON e.document_id = d.id
        WHERE e.text = ? LIMIT 50
      `, [entityText]);

      if (entityRecords.length === 0) return res.status(404).json({ error: "Entity not found" });

      const mainEntity = entityRecords[0];
      const docCount = entityRecords.length;

      // Relations where this entity is source or target
      const relations = await db.all(`
        SELECT r.source_text, r.target_text, r.relation, r.confidence
        FROM relations r JOIN documents d ON r.document_id = d.id
        WHERE (r.source_text = ? OR r.target_text = ?)
        ORDER BY r.confidence DESC LIMIT 30
      `, [entityText, entityText]);

      // Build neighborhood graph
      const nodes: any[] = [{
        id: entityNodeId(entityText), label: entityText,
        type: (mainEntity.type || 'entity').toLowerCase(),
        properties: { docCount, confidence: mainEntity.confidence },
      }];
      const links: any[] = [];
      const neighborTexts = new Set<string>();

      for (const rel of relations) {
        const otherText = rel.source_text === entityText ? rel.target_text : rel.source_text;
        if (otherText === entityText) continue;
        neighborTexts.add(otherText);
        links.push({
          id: `r-${entityNodeId(rel.source_text)}-${entityNodeId(rel.target_text)}`,
          source: entityNodeId(rel.source_text), target: entityNodeId(rel.target_text),
          label: (rel.relation || 'RELATED_TO').toUpperCase(),
          properties: { confidence: rel.confidence },
        });
      }

      for (const text of neighborTexts) {
        const neighbor = await db.get("SELECT type, confidence FROM entities WHERE text = ? LIMIT 1", [text]);
        nodes.push({
          id: entityNodeId(text), label: text,
          type: (neighbor?.type || 'entity').toLowerCase(),
          properties: { confidence: neighbor?.confidence },
        });
      }

      res.json({
        entity: { id: entityNodeId(entityText), name: entityText, type: mainEntity.type, properties: { docCount, confidence: mainEntity.confidence } },
        relations: relations.map(r => ({ sourceText: r.source_text, targetText: r.target_text, relation: r.relation, confidence: r.confidence })),
        graph: { nodes, links },
      });
    } catch (error) {
      console.error("Failed to get entity neighborhood:", error);
      res.status(500).json({ error: "Failed to get entity neighborhood" });
    }
  });

  /**
   * GET /api/graph/claims/:topicId
   * 查找主题相关的 Claims — SQLite-direct
   */
  app.get("/api/graph/claims/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const claims = await db.all(`
        SELECT c.id, c.text, c.polarity, c.confidence, c.source_context
        FROM claims c JOIN documents d ON c.document_id = d.id
        WHERE d.topic_id = ?
        ORDER BY c.confidence DESC LIMIT 30
      `, [topicId]);

      res.json({
        claims: claims.map(c => ({ id: c.id, text: c.text, polarity: c.polarity, confidence: c.confidence, sourceContext: c.source_context })),
        count: claims.length,
      });
    } catch (error) {
      console.error("Failed to find claims:", error);
      res.status(500).json({ error: "Failed to find claims" });
    }
  });

  /**
   * GET /api/graph/related/:entityId
   * 查找相关实体 — SQLite-direct
   */
  app.get("/api/graph/related/:entityId", async (req, res) => {
    try {
      const entityId = req.params.entityId;
      const entityText = nodeIdToText(decodeURIComponent(entityId));

      if (!entityText) return res.json({ entities: [], count: 0 });

      const related = await db.all(`
        SELECT DISTINCT
          CASE WHEN r.source_text = ? THEN r.target_text ELSE r.source_text END as name,
          r.relation, MAX(r.confidence) as confidence
        FROM relations r JOIN documents d ON r.document_id = d.id
        WHERE r.source_text = ? OR r.target_text = ?
        GROUP BY name, r.relation
        ORDER BY confidence DESC LIMIT 20
      `, [entityText, entityText, entityText]);

      const entities = [];
      for (const r of related) {
        const ent = await db.get("SELECT type, confidence FROM entities WHERE text = ? LIMIT 1", [r.name]);
        entities.push({ id: entityNodeId(r.name), name: r.name, type: ent?.type || 'entity', relation: r.relation, confidence: r.confidence });
      }

      res.json({ entities, count: entities.length });
    } catch (error) {
      console.error("Failed to find related entities:", error);
      res.status(500).json({ error: "Failed to find related entities" });
    }
  });

  /**
   * GET /api/graph/recent/:topicId
   * 获取主题的最近发展（时间感知）
   */
  app.get("/api/graph/recent/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const hours = Math.max(1, Math.min(720, parseInt(req.query.hours as string) || 24)); // 默认24小时，最多30天

      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // 获取最近的高相关性文档和实体
      const recentDocuments = await db.all(`
        SELECT
          d.id,
          d.title,
          d.source,
          d.source_url as url,
          d.published_date,
          d.collected_date,
          d.relevance_score,
          d.urgency,
          d.freshness_hours
        FROM documents d
        WHERE d.topic_id = ?
          AND d.collected_date > ?
          AND d.relevance_score > 0.3
        ORDER BY d.relevance_score DESC, d.collected_date DESC
        LIMIT 20
      `, [topicId, cutoffDate]);

      // 获取最近相关的实体（去重，按文档数排序）
      const recentEntities = await db.all(`
        SELECT
          e.text as name,
          e.type,
          COUNT(DISTINCT e.document_id) as document_count,
          MAX(e.created_at) as first_seen_date
        FROM entities e
        JOIN documents d ON e.document_id = d.id
        WHERE d.topic_id = ?
          AND d.collected_date > ?
        GROUP BY e.text
        ORDER BY document_count DESC, first_seen_date DESC
        LIMIT 15
      `, [topicId, cutoffDate]);

      // 获取最近的关系（新兴连接）
      const emergingRelations = await db.all(`
        SELECT
          r.source_text as source_name,
          r.target_text as target_name,
          r.relation as relation_type,
          r.confidence,
          MAX(r.created_at) as first_seen_date
        FROM relations r
        JOIN documents d ON r.document_id = d.id
        WHERE d.topic_id = ?
          AND r.created_at > ?
          AND r.confidence > 0.5
          AND r.source_text != r.target_text
        GROUP BY r.source_text, r.target_text, r.relation
        ORDER BY first_seen_date DESC, r.confidence DESC
        LIMIT 10
      `, [topicId, cutoffDate]);

      res.json({
        documents: recentDocuments.map(d => ({
          id: d.id,
          title: d.title,
          source: d.source,
          url: d.url,
          publishedDate: d.published_date,
          collectedDate: d.collected_date,
          relevanceScore: d.relevance_score,
          urgency: d.urgency,
          freshnessHours: d.freshness_hours,
        })),
        entities: recentEntities.map(e => ({
          id: entityNodeId(e.name),
          name: e.name,
          type: e.type,
          documentCount: e.document_count,
          firstSeenDate: e.first_seen_date,
        })),
        emergingRelations: emergingRelations.map(r => ({
          sourceName: r.source_name,
          targetName: r.target_name,
          relationType: r.relation_type,
          confidence: r.confidence,
          firstSeenDate: r.first_seen_date,
        })),
        timeRange: {
          hours,
          cutoffDate,
        },
        counts: {
          documents: recentDocuments.length,
          entities: recentEntities.length,
          emergingRelations: emergingRelations.length,
        },
      });
    } catch (error) {
      console.error("Failed to fetch recent developments:", error);
      res.status(500).json({ error: "Failed to fetch recent developments" });
    }
  });

  /**
   * GET /api/graph/timeline/:entityId
   * 获取实体演化时间线
   */
  app.get("/api/graph/timeline/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;
      const days = Math.max(7, Math.min(365, parseInt(req.query.days as string) || 30)); // 默认30天

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // 获取实体基本信息
      const entity = await db.get("SELECT * FROM entities WHERE id = ?", [entityId]);
      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }

      const entityText = entity.text;

      // 获取相关的文档时间线
      const documentTimeline = await db.all(`
        SELECT
          d.id,
          d.title,
          d.collected_date,
          d.published_date,
          d.relevance_score,
          d.source
        FROM documents d
        JOIN entities e ON d.id = e.document_id
        WHERE e.text = ?
          AND d.collected_date > ?
        ORDER BY d.collected_date DESC
        LIMIT 50
      `, [entityText, cutoffDate]);

      // 获取关系演化（新出现的关系）
      const relationEvolution = await db.all(`
        SELECT
          r.relation as relation_type,
          r.created_at as first_seen_date,
          r.confidence,
          CASE WHEN r.source_text = ? THEN r.target_text ELSE r.source_text END as related_entity_name,
          (SELECT e3.type FROM entities e3 WHERE e3.text = CASE WHEN r.source_text = ? THEN r.target_text ELSE r.source_text END LIMIT 1) as related_entity_type,
          CASE WHEN r.source_text = ? THEN 'source' ELSE 'target' END as direction
        FROM relations r
        JOIN documents d ON r.document_id = d.id
        WHERE (r.source_text = ? OR r.target_text = ?)
          AND r.created_at > ?
        ORDER BY r.created_at DESC
        LIMIT 30
      `, [entityText, entityText, entityText, entityText, entityText, cutoffDate]);

      // 按日期聚合数据
      const timelineByDate: Record<string, {
        date: string;
        documentCount: number;
        avgRelevance: number;
        newRelations: number;
      }> = {};

      documentTimeline.forEach(d => {
        const dateKey = d.collected_date.split('T')[0];
        if (!timelineByDate[dateKey]) {
          timelineByDate[dateKey] = {
            date: dateKey,
            documentCount: 0,
            avgRelevance: 0,
            newRelations: 0,
          };
        }
        timelineByDate[dateKey].documentCount++;
        timelineByDate[dateKey].avgRelevance += d.relevance_score || 0.5;
      });

      relationEvolution.forEach(r => {
        const dateKey = r.first_seen_date.split('T')[0];
        if (timelineByDate[dateKey]) {
          timelineByDate[dateKey].newRelations++;
        }
      });

      // 计算平均相关性并转换为数组
      const timeline = Object.values(timelineByDate)
        .map(t => ({
          ...t,
          avgRelevance: t.documentCount > 0 ? t.avgRelevance / t.documentCount : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        entity: {
          id: entity.id,
          name: entity.text,
          type: entity.type,
          firstSeenDate: entity.created_at,
        },
        timeline,
        documents: documentTimeline,
        relationEvolution,
        stats: {
          totalDocuments: documentTimeline.length,
          totalNewRelations: relationEvolution.length,
          dateRange: days,
        },
      });
    } catch (error) {
      console.error("Failed to fetch entity timeline:", error);
      res.status(500).json({ error: "Failed to fetch entity timeline" });
    }
  });

  /**
   * POST /api/graph/sync/:topicId
   * 触发主题图谱同步到 Neo4j/JSON 存储
   */
  app.post("/api/graph/sync/:topicId", async (req, res) => {
    try {
      const topicId = req.params.topicId;
      const topic = await db.get("SELECT name FROM topics WHERE id = ?", [topicId]);
      if (!topic) {
        res.status(404).json({ error: "Topic not found" });
        return;
      }
      res.json({
        message: "Use POST /api/skill/extract to extract knowledge from documents",
        topicId,
        topicName: topic.name,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process sync request" });
    }
  });

  // ===== Reports Read API =====


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
      console.log(`[DELETE] /api/reports/${req.params.id}`);
      const result = await db.run("DELETE FROM reports WHERE id = ?", [req.params.id]);
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

  // ===== Review API =====

  /**
   * GET /api/reviews
   * 获取待审核项目列表（claims和entities）
   * Query params: status (pending/approved/rejected), type (claim_review/entity_disambig)
   */
  app.get("/api/reviews", async (req, res) => {
    try {
      const { status = 'pending', type } = req.query;

      // 构建查询条件
      let whereClause = "WHERE review_status = ?";
      const params: any[] = [status];

      if (type === 'claim_review') {
        // 只查询claims
        whereClause += " AND confidence < 0.7";
        const claims = await db.all(
          `SELECT
            id,
            'claim_review' as type,
            text as content,
            source_context as source,
            confidence,
            created_at as time
           FROM claims
           ${whereClause}
           ORDER BY created_at DESC`,
          params
        );

        // 添加topic信息
        const reviews = await Promise.all(claims.map(async (claim: any) => {
          const doc = await db.get("SELECT topic_id, url FROM documents WHERE id = (SELECT document_id FROM claims WHERE id = ?)", [claim.id]);
          return {
            ...claim,
            topic_id: doc?.topic_id || '',
            source_url: doc?.url || '',
            topic_name: doc?.topic_id || '未分类',
            reason: ''
          };
        }));

        return res.json(reviews);
      } else if (type === 'entity_disambig') {
        // 只查询entities
        whereClause += " AND confidence < 0.7";
        const entities = await db.all(
          `SELECT
            id,
            'entity_disambig' as type,
            text as content,
            '' as source,
            confidence,
            created_at as time
           FROM entities
           ${whereClause}
           ORDER BY created_at DESC`,
          params
        );

        // 添加topic信息
        const reviews = await Promise.all(entities.map(async (entity: any) => {
          const doc = await db.get("SELECT topic_id, url FROM documents WHERE id = (SELECT document_id FROM entities WHERE id = ?)", [entity.id]);
          return {
            ...entity,
            topic_id: doc?.topic_id || '',
            source_url: doc?.url || '',
            topic_name: doc?.topic_id || '未分类',
            reason: ''
          };
        }));

        return res.json(reviews);
      } else {
        // 查询所有
        const claims = await db.all(
          `SELECT
            id,
            'claim_review' as type,
            text as content,
            source_context as source,
            confidence,
            created_at as time
           FROM claims
           WHERE review_status = ? AND confidence < 0.7
           ORDER BY created_at DESC
           LIMIT 50`,
          [status]
        );

        const entities = await db.all(
          `SELECT
            id,
            'entity_disambig' as type,
            text as content,
            '' as source,
            confidence,
            created_at as time
           FROM entities
           WHERE review_status = ? AND confidence < 0.7
           ORDER BY created_at DESC
           LIMIT 50`,
          [status]
        );

        // 合并结果并添加topic信息
        const allItems = [...claims, ...entities];
        const reviews = await Promise.all(allItems.map(async (item: any) => {
          const tableName = item.type === 'claim_review' ? 'claims' : 'entities';
          const doc = await db.get(`SELECT topic_id, url FROM documents WHERE id = (SELECT document_id FROM ${tableName} WHERE id = ?)`, [item.id]);
          return {
            ...item,
            topic_id: doc?.topic_id || '',
            source_url: doc?.url || '',
            topic_name: doc?.topic_id || '未分类',
            reason: ''
          };
        }));

        // 按时间排序
        reviews.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());

        return res.json(reviews);
      }
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  /**
   * GET /api/reviews/stats
   * 获取审核统计信息
   */
  app.get("/api/reviews/stats", async (req, res) => {
    try {
      const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'pending' AND confidence < 0.7"),
        db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'pending' AND confidence < 0.7"),
        db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'approved'"),
        db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'approved'"),
        db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'rejected'"),
        db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'rejected'"),
      ]);

      const pendingClaims = (pendingResult as any)?.count || 0;
      const pendingEntities = (approvedResult as any)?.count || 0;
      const approvedClaims = (approvedResult as any)?.count || 0;
      const approvedEntities = (rejectedResult as any)?.count || 0;
      const rejectedClaims = (rejectedResult as any)?.count || 0;
      const rejectedEntities = (rejectedResult as any)?.count || 0;

      res.json({
        total: pendingClaims + pendingEntities,
        entityDisambig: pendingEntities,
        claimReview: pendingClaims,
        conflictResolve: 0
      });
    } catch (error) {
      console.error("Failed to fetch review stats:", error);
      res.status(500).json({ error: "Failed to fetch review stats" });
    }
  });

  /**
   * POST /api/reviews/:id/approve
   * 审核通过
   */
  app.post("/api/reviews/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;

      // 尝试更新claims表
      const claimResult = await db.run(
        "UPDATE claims SET review_status = 'approved' WHERE id = ?",
        [id]
      );

      // 如果claims表没有更新，尝试entities表
      if (claimResult.changes === 0) {
        const entityResult = await db.run(
          "UPDATE entities SET review_status = 'approved' WHERE id = ?",
          [id]
        );

        if (entityResult.changes === 0) {
          return res.status(404).json({ error: "Review item not found" });
        }
      }

      res.json({ success: true });
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

      // 尝试更新claims表
      const claimResult = await db.run(
        "UPDATE claims SET review_status = 'rejected' WHERE id = ?",
        [id]
      );

      // 如果claims表没有更新，尝试entities表
      if (claimResult.changes === 0) {
        const entityResult = await db.run(
          "UPDATE entities SET review_status = 'rejected' WHERE id = ?",
          [id]
        );

        if (entityResult.changes === 0) {
          return res.status(404).json({ error: "Review item not found" });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to reject review:", error);
      res.status(500).json({ error: "Failed to reject review" });
    }
  });

  // ===== Report Pipeline API (v2) =====

  const { migrateReportTables } = await import('./src/services/reportService.js');
  await migrateReportTables(db);

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

  /**
   * Enhanced period computation supporting:
   * - Custom period with start/end dates
   * - Preset time ranges: "24h", "7d", "30d", "90d", "1y"
   * - Report type defaults
   */
  function computePeriod(
    reportType: string,
    period?: { start?: string; end?: string; preset?: string }
  ): { start: string; end: string; preset?: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtDateTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;

    // If custom start/end provided, use them
    if (period?.start && period?.end) {
      return { start: period.start, end: period.end, preset: period.preset };
    }

    // Handle preset time ranges
    if (period?.preset) {
      const preset = period.preset.toLowerCase();
      switch (preset) {
        case '24h':
        case '1d': {
          const start = fmtDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
          return { start, end: fmtDateTime(now), preset: period.preset };
        }
        case '7d': {
          const start = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
          return { start, end: fmtDate(now), preset: period.preset };
        }
        case '30d': {
          const start = fmtDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
          return { start, end: fmtDate(now), preset: period.preset };
        }
        case '90d': {
          const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
          return { start, end: fmtDate(now), preset: period.preset };
        }
        case '1y':
        case '365d': {
          const start = fmtDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
          return { start, end: fmtDate(now), preset: period.preset };
        }
        default:
          console.warn(`[computePeriod] Unknown preset: ${period.preset}, falling back to reportType default`);
          break;
      }
    }

    // Report type defaults
    switch (reportType) {
      case 'daily': {
        const today = fmtDate(now);
        return { start: today, end: today, preset: 'daily' };
      }
      case 'weekly': {
        const weekAgo = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        return { start: weekAgo, end: fmtDate(now), preset: 'weekly' };
      }
      case 'monthly': {
        const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        const monthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        return { start: monthStart, end: monthEnd, preset: 'monthly' };
      }
      case 'quarterly': {
        const q = Math.floor(now.getMonth() / 3);
        const qStart = fmtDate(new Date(now.getFullYear(), q * 3, 1));
        const qEnd = fmtDate(new Date(now.getFullYear(), q * 3 + 3, 0));
        return { start: qStart, end: qEnd, preset: 'quarterly' };
      }
      case 'tech_topic': {
        const start = fmtDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: '30d' };
      }
      case 'competitor': {
        const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDate(now), preset: '90d' };
      }
      case 'alert': {
        const start = fmtDateTime(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
        return { start, end: fmtDateTime(now), preset: '24h' };
      }
      default: {
        const weekAgo = fmtDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        return { start: weekAgo, end: fmtDate(now), preset: 'weekly' };
      }
    }
  }

  /**
   * Trigger automatic data collection for a time period
   * This runs the research skill with deduplication and time-range filtering
   */
  async function triggerCollectionForPeriod(
    topicId: string,
    topicName: string,
    periodStart: string,
    periodEnd: string,
    keywords: string[] = [],
    organizations: string[] = []
  ): Promise<{ executionId: string; collected: number; duplicatesSkipped: number }> {
    // Get topic details for collection
    const topic = await db.get(
      "SELECT keywords, organizations FROM topics WHERE id = ?",
      [topicId]
    );

    const topicKeywords = keywords.length > 0
      ? keywords
      : (topic?.keywords ? JSON.parse(topic.keywords) : []);

    const topicOrgs = organizations.length > 0
      ? organizations
      : (topic?.organizations ? JSON.parse(topic.organizations) : []);

    // Check for existing documents in the period to assess coverage
    const existingDocs = await db.get(
      `SELECT COUNT(*) as count FROM documents
       WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
      [topicId, periodStart, periodEnd]
    );
    const existingCount = existingDocs?.count || 0;

    // Skip collection if we already have sufficient coverage (configurable threshold)
    const MIN_DOCS_THRESHOLD = 5;
    if (existingCount >= MIN_DOCS_THRESHOLD) {
      console.log(`[Collection] Skipping collection for topic ${topicId}: ${existingCount} docs already exist in period`);
      return { executionId: 'skip', collected: 0, duplicatesSkipped: 0 };
    }

    // Execute research skill with time range
    const researchParams = {
      topicId,
      topicName,
      keywords: JSON.stringify(topicKeywords),
      organizations: JSON.stringify(topicOrgs),
      timeRangeStart: periodStart,
      timeRangeEnd: periodEnd,
      maxResults: 20, // Limit for automatic collection
    };

    const { executionId, promise } = skillExecutor.startExecution('research', researchParams);

    // Wait for completion (with timeout — research skill timeout is 1200s)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Collection timeout')), 600000)
    );

    try {
      await Promise.race([promise, timeout]) as any;
      console.log(`[Collection] Completed collection for topic ${topicId}, execution ${executionId}`);
    } catch (err: any) {
      console.error(`[Collection] Failed or timeout:`, err?.message || err);
    }

    // Count new documents collected
    const newDocs = await db.get(
      `SELECT COUNT(*) as count FROM documents
       WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
      [topicId, periodStart, periodEnd]
    );

    return {
      executionId,
      collected: (newDocs?.count || 0) - existingCount,
      duplicatesSkipped: 0 // Would be calculated from research skill output
    };
  }

  /**
   * Get documents count within a time period for reporting
   */
  async function getDocumentsCountInPeriod(topicId: string, periodStart: string, periodEnd: string): Promise<number> {
    const result = await db.get(
      `SELECT COUNT(*) as count FROM documents
       WHERE topic_id = ? AND published_date >= ? AND published_date <= ?`,
      [topicId, periodStart, periodEnd]
    );
    return result?.count || 0;
  }

  /**
   * Get unique sources count within a time period
   */
  async function getUniqueSourcesCountInPeriod(topicId: string, periodStart: string, periodEnd: string): Promise<number> {
    const result = await db.get(
      `SELECT COUNT(DISTINCT source) as count FROM documents
       WHERE topic_id = ? AND published_date >= ? AND published_date <= ? AND source IS NOT NULL`,
      [topicId, periodStart, periodEnd]
    );
    return result?.count || 0;
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

      // Step 1: Collect data first (blocking) — report needs data to be useful
      const autoCollect = options?.autoCollect !== false;
      let collectionResult = { executionId: '', collected: 0, duplicatesSkipped: 0 };

      if (autoCollect) {
        console.log(`[ReportGenerate] Auto-collection for topic ${topicId}, period ${computedPeriod.start} - ${computedPeriod.end}`);
        try {
          collectionResult = await triggerCollectionForPeriod(
            topicId,
            topic.name,
            computedPeriod.start,
            computedPeriod.end,
            options?.keywords || [],
            options?.organizations || []
          );
          console.log(`[ReportGenerate] Collection result:`, collectionResult);
        } catch (collectErr: any) {
          console.error(`[ReportGenerate] Collection failed:`, collectErr?.message || collectErr);
        }
      }

      // Step 2: Check if we have enough data to generate a meaningful report
      const docCount = await getDocumentsCountInPeriod(topicId, computedPeriod.start, computedPeriod.end);
      if (docCount === 0) {
        res.status(400).json({
          error: '当前时间范围内没有文档数据，请先采集数据或调整时间范围',
          collectionResult,
        });
        return;
      }

      // Step 3: Start report skill with collected data
      params.collectionResult = collectionResult;
      params.periodPreset = computedPeriod.preset;

      // All report types: use single-skill execution (faster than multi-step workflow)
      const { executionId, promise } = skillExecutor.startExecution(skillName, params);

      // Route report results through handleReportResult
      promise.then(async (execution) => {
        await handleReportResult(execution, params, computedPeriod);
        ws.send(execution.id, 'result', JSON.stringify(execution.result ?? { error: execution.error }));
      }).catch((err) => {
        console.error(`[ReportGenerate] Error:`, err);
      });

      res.json({
        executionId,
        skillName,
        reportType,
        period: computedPeriod,
        status: 'started',
        autoCollect,
        collectionResult,
        documentsAvailable: docCount,
      });
    } catch (error) {
      console.error("Failed to generate report:", error);
      res.status(500).json({ error: "Failed to generate report" });
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
  /**
   * POST /api/config/test
   * Test AI provider connectivity
   */
  app.post("/api/config/test", requireAdmin, async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model } = req.body ?? {};

      if (!provider || !apiKey) {
        return res.status(400).json({ success: false, error: "Provider and API key are required" });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        if (provider === "openai" || provider === "custom") {
          const url = baseUrl || "https://api.openai.com/v1";
          const response = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model || (provider === "openai" ? "gpt-4o" : "gpt-4o"),
              messages: [{ role: "user", content: "test" }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            return res.status(400).json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
          }

          return res.json({ success: true });
        } else if (provider === "gemini") {
          const url = baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash-preview"}:generateContent`;
          const response = await fetch(`${url}?key=${apiKey}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "test" }] }],
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            return res.status(400).json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
          }

          return res.json({ success: true });
        } else {
          return res.status(400).json({ success: false, error: "Unknown provider" });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          return res.status(400).json({ success: false, error: "Request timeout (10s)" });
        }
        return res.status(400).json({ success: false, error: fetchError.message || "Connection failed" });
      }
    } catch (error: any) {
      console.error("Failed to test config:", error);
      res.status(500).json({ success: false, error: "Test failed" });
    }
  });
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

  // ── Convert nested JSON objects to readable Markdown ──
  function jsonToMarkdown(obj: any, depth = 0): string {
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(item => typeof item === 'object' && item !== null ? `- ${jsonToMarkdown(item, depth + 1)}` : `- ${item}`).join('\n');
    if (typeof obj === 'object' && obj !== null) {
      return Object.entries(obj)
        .map(([key, val]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
          if (typeof val === 'string') return `**${label}**: ${val}`;
          if (Array.isArray(val)) {
            const items = val.map((item: any) => typeof item === 'object' && item !== null ? `- ${jsonToMarkdown(item, depth + 1)}` : `- ${item}`).join('\n');
            return `**${label}**:\n${items}`;
          }
          return `**${label}**:\n${jsonToMarkdown(val, depth + 1)}`;
        })
        .join('\n\n');
    }
    return String(obj);
  }

  // ── Extracted report persistence handler (shared by HTTP endpoint & scheduler) ──
  async function handleReportResult(
    execution: SkillExecution,
    params: Record<string, any>,
    computedPeriod?: { start: string; end: string; preset?: string }
  ) {
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

      // Detect LLM API error responses (rate limits, auth failures, etc.)
      if (parsed?.error?.code || parsed?.error?.message) {
        const errMsg = parsed.error.message || parsed.error.code || 'Unknown LLM API error';
        console.error(`[Report] LLM API error: ${errMsg}`);
        await db.run(
          "UPDATE skill_executions SET status = 'failed', error = ? WHERE id = ?",
          [`LLM API 错误: ${errMsg}`, execution.id]
        );
        return;
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
          (obj.title && (obj.sections || obj.content || obj.summary)) ||
          (obj.summary && (obj.sections || obj.content)) ||
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

      // ── Unified report normalization ──
      // All report types now output unified { executiveSummary, sections[], timeline[], metrics } format (v2.0)
      let normalizedContent: any;

      {
        const execSummary = content.executiveSummary ?? {};
        const rawKeyPoints = execSummary.keyPoints ?? [];

        normalizedContent = {
          executiveSummary: {
            overview: execSummary.overview ?? parsed.summary ?? '',
            keyPoints: rawKeyPoints,
            confidence: execSummary.confidence ?? meta.confidence ?? 'medium',
            period: execSummary.period ?? meta.period ?? computedPeriod ?? {},
          },
          sections: (content.sections ?? []).map((sec: any) => {
            // Normalize section.content: convert JSON objects to Markdown strings
            if (sec.content && typeof sec.content !== 'string') {
              sec.content = jsonToMarkdown(sec.content);
            }
            return sec;
          }),
          timeline: content.timeline ?? [],
          metrics: content.metrics ?? {},
        };
      }

      const hasSubstantialContent = (normalizedContent.sections?.length ?? 0) > 0
        || (normalizedContent.executiveSummary.overview?.length ?? 0) > 50;
      const rawStr = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
      if (!hasSubstantialContent && rawStr.length > 100) {
        // Try to extract a nested JSON report from the raw string
        const nestedReport = tryParseReportJson(rawStr);
        if (nestedReport && hasReportStructure(nestedReport)) {
          const nestedContent = nestedReport.content ?? nestedReport;
          const nestedExecSummary = nestedContent.executiveSummary ?? {};
          normalizedContent.executiveSummary.overview = nestedExecSummary.overview ?? nestedReport.summary ?? '';
          normalizedContent.executiveSummary.keyPoints = nestedExecSummary.keyPoints ?? [];
          normalizedContent.executiveSummary.confidence = nestedExecSummary.confidence ?? 'medium';
          normalizedContent.sections = (nestedContent.sections ?? []).map((sec: any) => {
            if (sec.content && typeof sec.content !== 'string') {
              sec.content = jsonToMarkdown(sec.content);
            }
            return sec;
          });
          normalizedContent.timeline = nestedContent.timeline ?? [];
          normalizedContent.metrics = nestedContent.metrics ?? {};
        } else {
          // Last resort: store as raw markdown
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
      }

      const TYPE_LABELS: Record<string, string> = {
        daily: '日报', weekly: '周报', monthly: '月报', quarterly: '季报',
        tech_topic: '技术专题', competitor: '友商分析', alert: '预警',
      };
      const periodStart = computedPeriod?.start ?? normalizedContent.executiveSummary.period?.start;
      const periodEnd = computedPeriod?.end ?? normalizedContent.executiveSummary.period?.end;
      let title = parsed.title ?? '';
      // Ensure title includes date range for consistent display
      if (!title || title.length < 5) {
        const label = TYPE_LABELS[reportType] ?? '报告';
        const name = reportType === 'competitor' ? (params.competitorName ?? params.topicName ?? '') : (params.topicName ?? '');
        title = `${name} ${label}`;
      }
      if (periodStart && periodEnd) {
        const dateRange = `${periodStart.slice(0, 10)} ~ ${periodEnd.slice(0, 10)}`;
        if (!title.includes(dateRange) && !title.includes('—') && !title.includes(' ~ ')) {
          title = `${title} · ${dateRange}`;
        }
      }
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

      // Validate report structure with Zod schema
      const validation = validateReportOutput({ title, summary, content: normalizedContent });
      if (validation.warnings.length > 0) {
        console.warn('[Report] Schema validation warnings:', validation.warnings);
      }
      if (!validation.valid) {
        console.warn('[Report] Schema validation failed, proceeding with best-effort save');
        if (normalizedContent.executiveSummary) {
          normalizedContent.executiveSummary.confidence = 'low';
        }
      }

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

      // Create report_time_periods entry for tracking
      try {
        const periodStart = computedPeriod?.start || period.start;
        const periodEnd = computedPeriod?.end || period.end;
        const presetType = computedPeriod?.preset || params.periodPreset;

        // Count documents and sources within the period
        const docsInPeriod = await getDocumentsCountInPeriod(params.topicId, periodStart, periodEnd);
        const sourcesInPeriod = await getUniqueSourcesCountInPeriod(params.topicId, periodStart, periodEnd);

        await db.run(
          `INSERT INTO report_time_periods (id, report_id, period_start, period_end, preset_type, documents_count, sources_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `rtp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            rptId,
            periodStart,
            periodEnd,
            presetType || null,
            docsInPeriod,
            sourcesInPeriod
          ]
        );
        console.log(`[Report] Created time period entry: ${periodStart} - ${periodEnd}, ${docsInPeriod} docs, ${sourcesInPeriod} sources`);
      } catch (periodErr) {
        console.error('[Report] Failed to create report_time_periods entry:', periodErr);
        // Non-critical error, continue with report processing
      }

      // Graph links removed - using SQLite only
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
  scheduler.setCollectFunction(async (topicId, topicName, start, end) => {
    return triggerCollectionForPeriod(topicId, topicName, start, end);
  });
  scheduler.setGetDocumentsCountInPeriod(async (topicId, start, end) => {
    return getDocumentsCountInPeriod(topicId, start, end);
  });

  // Trigger a skill execution
  app.post("/api/skill/:name", requireAdmin, async (req, res) => {
    const { name } = req.params;
    const params = req.body ?? {};

    // Research skill is only available via /api/reports/generate (auto-collect)
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
        await handleReportResult(execution, params);
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

  // ── Time Period Document Query API ──

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
