import type { Database } from 'sqlite';

export async function migrateReportTables(db: Database): Promise<void> {
  await db.exec(`
    -- 报告模板表
    CREATE TABLE IF NOT EXISTS report_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      version TEXT NOT NULL,
      structure TEXT NOT NULL,
      validation_rules TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 报告审核记录表
    CREATE TABLE IF NOT EXISTS report_reviews (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      reviewer_id TEXT,
      review_type TEXT NOT NULL,
      status TEXT NOT NULL,
      checklist_results TEXT,
      issues TEXT,
      comments TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    -- 报告反馈表
    CREATE TABLE IF NOT EXISTS report_feedback (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      user_id TEXT,
      feedback_type TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      processed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    -- 报告图谱关联表
    CREATE TABLE IF NOT EXISTS report_graph_links (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      graph_node_id TEXT,
      graph_relationship_id TEXT,
      link_type TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    -- 报告版本历史表
    CREATE TABLE IF NOT EXISTS report_versions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      changed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      UNIQUE(report_id, version)
    );

    -- 报告类型配置表
    CREATE TABLE IF NOT EXISTS report_type_configs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      template_id TEXT,
      schedule TEXT,
      trigger_rules TEXT,
      review_config TEXT,
      distribution_config TEXT,
      retention_days INTEGER DEFAULT 365,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 触发规则表
    CREATE TABLE IF NOT EXISTS trigger_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      conditions TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_params TEXT,
      cooldown_minutes INTEGER DEFAULT 60,
      enabled INTEGER DEFAULT 1,
      last_triggered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 触发事件日志表
    CREATE TABLE IF NOT EXISTS trigger_events (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      source_data TEXT,
      action_taken TEXT,
      report_id TEXT,
      status TEXT DEFAULT 'triggered',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rule_id) REFERENCES trigger_rules(id)
    );

    -- 报告分发记录表
    CREATE TABLE IF NOT EXISTS report_distributions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    );

    -- 报告归档表
    CREATE TABLE IF NOT EXISTS report_archives (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      archive_format TEXT NOT NULL,
      archive_size INTEGER,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_report_reviews_report ON report_reviews(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_reviews_status ON report_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_report_feedback_report ON report_feedback(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_feedback_status ON report_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_report_graph_links_report ON report_graph_links(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_graph_links_section ON report_graph_links(section_id);
    CREATE INDEX IF NOT EXISTS idx_report_versions_report ON report_versions(report_id);
    CREATE INDEX IF NOT EXISTS idx_trigger_rules_enabled ON trigger_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_trigger_events_rule ON trigger_events(rule_id);
    CREATE INDEX IF NOT EXISTS idx_trigger_events_created ON trigger_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_report_distributions_report ON report_distributions(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_archives_report ON report_archives(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_archives_expires ON report_archives(expires_at);
  `);

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'draft';
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding status column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN version TEXT DEFAULT '1.0.0';
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding version column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN template_id TEXT;
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding template_id column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN review_status TEXT DEFAULT 'pending';
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding review_status column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN published_at TEXT;
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding published_at column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN published_by TEXT;
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding published_by column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN period_start TEXT;
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding period_start column:', err.message);
    }
  }

  try {
    await db.exec(`
      ALTER TABLE reports ADD COLUMN period_end TEXT;
    `);
  } catch (err: any) {
    if (!err.message.includes('duplicate column')) {
      console.warn('[Migration] Warning adding period_end column:', err.message);
    }
  }

  // ── 扩展 reports 表列 ──
  const reportsNewCols = [
    { col: 'priority', def: "TEXT DEFAULT 'normal'" },
    { col: 'confidentiality', def: "TEXT DEFAULT 'internal'" },
    { col: 'trigger_rule_id', def: 'TEXT' },
  ];
  for (const { col, def } of reportsNewCols) {
    try {
      await db.exec(`ALTER TABLE reports ADD COLUMN ${col} ${def}`);
    } catch (err: any) {
      if (!err.message.includes('duplicate column')) {
        console.warn(`[Migration] Warning adding reports.${col}:`, err.message);
      }
    }
  }

  // ── 扩展 topics 表列 ──
  const topicsNewCols = [
    { col: 'daily_report_enabled', def: 'INTEGER DEFAULT 0' },
    { col: 'monthly_report_enabled', def: 'INTEGER DEFAULT 0' },
    { col: 'quarterly_report_enabled', def: 'INTEGER DEFAULT 0' },
    { col: 'alert_threshold', def: 'TEXT' },
  ];
  for (const { col, def } of topicsNewCols) {
    try {
      await db.exec(`ALTER TABLE topics ADD COLUMN ${col} ${def}`);
    } catch (err: any) {
      if (!err.message.includes('duplicate column')) {
        console.warn(`[Migration] Warning adding topics.${col}:`, err.message);
      }
    }
  }

  // ── 播种报告类型配置 ──
  const defaultReportTypes = [
    {
      id: 'rtc_daily',
      type: 'daily',
      name: '日报',
      description: '快速感知每日变化，浅层扫描新增文档、事件和实体',
      schedule: 'daily',
      review_config: JSON.stringify({ autoReview: true, humanReview: false }),
      distribution_config: JSON.stringify({ channels: ['system_notification'] }),
      retention_days: 90,
    },
    {
      id: 'rtc_weekly',
      type: 'weekly',
      name: '周报',
      description: '深度分析一周动态，中层挖掘技术、竞争、投资信号',
      schedule: 'weekly',
      review_config: JSON.stringify({ autoReview: true, humanReview: 'optional' }),
      distribution_config: JSON.stringify({ channels: ['system_notification', 'export'] }),
      retention_days: 730,
    },
    {
      id: 'rtc_monthly',
      type: 'monthly',
      name: '月报',
      description: '趋势研判与目标达成分析，战略层决策支持',
      schedule: 'monthly',
      review_config: JSON.stringify({ autoReview: true, humanReview: true }),
      distribution_config: JSON.stringify({ channels: ['system_notification', 'export'] }),
      retention_days: 1825,
    },
    {
      id: 'rtc_quarterly',
      type: 'quarterly',
      name: '季报',
      description: '战略评估与全景分析，高管层战略决策',
      schedule: 'quarterly',
      review_config: JSON.stringify({ autoReview: true, expertReview: true }),
      distribution_config: JSON.stringify({ channels: ['system_notification', 'export'] }),
      retention_days: 3650,
    },
    {
      id: 'rtc_tech_topic',
      type: 'tech_topic',
      name: '技术专题报告',
      description: '针对特定技术的深度分析，包括成熟度评估、竞争格局和应用前景',
      schedule: null,
      review_config: JSON.stringify({ autoReview: true, humanReview: true }),
      distribution_config: JSON.stringify({ channels: ['system_notification'] }),
      retention_days: 1095,
    },
    {
      id: 'rtc_competitor',
      type: 'competitor',
      name: '友商分析报告',
      description: '竞争者深度画像，包括SWOT分析、技术能力评估和威胁评估',
      schedule: null,
      review_config: JSON.stringify({ autoReview: true, humanReview: true }),
      distribution_config: JSON.stringify({ channels: ['system_notification'] }),
      retention_days: 1095,
    },
    {
      id: 'rtc_alert',
      type: 'alert',
      name: '预警报告',
      description: '风险预警和快速响应报告，即时触发',
      schedule: null,
      review_config: JSON.stringify({ autoReview: true, humanReview: false }),
      distribution_config: JSON.stringify({ channels: ['system_notification'], priority: 'high' }),
      retention_days: 365,
    },
  ];

  for (const rt of defaultReportTypes) {
    const existing = await db.get("SELECT id FROM report_type_configs WHERE id = ?", [rt.id]);
    if (!existing) {
      await db.run(
        `INSERT INTO report_type_configs (id, type, name, description, schedule, review_config, distribution_config, retention_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [rt.id, rt.type, rt.name, rt.description, rt.schedule, rt.review_config, rt.distribution_config, rt.retention_days]
      );
    }
  }
  console.log('[Migration] Seeded report_type_configs');

  const defaultTemplate = {
    id: 'tpl_weekly_v2',
    name: '周报模板 v2.0',
    type: 'weekly',
    version: '2.0.0',
    structure: JSON.stringify({
      sections: [
        { id: 'exec_overview', title: '执行摘要', required: true },
        { id: 'tech_radar', title: '技术雷达', required: true },
        { id: 'competitive_moves', title: '竞争态势', required: true },
        { id: 'investment_deals', title: '投资与合作', required: true },
        { id: 'risk_opportunity', title: '风险与机遇', required: true },
        { id: 'outlook', title: '下周展望', required: true },
      ],
    }),
    validation_rules: JSON.stringify({
      minDocuments: 5,
      minEntities: 10,
      minTimelineEvents: 3,
      requiredSections: ['exec_overview', 'tech_radar', 'competitive_moves'],
    }),
    is_active: 1,
  };

  const existing = await db.get(
    "SELECT id FROM report_templates WHERE id = ?",
    [defaultTemplate.id]
  );

  if (!existing) {
    await db.run(
      `INSERT INTO report_templates (id, name, type, version, structure, validation_rules, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        defaultTemplate.id,
        defaultTemplate.name,
        defaultTemplate.type,
        defaultTemplate.version,
        defaultTemplate.structure,
        defaultTemplate.validation_rules,
        defaultTemplate.is_active,
      ]
    );
    console.log('[Migration] Inserted default weekly template');
  }

  console.log('[Migration] Report tables migration completed');
}

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'tech_topic' | 'competitor' | 'trend' | 'alert' | 'flash';

