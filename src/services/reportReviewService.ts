import type { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import type { ReportReview, ReportTemplate } from './reportService.js';

interface ChecklistItem {
  id: string;
  category: 'data_integrity' | 'format_compliance' | 'value_range' | 'logic_consistency' | 'evidence_sufficiency';
  description: string;
  check: (content: any, data: any) => boolean;
}

interface ValidationResult {
  passed: boolean;
  checklistResults: Record<string, boolean>;
  issues: Array<{
    section: string;
    field: string;
    severity: 'error' | 'warning' | 'info';
    description: string;
  }>;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'data_integrity.documents',
    category: 'data_integrity',
    description: '文档数量 >= 5',
    check: (_, data) => (data.documentCount || 0) >= 5,
  },
  {
    id: 'data_integrity.entities',
    category: 'data_integrity',
    description: '实体数量 >= 10',
    check: (_, data) => (data.entityCount || 0) >= 10,
  },
  {
    id: 'data_integrity.timeline',
    category: 'data_integrity',
    description: '时间线事件 >= 3',
    check: (content) => (content.timeline?.length || 0) >= 3,
  },
  {
    id: 'data_integrity.sections',
    category: 'data_integrity',
    description: '所有章节已生成',
    check: (content) => {
      const requiredSections = ['exec_overview', 'tech_radar', 'competitive_moves'];
      const sections = content.sections || [];
      return requiredSections.every(req => sections.some((s: any) => s.id === req));
    },
  },
  {
    id: 'format_compliance.json',
    category: 'format_compliance',
    description: 'JSON 格式正确',
    check: () => true,
  },
  {
    id: 'format_compliance.required_fields',
    category: 'format_compliance',
    description: '所有必填字段存在',
    check: (content) => {
      return !!(content.executiveSummary && content.sections);
    },
  },
  {
    id: 'format_compliance.date_format',
    category: 'format_compliance',
    description: '日期格式统一 (YYYY-MM-DD)',
    check: (content) => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const period = content.executiveSummary?.period;
      if (period?.start && !dateRegex.test(period.start)) return false;
      if (period?.end && !dateRegex.test(period.end)) return false;
      return true;
    },
  },
  {
    id: 'value_range.confidence',
    category: 'value_range',
    description: 'confidence 值在 0-1 范围',
    check: (content) => {
      const sections = content.sections || [];
      for (const section of sections) {
        for (const signal of section.signals || []) {
          if (signal.confidence < 0 || signal.confidence > 1) return false;
        }
      }
      return true;
    },
  },
  {
    id: 'logic_consistency.summary_match',
    category: 'logic_consistency',
    description: '执行摘要与正文一致',
    check: (content) => {
      const keyPoints = content.executiveSummary?.keyPoints || [];
      return keyPoints.length >= 3;
    },
  },
  {
    id: 'evidence_sufficiency.key_claims',
    category: 'evidence_sufficiency',
    description: '关键论断有数据支撑',
    check: (content) => {
      const sections = content.sections || [];
      for (const section of sections) {
        if (section.entityRefs && section.entityRefs.length > 0) continue;
        if (section.highlights && section.highlights.length > 0) continue;
        return false;
      }
      return true;
    },
  },
];

