import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { AppContext } from '../context.js';
import { safeJsonParse, calculateTimeDecay, calculateFreshnessHours, computeDedupHash, findDuplicateByHash, updateOnRecollect } from '../helpers.js';

export function createDocumentsRouter(ctx: AppContext): Router {
  const router = Router();

  // ===== Documents API =====

  router.get("/api/documents", async (req, res) => {
    try {
      const { topic_id } = req.query;
      let query = "SELECT * FROM documents";
      const params: string[] = [];

      if (topic_id) {
        query += " WHERE topic_id = ?";
        params.push(topic_id as string);
      }

      query += " ORDER BY collected_date DESC";

      const rows = await ctx.db.all(query, params);
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

  router.get("/api/topics/:id/documents", async (req, res) => {
    try {
      const rows = await ctx.db.all(
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
  router.get("/api/documents/by-period", async (req, res) => {
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
      const metadataSelect = include_metadata === 'true' ? ', metadata' : '';

      // Build query with strict time filtering
      const query = `
        SELECT id, title, source, source_url, ${dateColumn} as date,
               published_date, collected_date, substr(content, 1, 500) as excerpt,
               urgency, relevance_score, freshness_hours${metadataSelect}
        FROM documents
        WHERE topic_id = ?
          AND ${dateColumn} IS NOT NULL
          AND ${dateColumn} >= ?
          AND ${dateColumn} <= ?
        ORDER BY ${dateColumn} DESC
        LIMIT 200
      `;

      const rows = await ctx.db.all(query, [topic_id, startDate, endDate]);

      // Get counts for verification
      const countQuery = `
        SELECT COUNT(*) as total
        FROM documents
        WHERE topic_id = ?
          AND ${dateColumn} IS NOT NULL
          AND ${dateColumn} >= ?
          AND ${dateColumn} <= ?
      `;
      const countResult = await ctx.db.get(countQuery, [topic_id, startDate, endDate]);

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

  router.get("/api/documents/:id", async (req, res) => {
    try {
      const row = await ctx.db.get("SELECT * FROM documents WHERE id = ?", [req.params.id]);
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

  router.post("/api/documents", async (req, res) => {
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
      const existing = await findDuplicateByHash(ctx.db, dedupHash);
      if (existing) {
        // Update existing document instead of creating duplicate
        await updateOnRecollect(ctx.db, existing.id);
        const updated = await ctx.db.get("SELECT * FROM documents WHERE id = ?", [existing.id]);
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

      await ctx.db.run(
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

      const created = await ctx.db.get("SELECT * FROM documents WHERE id = ?", [id]);
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

  router.delete("/api/documents/:id", async (req, res) => {
    try {
      const result = await ctx.db.run("DELETE FROM documents WHERE id = ?", [req.params.id]);
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
  router.post("/api/upload", ctx.upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "没有上传文件" });
      }

      // 动态导入文件处理服务
      const { processUploadedFile } = await import('../../services/fileUploadService.js');

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
      const existing = await findDuplicateByHash(ctx.db, dedupHash);
      if (existing) {
        // Update existing document
        await updateOnRecollect(ctx.db, existing.id);
        return res.json({
          id: existing.id,
          title: result.file.title,
          source: source,
          _action: 'updated',
          _message: 'File already exists, updated collection metadata'
        });
      }

      await ctx.db.run(
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

  return router;
}
