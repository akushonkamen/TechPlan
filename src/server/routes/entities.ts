import { Router } from 'express';
import type { AppContext } from '../context.js';
import { safeJsonParse } from '../helpers.js';

export function createEntitiesRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/topics/:id/entities
   * 获取主题下的所有实体（聚合）
   */
  router.get("/api/topics/:id/entities", async (req, res) => {
    try {
      const { id } = req.params;

      // Get entities with degree centrality (importance)
      const entities = await ctx.db.all(`
        SELECT e.*, d.title as document_title, d.source,
          COALESCE(ec.incoming_count + ec.outgoing_count, 0) as importance
        FROM entities e
        JOIN documents d ON e.document_id = d.id
        LEFT JOIN (
          SELECT
            LOWER(TRIM(source_text)) as entity_name,
            COUNT(*) as outgoing_count
          FROM relations r
          JOIN documents d ON r.document_id = d.id
          WHERE d.topic_id = ?
          GROUP BY LOWER(TRIM(source_text))
        ) outgoing ON LOWER(TRIM(e.text)) = outgoing.entity_name
        LEFT JOIN (
          SELECT
            LOWER(TRIM(target_text)) as entity_name,
            COUNT(*) as incoming_count
          FROM relations r
          JOIN documents d ON r.document_id = d.id
          WHERE d.topic_id = ?
          GROUP BY LOWER(TRIM(target_text))
        ) incoming ON LOWER(TRIM(e.text)) = incoming.entity_name
        WHERE d.topic_id = ?
        ORDER BY importance DESC, e.confidence DESC
      `, [id, id, id]);

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

  // ===== Graph Data =====

  /**
   * GET /api/topics/:id/scoring
   * 战略决策评分 — 10 维度匹配 DecisionSupport.tsx ScoringCard 接口
   */
  router.get("/api/topics/:id/scoring", ctx.requireAdmin, async (req, res) => {
    try {
      const topicId = req.params.id;

      // ── Topic info ──
      const topic = await ctx.db.get("SELECT id, name, keywords, description FROM topics WHERE id = ?", [topicId]);
      if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }

      // ── Raw data queries (parallel) ──
      const [
        docStats, entityStats, relationStats, claimStats, eventStats,
        docTypeBreakdown, recentDocCount, olderDocCount, topicKeywords,
      ] = await Promise.all([
        // docStats: total docs, newest, avg relevance
        ctx.db.get(`SELECT COUNT(*) as total,
                 MAX(created_at) as newest, AVG(relevance_score) as avg_relevance
                 FROM documents WHERE topic_id = ?`, [topicId]),
        // entityStats: total, by type
        ctx.db.all(`SELECT LOWER(e.type) as type, COUNT(*) as count
                FROM entities e JOIN documents d ON e.document_id = d.id
                WHERE d.topic_id = ? GROUP BY LOWER(e.type)`, [topicId]),
        // relationStats: total, by relation type
        ctx.db.all(`SELECT LOWER(r.relation) as rel, COUNT(*) as count
                FROM relations r JOIN documents d ON r.document_id = d.id
                WHERE d.topic_id = ? GROUP BY LOWER(r.relation)`, [topicId]),
        // claimStats: total, negative claims
        ctx.db.get(`SELECT COUNT(*) as total,
                 SUM(CASE WHEN LOWER(polarity) IN ('negative','risk','threat') THEN 1 ELSE 0 END) as risk_count
                 FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = ?`, [topicId]),
        // eventStats: total, milestone/release events
        ctx.db.get(`SELECT COUNT(*) as total,
                 SUM(CASE WHEN LOWER(ev.type) IN ('milestone','release','product_launch','breakthrough') THEN 1 ELSE 0 END) as mature_events
                 FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ?`, [topicId]),
        // docTypeBreakdown: academic vs industry sources
        ctx.db.get(`SELECT
                 SUM(CASE WHEN LOWER(source) LIKE '%arxiv%' OR LOWER(source) LIKE '%semantic scholar%'
                           OR LOWER(source) LIKE '%pubmed%' OR LOWER(source) LIKE '%acm%' THEN 1 ELSE 0 END) as academic,
                 SUM(CASE WHEN LOWER(source) LIKE '%github%' OR LOWER(source) LIKE '%techcrunch%'
                           OR LOWER(source) LIKE '%venturebeat%' OR LOWER(source) LIKE '%wired%' THEN 1 ELSE 0 END) as industry,
                 COUNT(*) as total
                 FROM documents WHERE topic_id = ?`, [topicId]),
        // recentDocCount: docs in last 7 days
        ctx.db.get(`SELECT COUNT(*) as count FROM documents
                WHERE topic_id = ? AND created_at >= datetime('now', '-7 days')`, [topicId]),
        // olderDocCount: docs in 7-14 days ago (for growth rate)
        ctx.db.get(`SELECT COUNT(*) as count FROM documents
                WHERE topic_id = ? AND created_at >= datetime('now', '-14 days')
                AND created_at < datetime('now', '-7 days')`, [topicId]),
        // topicKeywords for capability matching
        ctx.db.get(`SELECT keywords, description FROM topics WHERE id = ?`, [topicId]),
      ]);

      const totalDocs = docStats?.total || 0;
      const totalEntities = entityStats?.reduce((s: number, r: any) => s + r.count, 0) || 0;
      const totalRelations = relationStats?.reduce((s: number, r: any) => s + r.count, 0) || 0;
      const totalClaims = claimStats?.total || 0;
      const totalEvents = eventStats?.total || 0;

      // Helper maps
      const entityByType: Record<string, number> = {};
      for (const row of (entityStats || [])) entityByType[(row as any).type] = (row as any).count;
      const relByType: Record<string, number> = {};
      for (const row of (relationStats || [])) relByType[(row as any).rel] = (row as any).count;

      const productCount = entityByType['product'] || 0;
      const orgCount = entityByType['organization'] || 0;
      const techCount = entityByType['technology'] || 0;
      const matureEvents = eventStats?.mature_events || 0;
      const academicDocs = docTypeBreakdown?.academic || 0;
      const industryDocs = docTypeBreakdown?.industry || 0;
      const riskClaims = claimStats?.risk_count || 0;
      const recentDocs = recentDocCount?.count || 0;
      const olderDocs = olderDocCount?.count || 0;

      // ── 10 Dimensions ──

      // 1. maturity: Product entities + milestone events → higher = more mature
      const productRatio = totalEntities > 0 ? productCount / totalEntities : 0;
      const matureEventRatio = totalEvents > 0 ? matureEvents / totalEvents : 0;
      const maturity = Math.min(100, Math.round((productRatio * 60 + matureEventRatio * 40) * 100));

      // 2. academicInterest: academic docs ratio + 7d growth
      const academicRatio = totalDocs > 0 ? academicDocs / totalDocs : 0;
      const docGrowthRate = olderDocs > 0 ? Math.min(3, recentDocs / olderDocs) : (recentDocs > 0 ? 1.5 : 0);
      const academicInterest = Math.min(100, Math.round((academicRatio * 50 + (docGrowthRate / 3) * 50) * 100));

      // 3. industryAdoption: Organization entities + DEVELOPS relations
      const orgRatio = totalEntities > 0 ? orgCount / totalEntities : 0;
      const developsCount = relByType['develops'] || 0;
      const developsRatio = totalRelations > 0 ? developsCount / totalRelations : 0;
      const industryAdoption = Math.min(100, Math.round((orgRatio * 40 + developsRatio * 40 + (industryDocs > 0 ? 0.2 : 0)) * 100));

      // 4. competition: COMPETES_WITH density + competitor org count
      const competesCount = relByType['competes_with'] || 0;
      const competesRatio = totalRelations > 0 ? competesCount / totalRelations : 0;
      const competition = Math.min(100, Math.round((competesRatio * 60 + Math.min(1, competesCount / 5) * 40) * 100));

      // 5. ecosystemDependency: SUPPORTS + USES / total relations
      const depCount = (relByType['supports'] || 0) + (relByType['uses'] || 0);
      const ecosystemDependency = totalRelations > 0
        ? Math.min(100, Math.round((depCount / totalRelations) * 100))
        : 0;

      // 6. capabilityMatch: keyword overlap with entity text
      const kwText = ((topicKeywords?.keywords || '') + ' ' + (topicKeywords?.description || '')).toLowerCase();
      const kwSet = new Set(kwText.split(/[,，\s]+/).filter((w: string) => w.length > 1));
      let matchCount = 0;
      for (const row of (entityStats || [])) {
        const words = (row as any).type.split(/[\s_-]+/);
        for (const w of words) { if (kwSet.has(w.toLowerCase())) { matchCount += (row as any).count; break; } }
      }
      const capabilityMatch = totalEntities > 0
        ? Math.min(100, Math.round((matchCount / totalEntities) * 80 + (kwSet.size > 0 ? 20 : 0)))
        : Math.min(100, kwSet.size * 5);

      // 7. standardizationWindow: inverse of maturity (early tech = wider window)
      const standardizationWindow = Math.max(0, Math.round(100 - maturity * 0.8));

      // 8. policyRisk: risk claims ratio
      const policyRisk = totalClaims > 0
        ? Math.min(100, Math.round((riskClaims / totalClaims) * 100))
        : 0;

      // 9. roiPotential: industryAdoption(+) + competition(-) + maturity(bell curve)
      const maturityBell = maturity > 0 ? Math.max(0, 1 - Math.abs(maturity - 60) / 60) : 0.2;
      const roiPotential = Math.min(100, Math.max(0, Math.round(
        (industryAdoption / 100) * 40 + (1 - competition / 100) * 30 + maturityBell * 30
      ) * 100 / 100));

      // 10. timing: freshness + velocity + window
      let freshness = 0;
      if (docStats?.newest) {
        const daysSince = (Date.now() - new Date(docStats.newest).getTime()) / (1000 * 60 * 60 * 24);
        freshness = Math.max(0, Math.round(100 - daysSince * 3));
      }
      const velocity = Math.min(100, recentDocs * 10);
      const timing = Math.min(100, Math.round(freshness * 0.4 + velocity * 0.3 + standardizationWindow * 0.3));

      const scores = {
        maturity, academicInterest, industryAdoption, competition,
        ecosystemDependency, capabilityMatch, standardizationWindow,
        policyRisk, roiPotential, timing,
      };

      // ── Overall score ──
      const overallScore = Math.round(
        maturity * 0.10 + academicInterest * 0.10 + industryAdoption * 0.12 +
        competition * 0.08 + ecosystemDependency * 0.06 + capabilityMatch * 0.08 +
        standardizationWindow * 0.06 + policyRisk * 0.08 + roiPotential * 0.16 + timing * 0.16
      );

      // ── Recommendation ──
      let recommendation: string;
      if (policyRisk >= 60 && roiPotential < 40) recommendation = 'risk_avoidance';
      else if (overallScore >= 70 && maturity >= 50 && competition < 50) recommendation = 'heavy_investment';
      else if (competition >= 50 && industryAdoption >= 40) recommendation = 'joint_development';
      else if (overallScore >= 40 && maturity >= 30) recommendation = 'small_pilot';
      else recommendation = 'continuous_tracking';

      // ── Direction & rationale ──
      const directionParts: string[] = [];
      if (maturity >= 60) directionParts.push('技术已进入成熟期');
      else if (maturity >= 30) directionParts.push('技术处于成长期');
      else directionParts.push('技术尚在早期阶段');
      if (competition >= 50) directionParts.push('竞争激烈');
      if (policyRisk >= 40) directionParts.push('存在政策风险');
      if (roiPotential >= 60) directionParts.push('投入产出比良好');
      const direction = directionParts.join('，');

      const evidence: string[] = [];
      evidence.push(`累计 ${totalDocs} 篇文档、${totalEntities} 个实体、${totalRelations} 条关系`);
      if (academicDocs > 0) evidence.push(`学术来源 ${academicDocs} 篇，近7天新增 ${recentDocs} 篇`);
      if (orgCount > 0) evidence.push(`涉及 ${orgCount} 个组织实体`);
      if (competesCount > 0) evidence.push(`${competesCount} 条竞品关系`);
      if (totalClaims > 0) evidence.push(`${totalClaims} 条主张，其中 ${riskClaims} 条风险信号`);

      // ── Confidence ──
      const avgRelevance = docStats?.avg_relevance ?? 0;
      const confidence = Math.min(1, Math.max(0.1,
        (totalDocs >= 10 ? 0.3 : totalDocs >= 3 ? 0.2 : 0.1) +
        (totalEntities >= 10 ? 0.2 : totalEntities >= 3 ? 0.1 : 0) +
        (totalRelations >= 5 ? 0.2 : totalRelations >= 2 ? 0.1 : 0) +
        (avgRelevance > 0.5 ? 0.15 : avgRelevance > 0.3 ? 0.1 : 0) +
        (freshness >= 50 ? 0.15 : 0)
      ));

      res.json({
        topicId,
        topicName: topic.name,
        direction,
        scores,
        overallScore,
        recommendation,
        rationale: direction,
        evidence,
        confidence: Math.round(confidence * 100) / 100,
      });
    } catch (error) {
      console.error("Scoring error:", error);
      res.status(500).json({ error: "Failed to compute scoring" });
    }
  });

  return router;
}
