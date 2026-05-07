import { Router } from 'express';
import type { AppContext } from '../context.js';

export function createReviewsRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/reviews
   * 获取待审核项目列表（claims和entities）
   * Query params: status (pending/approved/rejected), type (claim_review/entity_disambig)
   */
  router.get("/api/reviews", async (req, res) => {
    try {
      const { status = 'pending', type } = req.query;

      // 构建查询条件
      let whereClause = "WHERE review_status = ?";
      const params: any[] = [status];

      if (type === 'claim_review') {
        // 只查询claims
        whereClause += " AND confidence < 0.7";
        const claims = await ctx.db.all(
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
          const doc = await ctx.db.get("SELECT topic_id, source_url FROM documents WHERE id = (SELECT document_id FROM claims WHERE id = ?)", [claim.id]);
          return {
            ...claim,
            topic_id: doc?.topic_id || '',
            source_url: doc?.source_url || '',
            topic_name: doc?.topic_id || '未分类',
            reason: ''
          };
        }));

        return res.json(reviews);
      } else if (type === 'entity_disambig') {
        // 只查询entities
        whereClause += " AND confidence < 0.7";
        const entities = await ctx.db.all(
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
          const doc = await ctx.db.get("SELECT topic_id, source_url FROM documents WHERE id = (SELECT document_id FROM entities WHERE id = ?)", [entity.id]);
          return {
            ...entity,
            topic_id: doc?.topic_id || '',
            source_url: doc?.source_url || '',
            topic_name: doc?.topic_id || '未分类',
            reason: ''
          };
        }));

        return res.json(reviews);
      } else {
        // 查询所有
        const claims = await ctx.db.all(
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

        const entities = await ctx.db.all(
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
          const doc = await ctx.db.get(`SELECT topic_id, source_url FROM documents WHERE id = (SELECT document_id FROM ${tableName} WHERE id = ?)`, [item.id]);
          return {
            ...item,
            topic_id: doc?.topic_id || '',
            source_url: doc?.source_url || '',
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
  router.get("/api/reviews/stats", async (_req, res) => {
    try {
      const [
        pendingClaimsResult,
        pendingEntitiesResult,
        approvedClaimsResult,
        approvedEntitiesResult,
        rejectedClaimsResult,
        rejectedEntitiesResult,
      ] = await Promise.all([
        ctx.db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'pending' AND confidence < 0.7"),
        ctx.db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'pending' AND confidence < 0.7"),
        ctx.db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'approved'"),
        ctx.db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'approved'"),
        ctx.db.get("SELECT COUNT(*) as count FROM claims WHERE review_status = 'rejected'"),
        ctx.db.get("SELECT COUNT(*) as count FROM entities WHERE review_status = 'rejected'"),
      ]);

      const pendingClaims = (pendingClaimsResult as any)?.count || 0;
      const pendingEntities = (pendingEntitiesResult as any)?.count || 0;
      const approvedClaims = (approvedClaimsResult as any)?.count || 0;
      const approvedEntities = (approvedEntitiesResult as any)?.count || 0;
      const rejectedClaims = (rejectedClaimsResult as any)?.count || 0;
      const rejectedEntities = (rejectedEntitiesResult as any)?.count || 0;

      res.json({
        total: pendingClaims + pendingEntities,
        entityDisambig: pendingEntities,
        claimReview: pendingClaims,
        conflictResolve: 0,
        approved: approvedClaims + approvedEntities,
        rejected: rejectedClaims + rejectedEntities,
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
  router.post("/api/reviews/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;

      // 尝试更新claims表
      const claimResult = await ctx.db.run(
        "UPDATE claims SET review_status = 'approved' WHERE id = ?",
        [id]
      );

      // 如果claims表没有更新，尝试entities表
      if (claimResult.changes === 0) {
        const entityResult = await ctx.db.run(
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
  router.post("/api/reviews/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;

      // 尝试更新claims表
      const claimResult = await ctx.db.run(
        "UPDATE claims SET review_status = 'rejected' WHERE id = ?",
        [id]
      );

      // 如果claims表没有更新，尝试entities表
      if (claimResult.changes === 0) {
        const entityResult = await ctx.db.run(
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

  return router;
}
