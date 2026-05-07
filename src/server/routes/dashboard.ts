import { Router } from 'express';
import type { AppContext } from '../context.js';
import { safeJsonParse, calculateTimeDecay, calculateFreshnessHours } from '../helpers.js';
import { predictLinks, detectAnomalies, computePageRank } from '../../lib/graphAnalysis.js';

export function createDashboardRouter(ctx: AppContext): Router {
  const router = Router();

  // ===== Dashboard API =====

  /**
   * GET /api/dashboard/stats
   * 获取仪表盘统计数据
   */
  router.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const activeTopicsCount = await ctx.db.get("SELECT COUNT(*) as count FROM topics");
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekDocsCount = await ctx.db.get(
        "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ?",
        [weekAgo]
      );
      const pendingReviewsCount = await ctx.db.get(
        "SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'"
      );
      const highPriorityTopics = await ctx.db.get(
        "SELECT COUNT(*) as count FROM topics WHERE priority = 'high'"
      );

      const lastWeekDocs = await ctx.db.get(
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
  router.get("/api/dashboard/trend", async (_req, res) => {
    try {
      const trendData = [];
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStart = new Date(date.setHours(0, 0, 0, 0)).toISOString();
        const dateEnd = new Date(date.setHours(23, 59, 59, 999)).toISOString();

        const papersCount = await ctx.db.get(
          "SELECT COUNT(*) as count FROM documents WHERE collected_date >= ? AND collected_date <= ? AND source LIKE ?",
          [dateStart, dateEnd, '%arXiv%']
        );

        const newsCount = await ctx.db.get(
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
  router.get("/api/dashboard/topic-distribution", async (_req, res) => {
    try {
      const distribution = await ctx.db.all(`
        SELECT t.id as topicId, t.name, COUNT(d.id) as value
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
  router.get("/api/dashboard/alerts", async (_req, res) => {
    try {
      // 获取所有高优先级主题的文档，按 published_date 排序
      const alerts = await ctx.db.all(`
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

  /**
   * GET /api/dashboard/insights
   * Aggregate graph insights across all topics: predicted links, anomalies, central entities
   */
  router.get("/api/dashboard/insights", async (_req, res) => {
    try {
      // Check cache
      const CACHE_TTL = 60 * 60 * 1000; // 1 hour
      const cached = await ctx.db.get(
        "SELECT data, updated_at FROM dashboard_insights_cache WHERE id = 'default'"
      );
      if (cached && cached.updated_at && (Date.now() - new Date(cached.updated_at).getTime()) < CACHE_TTL) {
        res.json(JSON.parse(cached.data));
        return;
      }

      const topics = await ctx.db.all("SELECT id, name FROM topics");
      const allPredictions: any[] = [];
      const allAnomalies: any[] = [];
      const allCentral: any[] = [];

      for (const topic of topics) {
        try {
          const graph = await getTopicGraphPayload(topic.id);
          if (graph.nodes.length < 3) continue;

          const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id, properties: n.properties }));
          const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence, type: e.label }));

          // Predicted links
          const predictions = predictLinks(nodes, edges, 5);
          for (const p of predictions) {
            allPredictions.push({ ...p, topicId: topic.id, topicName: topic.name });
          }

          // Anomalies
          const anomalies = detectAnomalies(nodes, edges);
          for (const a of anomalies) {
            allAnomalies.push({ ...a, topicId: topic.id, topicName: topic.name });
          }

          // Central entities (PageRank top 5)
          const centrality = computePageRank(nodes, edges, 5);
          for (const c of centrality) {
            allCentral.push({ ...c, topicId: topic.id, topicName: topic.name });
          }
        } catch { /* skip topics with no graph data */ }
      }

      // Sort and limit
      allPredictions.sort((a, b) => (b.adamicAdar || 0) - (a.adamicAdar || 0));
      allAnomalies.sort((a, b) => (b.score || 0) - (a.score || 0));
      allCentral.sort((a, b) => (b.pagerank || 0) - (a.pagerank || 0));

      const result = {
        predictedLinks: allPredictions.slice(0, 5),
        anomalies: allAnomalies.slice(0, 3),
        centralEntities: allCentral.slice(0, 5),
      };

      // Update cache (create table if needed)
      await ctx.db.run(`CREATE TABLE IF NOT EXISTS dashboard_insights_cache (
        id TEXT PRIMARY KEY, data TEXT, updated_at TEXT
      )`);
      await ctx.db.run(
        "INSERT OR REPLACE INTO dashboard_insights_cache (id, data, updated_at) VALUES ('default', ?, ?)",
        [JSON.stringify(result), new Date().toISOString()]
      );

      res.json(result);
    } catch (error) {
      console.error("Failed to fetch dashboard insights:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  /**
   * GET /api/dashboard/trend-comparison
   * Period-over-period comparison from report_time_periods
   */
  router.get("/api/dashboard/trend-comparison", async (_req, res) => {
    try {
      const rows = await ctx.db.all(
        `SELECT topic_id, preset_type, documents_count, sources_count, period_start, period_end
         FROM report_time_periods ORDER BY period_start DESC`
      );

      // Group by topic
      const byTopic: Record<string, any[]> = {};
      for (const row of rows) {
        if (!byTopic[row.topic_id]) byTopic[row.topic_id] = [];
        byTopic[row.topic_id].push(row);
      }

      const topics = await ctx.db.all("SELECT id, name FROM topics");
      const topicMap = new Map(topics.map((t: any) => [t.id, t.name]));

      const signals: any[] = [];
      for (const [topicId, periods] of Object.entries(byTopic)) {
        if (periods.length < 2) continue;
        const latest = periods[0];
        const previous = periods[1];
        const docChange = previous.documents_count > 0
          ? Math.round(((latest.documents_count - previous.documents_count) / previous.documents_count) * 100)
          : 0;
        signals.push({
          topicId,
          topicName: topicMap.get(topicId) || topicId,
          latestDocs: latest.documents_count,
          previousDocs: previous.documents_count,
          docChange,
          sourcesChange: previous.sources_count > 0
            ? Math.round(((latest.sources_count - previous.sources_count) / previous.sources_count) * 100)
            : 0,
          period: latest.preset_type,
        });
      }

      signals.sort((a, b) => Math.abs(b.docChange) - Math.abs(a.docChange));
      res.json(signals.slice(0, 10));
    } catch (error) {
      console.error("Failed to fetch trend comparison:", error);
      res.status(500).json({ error: "Failed to fetch trend comparison" });
    }
  });

  /**
   * GET /api/dashboard/scoring-summary
   * Compact scoring card per topic for dashboard overview
   */
  router.get("/api/dashboard/scoring-summary", async (_req, res) => {
    try {
      const topics = await ctx.db.all("SELECT id, name FROM topics");
      const results: any[] = [];

      for (const topic of topics) {
        // Reuse lightweight scoring logic
        const docCount = await ctx.db.get("SELECT COUNT(*) as count FROM documents WHERE topic_id = ?", [topic.id]);
        const entityCount = await ctx.db.get("SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?", [topic.id]);
        const relationCount = await ctx.db.get("SELECT COUNT(*) as count FROM relations r JOIN documents d ON r.document_id = d.id WHERE d.topic_id = ?", [topic.id]);
        const newestDoc = await ctx.db.get("SELECT MAX(created_at) as newest FROM documents WHERE topic_id = ?", [topic.id]);

        const docs = docCount?.count || 0;
        const entities = entityCount?.count || 0;
        const relations = relationCount?.count || 0;

        // Quick score
        const volume = Math.min(100, Math.round(20 * Math.log2(1 + docs + entities + relations)));
        let freshness = 0;
        if (newestDoc?.newest) {
          const daysSince = (Date.now() - new Date(newestDoc.newest).getTime()) / (1000 * 60 * 60 * 24);
          freshness = Math.max(0, Math.round(100 - daysSince * 3));
        }
        const connectivity = relations > 0 && entities > 0 ? Math.min(100, Math.round((relations / entities) * 50)) : 0;
        const overallScore = Math.round(volume * 0.4 + freshness * 0.3 + connectivity * 0.3);

        let recommendation: string;
        if (overallScore >= 60) recommendation = 'heavy_investment';
        else if (overallScore >= 40) recommendation = 'small_pilot';
        else recommendation = 'continuous_tracking';

        results.push({
          topicId: topic.id,
          topicName: topic.name,
          overallScore,
          recommendation,
          docCount: docs,
          entityCount: entities,
        });
      }

      results.sort((a, b) => b.overallScore - a.overallScore);
      res.json(results);
    } catch (error) {
      console.error("Failed to fetch scoring summary:", error);
      res.status(500).json({ error: "Failed to fetch scoring summary" });
    }
  });

  /**
   * GET /api/alerts
   * Auto-generated alert reports for dashboard display
   */
  router.get("/api/alerts", async (_req, res) => {
    try {
      const alerts = await ctx.db.all(
        `SELECT id, topic_id, title, type, generated_at,
          json_extract(content, '$.meta.alertType') as alert_type,
          json_extract(content, '$.executiveSummary') as summary
         FROM reports WHERE type = 'alert'
         ORDER BY generated_at DESC LIMIT 20`
      );
      const formatted = alerts.map((a: any) => ({
        id: a.id,
        topicId: a.topic_id,
        title: a.title || '告警报告',
        alertType: a.alert_type || 'anomaly',
        summary: a.summary || '',
        generatedAt: a.generated_at,
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  return router;
}

// ===== Helper functions (local to this module) =====

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

/**
 * Fetch topic graph data from the graph API (self-call).
 * Used by dashboard insights to aggregate across all topics.
 */
async function getTopicGraphPayload(topicId: string): Promise<{ nodes: any[]; links: any[] }> {
  const port = parseInt(process.env.PORT || '3000');
  const response = await fetch(`http://127.0.0.1:${port}/api/graph/topic/${encodeURIComponent(topicId)}?hop=1`);
  if (!response.ok) {
    throw new Error(`Failed to fetch topic graph: ${response.status}`);
  }
  const payload = await response.json();
  return {
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    links: Array.isArray(payload.links) ? payload.links : [],
  };
}