export interface ReportTypeConfig {
  id: string;
  type: ReportType;
  name: string;
  description?: string;
  template_id?: string;
  schedule?: string | null;
  trigger_rules?: string;
  review_config?: string;
  distribution_config?: string;
  retention_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: ReportType;
  version: string;
  structure: {
    sections: Array<{
      id: string;
      title: string;
      required: boolean;
    }>;
  };
  validation_rules: {
    minDocuments: number;
    minEntities: number;
    minTimelineEvents: number;
    requiredSections: string[];
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportReview {
  id: string;
  report_id: string;
  reviewer_id?: string;
  review_type: 'auto' | 'content' | 'expert';
  status: 'pending' | 'pass' | 'fail';
  checklist_results: Record<string, boolean>;
  issues: Array<{
    section: string;
    field: string;
    severity: 'error' | 'warning' | 'info';
    description: string;
  }>;
  comments?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface ReportFeedback {
  id: string;
  report_id: string;
  user_id?: string;
  feedback_type: 'rating' | 'comment' | 'correction' | 'suggestion';
  content: {
    rating?: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    correction?: {
      section: string;
      original: string;
      suggested: string;
      reason: string;
    };
    suggestion?: string;
  };
  status: 'new' | 'processed' | 'ignored';
  processed_at?: string;
  created_at: string;
}

export interface ReportGraphLink {
  id: string;
  report_id: string;
  section_id: string;
  graph_node_id?: string;
  graph_relationship_id?: string;
  link_type: 'entity_ref' | 'evidence' | 'impact' | 'path';
  metadata?: Record<string, any>;
  created_at: string;
}
