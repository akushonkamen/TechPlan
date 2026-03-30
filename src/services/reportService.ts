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

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_report_reviews_report ON report_reviews(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_reviews_status ON report_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_report_feedback_report ON report_feedback(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_feedback_status ON report_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_report_graph_links_report ON report_graph_links(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_graph_links_section ON report_graph_links(section_id);
    CREATE INDEX IF NOT EXISTS idx_report_versions_report ON report_versions(report_id);
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

export interface ReportTemplate {
  id: string;
  name: string;
  type: 'weekly' | 'special' | 'alert' | 'executive';
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