export class ReportReviewService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async autoValidate(
    reportId: string,
    content: any,
    data: { documentCount: number; entityCount: number }
  ): Promise<ValidationResult> {
    const checklistResults: Record<string, boolean> = {};
    const issues: ValidationResult['issues'] = [];

    for (const item of DEFAULT_CHECKLIST) {
      try {
        const passed = item.check(content, data);
        checklistResults[item.id] = passed;

        if (!passed) {
          issues.push({
            section: item.category,
            field: item.id,
            severity: item.category === 'data_integrity' ? 'error' : 'warning',
            description: item.description + ' - 未通过',
          });
        }
      } catch (error) {
        checklistResults[item.id] = false;
        issues.push({
          section: item.category,
          field: item.id,
          severity: 'error',
          description: `检查失败: ${item.description}`,
        });
      }
    }

    const passed = issues.filter(i => i.severity === 'error').length === 0;

    return { passed, checklistResults, issues };
  }

  async createAutoReview(reportId: string, content: any, data: {
    documentCount: number;
    entityCount: number;
  }): Promise<ReportReview> {
    const validation = await this.autoValidate(reportId, content, data);

    const review: ReportReview = {
      id: uuidv4(),
      report_id: reportId,
      review_type: 'auto',
      status: validation.passed ? 'pass' : 'fail',
      checklist_results: validation.checklistResults,
      issues: validation.issues,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await this.db.run(
      `INSERT INTO report_reviews (id, report_id, review_type, status, checklist_results, issues, reviewed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        review.id,
        review.report_id,
        review.review_type,
        review.status,
        JSON.stringify(review.checklist_results),
        JSON.stringify(review.issues),
        review.reviewed_at,
        review.created_at,
      ]
    );

    await this.db.run(
      `UPDATE reports SET review_status = ? WHERE id = ?`,
      [review.status, reportId]
    );

    return review;
  }

  async submitReview(
    reportId: string,
    reviewerId: string,
    reviewType: 'content' | 'expert',
    checklistResults: Record<string, boolean>,
    issues: ReportReview['issues'],
    comments: string,
    action: 'approve' | 'reject' | 'request_changes'
  ): Promise<ReportReview> {
    const status = action === 'approve' ? 'pass' : 'fail';

    const review: ReportReview = {
      id: uuidv4(),
      report_id: reportId,
      reviewer_id: reviewerId,
      review_type: reviewType,
      status,
      checklist_results: checklistResults,
      issues,
      comments,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await this.db.run(
      `INSERT INTO report_reviews (id, report_id, reviewer_id, review_type, status, checklist_results, issues, comments, reviewed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        review.id,
        review.report_id,
        review.reviewer_id,
        review.review_type,
        review.status,
        JSON.stringify(review.checklist_results),
        JSON.stringify(review.issues),
        review.comments,
        review.reviewed_at,
        review.created_at,
      ]
    );

    if (action === 'approve') {
      await this.db.run(
        `UPDATE reports SET review_status = 'approved', status = 'published', published_at = ?, published_by = ? WHERE id = ?`,
        [new Date().toISOString(), reviewerId, reportId]
      );
    } else if (action === 'reject') {
      await this.db.run(
        `UPDATE reports SET review_status = 'rejected', status = 'draft' WHERE id = ?`,
        [reportId]
      );
    }

    return review;
  }

  async getReviews(reportId: string): Promise<ReportReview[]> {
    const rows = await this.db.all(
      "SELECT * FROM report_reviews WHERE report_id = ? ORDER BY created_at DESC",
      [reportId]
    );

    return rows.map((row: any) => ({
      ...row,
      checklist_results: JSON.parse(row.checklist_results || '{}'),
      issues: JSON.parse(row.issues || '[]'),
    }));
  }

  async getLatestReview(reportId: string): Promise<ReportReview | null> {
    const row = await this.db.get(
      "SELECT * FROM report_reviews WHERE report_id = ? ORDER BY created_at DESC LIMIT 1",
      [reportId]
    );

    if (!row) return null;

    return {
      ...row,
      checklist_results: JSON.parse(row.checklist_results || '{}'),
      issues: JSON.parse(row.issues || '[]'),
    };
  }

  async getTemplate(templateId: string): Promise<ReportTemplate | null> {
    const row = await this.db.get(
      "SELECT * FROM report_templates WHERE id = ?",
      [templateId]
    );

    if (!row) return null;

    return {
      ...row,
      structure: JSON.parse(row.structure || '{}'),
      validation_rules: JSON.parse(row.validation_rules || '{}'),
      is_active: !!row.is_active,
    };
  }

  async getActiveTemplate(type: string): Promise<ReportTemplate | null> {
    const row = await this.db.get(
      "SELECT * FROM report_templates WHERE type = ? AND is_active = 1 LIMIT 1",
      [type]
    );

    if (!row) return null;

    return {
      ...row,
      structure: JSON.parse(row.structure || '{}'),
      validation_rules: JSON.parse(row.validation_rules || '{}'),
      is_active: !!row.is_active,
    };
  }

  async getChecklist(): Promise<ChecklistItem[]> {
    return DEFAULT_CHECKLIST;
  }
}
