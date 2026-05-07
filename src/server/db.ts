import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { getKuzuConnection } from '../db/kuzu.js';
import { GraphSensemakingService } from '../services/graphSensemaking.js';
import type { Database } from 'sqlite';

export async function initDatabase(): Promise<{ db: Database; graphSensemaking: GraphSensemakingService }> {
  const dbPath = path.resolve(process.cwd(), "database.sqlite");
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await getKuzuConnection();
  console.log('[Kuzu] Graph database initialized');

  // Create tables
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
      schedule TEXT,
      daily_report_enabled INTEGER DEFAULT 0,
      weekly_report_enabled INTEGER DEFAULT 0,
      monthly_report_enabled INTEGER DEFAULT 0,
      quarterly_report_enabled INTEGER DEFAULT 0,
      collection_time TEXT DEFAULT '06:00'
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
      cover_image_url TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_documents_urgency ON documents(urgency);
    CREATE INDEX IF NOT EXISTS idx_documents_relevance ON documents(relevance_score);
    CREATE INDEX IF NOT EXISTS idx_documents_published_date ON documents(published_date);

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

    CREATE TABLE IF NOT EXISTS bilevel_skills (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bilevel_traces (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      run_number INTEGER,
      scores TEXT,
      overall INTEGER,
      strategy_used TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skill_versions (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      changelog TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(skill_name, version)
    );

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

    CREATE TABLE IF NOT EXISTS report_time_periods (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      preset_type TEXT,
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

    CREATE TABLE IF NOT EXISTS report_discussions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      section_id TEXT,
      selected_text TEXT NOT NULL,
      user_input TEXT,
      result TEXT NOT NULL,
      topic_id TEXT,
      pinned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_discussions_report ON report_discussions(report_id);

    CREATE INDEX IF NOT EXISTS idx_report_time_periods_report_id ON report_time_periods(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_time_periods_period_start ON report_time_periods(period_start);
    CREATE INDEX IF NOT EXISTS idx_report_time_periods_period_end ON report_time_periods(period_end);

    CREATE TABLE IF NOT EXISTS graph_sensemaking_cache (
      topic_id TEXT NOT NULL,
      graph_hash TEXT NOT NULL,
      result_json TEXT,
      status TEXT DEFAULT 'ready',
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (topic_id, graph_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_graph_sensemaking_topic ON graph_sensemaking_cache(topic_id);
    CREATE INDEX IF NOT EXISTS idx_graph_sensemaking_updated ON graph_sensemaking_cache(updated_at);
  `);

  const graphSensemaking = new GraphSensemakingService(db);

  // --- Migrations ---
  const migrations: string[] = [
    `ALTER TABLE documents ADD COLUMN urgency TEXT DEFAULT 'ongoing'`,
    `ALTER TABLE documents ADD COLUMN relevance_score REAL DEFAULT 0.5`,
    `ALTER TABLE documents ADD COLUMN freshness_hours REAL DEFAULT 0`,
    `ALTER TABLE documents ADD COLUMN original_source TEXT`,
    `ALTER TABLE documents ADD COLUMN dedup_hash TEXT`,
    `ALTER TABLE documents ADD COLUMN collection_count INTEGER DEFAULT 1`,
    `ALTER TABLE documents ADD COLUMN first_collected_at TEXT`,
    `ALTER TABLE documents ADD COLUMN last_collected_at TEXT`,
    `ALTER TABLE skill_executions ADD COLUMN skill_version TEXT DEFAULT '0.0.0'`,
    `ALTER TABLE reports ADD COLUMN review_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE claims ADD COLUMN review_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE entities ADD COLUMN review_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE topics ADD COLUMN weekly_report_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE topics ADD COLUMN collection_time TEXT DEFAULT '06:00'`,
    `ALTER TABLE skill_executions ADD COLUMN pipeline_id TEXT`,
    `ALTER TABLE skill_executions ADD COLUMN pipeline_step TEXT`,
  ];

  for (const sql of migrations) {
    try {
      await db.exec(sql);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.warn('[Migration] Warning:', e.message);
      }
    }
  }

  const indexMigrations = [
    `CREATE INDEX IF NOT EXISTS idx_documents_urgency ON documents(urgency)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_relevance ON documents(relevance_score)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_published_date ON documents(published_date)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_dedup_hash ON documents(dedup_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_original_source ON documents(original_source)`,
  ];
  for (const sql of indexMigrations) {
    try { await db.exec(sql); } catch (e: any) { console.warn('[Migration]', e.message); }
  }

  // Migrate: convert old schedule values to new report_enabled flags
  try {
    const oldTopics = await db.all(`SELECT id, schedule, daily_report_enabled, weekly_report_enabled, monthly_report_enabled, quarterly_report_enabled FROM topics`);
    for (const t of oldTopics) {
      const s = t.schedule;
      if (s === 'daily' && !t.daily_report_enabled && !t.weekly_report_enabled && !t.monthly_report_enabled && !t.quarterly_report_enabled) {
        await db.run(`UPDATE topics SET schedule = 'daily', daily_report_enabled = 1 WHERE id = ?`, [t.id]);
      } else if (s === 'weekly' && !t.weekly_report_enabled) {
        await db.run(`UPDATE topics SET schedule = 'weekly', weekly_report_enabled = 1 WHERE id = ?`, [t.id]);
      } else if (s === 'monthly' && !t.monthly_report_enabled) {
        await db.run(`UPDATE topics SET schedule = 'weekly', monthly_report_enabled = 1 WHERE id = ?`, [t.id]);
      } else if (s === 'collect-daily') {
        await db.run(`UPDATE topics SET schedule = 'daily' WHERE id = ?`, [t.id]);
      }
    }
  } catch (e: any) {
    console.warn('[Migration] Warning migrating topic schedules:', e.message);
  }

  // Seed data if empty
  const count = await db.get("SELECT COUNT(*) as count FROM topics");
  if (count.count === 0) {
    const mockTopics = [
      {
        id: '1', name: '端侧大模型',
        description: '关注端侧推理和轻量化模型方向，包括模型压缩、量化、NPU适配等。',
        aliases: ['on-device LLM', 'edge model'], owner: '张规划', priority: 'high', scope: '全球',
        createdAt: '2025-10-01', keywords: ['端侧推理', '模型压缩', 'NPU inference'],
        organizations: ['Apple', 'Qualcomm', 'Meta', '华为'], schedule: 'daily'
      },
      {
        id: '2', name: '固态电池',
        description: '追踪全固态电池、半固态电池的材料突破、量产进度及车企合作动态。',
        aliases: ['Solid-state battery', 'SSB'], owner: '李研究', priority: 'high', scope: '全球',
        createdAt: '2025-11-15', keywords: ['硫化物固态', '氧化物固态', '聚合物固态', '能量密度'],
        organizations: ['丰田', '宁德时代', 'QuantumScape', 'SolidPower'], schedule: 'weekly'
      },
      {
        id: '3', name: '硅光芯片',
        description: '数据中心互联、CPO共封装光学技术演进及产业链成熟度。',
        aliases: ['Silicon Photonics', 'CPO'], owner: '王技术', priority: 'medium', scope: '北美、亚太',
        createdAt: '2026-01-20', keywords: ['CPO', '光电共封装', '硅光子', '光模块'],
        organizations: ['Intel', 'Cisco', 'Broadcom', '中际旭创'], schedule: 'weekly'
      }
    ];

    for (const topic of mockTopics) {
      await db.run(
        `INSERT INTO topics (id, name, description, aliases, owner, priority, scope, createdAt, keywords, organizations, schedule)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [topic.id, topic.name, topic.description, JSON.stringify(topic.aliases),
         topic.owner, topic.priority, topic.scope, topic.createdAt,
         JSON.stringify(topic.keywords), JSON.stringify(topic.organizations), topic.schedule]
      );
    }
  }

  return { db, graphSensemaking };
}
