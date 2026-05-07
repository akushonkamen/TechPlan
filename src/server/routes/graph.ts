import { Router } from 'express';
import type { AppContext } from '../context.js';
import { kuzuQuery, closeKuzu } from '../../db/kuzu.js';
import {
  computeStatistics,
  findShortestPath,
  computePageRank,
  detectCommunities,
  predictLinks,
  detectAnomalies,
  extractSubgraph,
  findCrossTopicEntities,
} from '../../lib/graphAnalysis.js';
import { GRAPH_RELATION_TYPES, normalizeGraphRelationType } from '../../types/graph.js';

const PORT = parseInt(process.env.PORT || '3000');

// ── Graph helpers: deterministic node IDs from entity text ──
function entityNodeId(text: string): string {
  return 'e_' + Buffer.from(text, 'utf-8').toString('base64url');
}

function nodeIdToText(id: string): string | null {
  if (!id.startsWith('e_')) return null;
  try {
    return Buffer.from(id.slice(2), 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}

export function createGraphRouter(ctx: AppContext): Router {
  const router = Router();
  const { db, graphSensemaking } = ctx;

  // ===== Graph Database API =====

  /**
   * GET /api/graph/status
   * 获取图数据库状态
   */
  router.get("/api/graph/status", async (_req, res) => {
    try {
      const entityCount = await db.get("SELECT COUNT(*) as count FROM entities");
      const relCount = await db.get("SELECT COUNT(*) as count FROM relations");
      const claimCount = await db.get("SELECT COUNT(*) as count FROM claims");
      const eventCount = await db.get("SELECT COUNT(*) as count FROM events");
      const lastEntity = await db.get("SELECT MAX(created_at) as last FROM entities");

      // Kuzu counts
      let kuzuNodeCount = 0, kuzuRelCount = 0;
      try {
        const nodeRows = await kuzuQuery(`MATCH (n) RETURN COUNT(n) as cnt`);
        kuzuNodeCount = nodeRows[0]?.cnt || 0;

        const relTables = GRAPH_RELATION_TYPES;
        for (const rt of relTables) {
          try {
            const rows = await kuzuQuery(`MATCH ()-[r:${rt}]->() RETURN COUNT(r) as cnt`);
            kuzuRelCount += rows[0]?.cnt || 0;
          } catch {}
        }
      } catch {}

      res.json({
        backend: kuzuNodeCount > 0 ? "kuzu" : "sqlite",
        nodeCount: kuzuNodeCount > 0 ? kuzuNodeCount : (entityCount?.count || 0),
        relationshipCount: kuzuNodeCount > 0 ? kuzuRelCount : (relCount?.count || 0),
        claimCount: claimCount?.count || 0,
        eventCount: eventCount?.count || 0,
        lastSyncAt: lastEntity?.last || null,
        sqliteNodeCount: entityCount?.count || 0,
        sqliteRelationshipCount: relCount?.count || 0,
        kuzuNodeCount,
        kuzuRelCount,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get graph status" });
    }
  });

  /**
   * GET /api/graph/topic/:id
   * 获取主题图谱 — Kuzu graph query with SQLite fallback
   */
  router.get("/api/graph/topic/:id", async (req, res) => {
    try {
      const topicId = req.params.id;
      const topic = await db.get("SELECT * FROM topics WHERE id = ?", [topicId]);
      if (!topic) return res.status(404).json({ error: "Topic not found" });

      // Get hop parameter (default 0 = spoke only, 1 = include inter-entity relations)
      const hop = parseInt(req.query.hop as string) || 0;

      // Check if Kuzu has data for this topic
      let kuzuHasData = false;
      try {
        const checkRows = await kuzuQuery(
          `MATCH (t:Topic {id: $id})-[:HAS_ENTITY]->(e:Entity) RETURN COUNT(e) as cnt`,
          { id: topicId }
        );
        kuzuHasData = checkRows[0]?.cnt > 0;
      } catch {}

      // If no Kuzu data, trigger sync in background and use SQLite fallback
      if (!kuzuHasData) {
        // Background sync for next query
        fetch(`http://localhost:${PORT}/api/graph/sync/${topicId}`, { method: 'POST' }).catch(() => {});

        // SQLite fallback — no topic node; entities, events, claims linked directly
        const nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }> = [];
        const links: Array<{ id: string; source: string; target: string; label: string; properties: Record<string, any> }> = [];

        const entities = await db.all(`
          SELECT e.text, e.type, COUNT(DISTINCT e.document_id) as doc_count,
                 MAX(e.confidence) as confidence, MIN(e.created_at) as first_seen,
                 0.6 * MAX(e.confidence) + 0.4 * MIN(MAX(e.confidence), MIN(1.0, COUNT(DISTINCT e.document_id) * 0.25)) as agg_confidence,
                 (SELECT d2.source_url FROM entities e2 JOIN documents d2 ON e2.document_id = d2.id WHERE e2.text = e.text AND d2.topic_id = ? AND d2.source_url IS NOT NULL AND d2.source_url != '' ORDER BY d2.published_date DESC LIMIT 1) as latest_doc_url,
                 (SELECT d3.published_date FROM entities e3 JOIN documents d3 ON e3.document_id = d3.id WHERE e3.text = e.text AND d3.topic_id = ? AND d3.published_date IS NOT NULL ORDER BY d3.published_date DESC LIMIT 1) as latest_pub_date
          FROM entities e JOIN documents d ON e.document_id = d.id
          WHERE d.topic_id = ?
          GROUP BY e.text ORDER BY doc_count DESC LIMIT 80
        `, [topicId, topicId, topicId]);

        const entityTexts = new Set(entities.map(e => e.text));
        for (const ent of entities) {
          const nid = entityNodeId(ent.text);
          const props: Record<string, any> = { docCount: ent.doc_count, confidence: ent.agg_confidence ?? ent.confidence, firstSeen: ent.first_seen };
          if (ent.latest_doc_url) props.latestDocUrl = ent.latest_doc_url;
          if (ent.latest_pub_date) props.latestPubDate = ent.latest_pub_date;
          nodes.push({ id: nid, label: ent.text, type: (ent.type || 'entity').toLowerCase(), properties: props });
        }

        // Inter-entity relations
        if (hop >= 1) {
          const rawRels = await db.all(`
            SELECT r.source_text, r.target_text, r.relation, MAX(r.confidence) as confidence,
                   COUNT(DISTINCT r.document_id) as doc_count,
                   0.6 * MAX(r.confidence) + 0.4 * MIN(MAX(r.confidence), MIN(1.0, COUNT(DISTINCT r.document_id) * 0.25)) as agg_confidence
            FROM relations r JOIN documents d ON r.document_id = d.id
            WHERE d.topic_id = ? AND r.source_text != r.target_text
            GROUP BY r.source_text, r.target_text, r.relation
            ORDER BY agg_confidence DESC LIMIT 60
          `, [topicId]);

          let relIdx = 0;
          for (const rel of rawRels) {
            if (!entityTexts.has(rel.source_text) || !entityTexts.has(rel.target_text)) continue;
            links.push({
              id: `r${relIdx++}`,
              source: entityNodeId(rel.source_text),
              target: entityNodeId(rel.target_text),
              label: normalizeGraphRelationType(rel.relation),
              properties: { confidence: rel.agg_confidence ?? rel.confidence },
            });
          }
        }

        // Events — link to entities via PARTICIPATED_IN (parse participants JSON)
        const events = await db.all(`SELECT ev.id, ev.title, ev.type, ev.event_time, ev.participants, ev.confidence FROM events ev JOIN documents d ON ev.document_id = d.id WHERE d.topic_id = ? ORDER BY ev.confidence DESC, ev.event_time DESC LIMIT 15`, [topicId]);
        for (const ev of events) {
          const evId = `ev_${ev.id}`;
          nodes.push({ id: evId, label: ev.title || ev.type, type: 'event', properties: { eventType: ev.type, eventTime: ev.event_time, confidence: ev.confidence } });
          // Parse participants and link to matching entities
          try {
            const parts = JSON.parse(ev.participants || '[]');
            for (const p of Array.isArray(parts) ? parts : []) {
              const name = typeof p === 'string' ? p : (p.name || p.text);
              if (name && entityTexts.has(name)) {
                links.push({ id: `ep-${evId}-${entityNodeId(name)}`, source: entityNodeId(name), target: evId, label: 'PARTICIPATED_IN', properties: {} });
              }
            }
          } catch {}
        }

        // Claims — link to entities by matching claim text against entity names
        const claims = await db.all(`SELECT c.id, c.text, c.polarity, c.confidence FROM claims c JOIN documents d ON c.document_id = d.id WHERE d.topic_id = ? ORDER BY c.confidence DESC LIMIT 10`, [topicId]);
        for (const cl of claims) {
          const clId = `cl_${cl.id}`;
          nodes.push({ id: clId, label: cl.text?.length > 60 ? cl.text.slice(0, 60) + '…' : cl.text, type: 'claim', properties: { polarity: cl.polarity, confidence: cl.confidence, fullText: cl.text } });
          // Match entity names in claim text
          if (cl.text) {
            const upperText = cl.text.toUpperCase();
            for (const entName of entityTexts) {
              if (upperText.includes(entName.toUpperCase()) && entName.length > 1) {
                links.push({ id: `cm-${clId}-${entityNodeId(entName)}`, source: entityNodeId(entName), target: clId, label: 'MENTIONS', properties: {} });
              }
            }
          }
        }

        res.json({ nodes, links, metadata: { backend: 'sqlite', topicId, hop, nodeCount: nodes.length, linkCount: links.length } });
        return;
      }

      // ── Kuzu graph query ──
      const centerEntity = req.query.center as string | undefined;
      const nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }> = [];
      const links: Array<{ id: string; source: string; target: string; label: string; properties: Record<string, any> }> = [];

      // Entities (discovered via Topic-HAS_ENTITY, but topic node not included in output)
      const entityRows = await kuzuQuery(
        `MATCH (t:Topic {id: $id})-[:HAS_ENTITY]->(e:Entity) RETURN e.name, e.type, e.confidence, e.docCount, e.firstSeen ORDER BY e.docCount DESC LIMIT 80`,
        { id: topicId }
      );

      const entityNames = new Set<string>();

      // Compute degree centrality
      const degreeMap = new Map<string, number>();
      const relTables = GRAPH_RELATION_TYPES.filter(rt => !['HAS_ENTITY', 'HAS_EVENT', 'HAS_CLAIM', 'ABOUT'].includes(rt));
      const allEntityNames = entityRows.map((r: any) => r['e.name']);
      for (const relType of relTables) {
        try {
          const degRows = await kuzuQuery(
            `MATCH (a:Entity)-[:${relType}]->(b:Entity) WHERE a.name IN $names AND b.name IN $names RETURN a.name, b.name`,
            { names: allEntityNames }
          );
          for (const row of degRows) {
            degreeMap.set(row['a.name'], (degreeMap.get(row['a.name']) || 0) + 1);
            degreeMap.set(row['b.name'], (degreeMap.get(row['b.name']) || 0) + 1);
          }
        } catch {}
      }
      const maxDegree = Math.max(...Array.from(degreeMap.values()), 1);

      // Deduplicate entities by lowercase name (prefer original casing)
      const seenLower = new Map<string, { row: any; name: string }>();
      for (const row of entityRows) {
        const name = row['e.name'];
        const lower = name.toLowerCase();
        const existing = seenLower.get(lower);
        // Prefer original casing (has uppercase letters) over lowercase
        if (!existing || (name !== lower && existing.name === lower)) {
          seenLower.set(lower, { row, name });
        }
      }

      for (const [, { row, name }] of seenLower) {
        const nid = entityNodeId(name);
        entityNames.add(name);
        const degree = degreeMap.get(name) || 0;
        nodes.push({
          id: nid, label: name,
          type: row['e.type'] || 'entity',
          properties: {
            docCount: row['e.docCount'], confidence: row['e.confidence'], firstSeen: row['e.firstSeen'],
            importance: Math.round((degree / maxDegree) * 100) / 100, degree,
          },
        });
      }

      // Enrich Kuzu entities with latestDocUrl/latestPubDate from SQLite
      if (entityNames.size > 0) {
        const nameList = Array.from(entityNames);
        const placeholders = nameList.map(() => '?').join(',');
        const enrichmentRows = await db.all(
          `SELECT e2.text, MAX(d2.source_url) as latest_doc_url, MAX(d3.published_date) as latest_pub_date
           FROM entities e2
           JOIN documents d2 ON e2.document_id = d2.id
           JOIN documents d3 ON e2.document_id = d3.id
           WHERE e2.text IN (${placeholders}) AND d2.topic_id = ?
           GROUP BY e2.text`,
          [...nameList, topicId]
        );
        const enrichMap = new Map(enrichmentRows.map((r: any) => [r.text, r]));
        for (const node of nodes) {
          const text = node.label;
          const enrich = enrichMap.get(text);
          if (enrich) {
            if (enrich.latest_doc_url) node.properties.latestDocUrl = enrich.latest_doc_url;
            if (enrich.latest_pub_date) node.properties.latestPubDate = enrich.latest_pub_date;
          }
        }
      }

      // Inter-entity relations — only when hop >= 1 (include neighbors)
      let relIdx = 0;
      if (hop >= 1 || centerEntity) {
        const targetNames = centerEntity
          ? [centerEntity, ...Array.from(entityNames).filter(n => n !== centerEntity).slice(0, 19)]
          : Array.from(entityNames);
        for (const relType of relTables) {
          try {
            const relRows = await kuzuQuery(
              `MATCH (a:Entity)-[r:${relType}]->(b:Entity)
               WHERE a.name IN $names AND b.name IN $names
               RETURN a.name, b.name, r.confidence LIMIT 60`,
              { names: targetNames }
            );
            for (const row of relRows) {
              links.push({
                id: `r${relIdx++}`,
                source: entityNodeId(row['a.name']),
                target: entityNodeId(row['b.name']),
                label: relType,
                properties: { confidence: row['r.confidence'] },
              });
            }
          } catch {}
        }
      }

      // Events — link to entities via PARTICIPATED_IN (no topic HAS_EVENT edge)
      const eventRows = await kuzuQuery(
        `MATCH (t:Topic {id: $id})-[:HAS_EVENT]->(e:Event) RETURN e.id, e.title, e.eventType, e.eventTime, e.confidence, e.participants LIMIT 15`,
        { id: topicId }
      );
      for (const row of eventRows) {
        const evId = row['e.id'];
        nodes.push({
          id: evId, label: row['e.title'] || row['e.eventType'], type: 'event',
          properties: { eventType: row['e.eventType'], eventTime: row['e.eventTime'], confidence: row['e.confidence'] },
        });
        // Link participants to entities
        try {
          const parts = JSON.parse(row['e.participants'] || '[]');
          for (const p of Array.isArray(parts) ? parts : []) {
            const name = typeof p === 'string' ? p : (p.name || p.text);
            if (name && entityNames.has(name)) {
              links.push({ id: `ep-${evId}-${entityNodeId(name)}`, source: entityNodeId(name), target: evId, label: 'PARTICIPATED_IN', properties: {} });
            }
          }
        } catch {}
      }

      // Claims — link to entities by matching text (no topic HAS_CLAIM edge)
      const claimRows = await kuzuQuery(
        `MATCH (t:Topic {id: $id})-[:HAS_CLAIM]->(c:Claim) RETURN c.id, c.text, c.polarity, c.confidence LIMIT 10`,
        { id: topicId }
      );
      for (const row of claimRows) {
        const clId = row['c.id'];
        const text = row['c.text'] || '';
        nodes.push({
          id: clId, label: text.length > 60 ? text.slice(0, 60) + '…' : text, type: 'claim',
          properties: { polarity: row['c.polarity'], confidence: row['c.confidence'], fullText: text },
        });
        // Match entity names in claim text
        if (text) {
          const upperText = text.toUpperCase();
          for (const entName of entityNames) {
            if (upperText.includes(entName.toUpperCase()) && entName.length > 1) {
              links.push({ id: `cm-${clId}-${entityNodeId(entName)}`, source: entityNodeId(entName), target: clId, label: 'MENTIONS', properties: {} });
            }
          }
        }
      }

      res.json({ nodes, links, metadata: { backend: 'kuzu', topicId, hop, nodeCount: nodes.length, linkCount: links.length } });
    } catch (error) {
      console.error("Failed to get topic graph:", error);
      res.status(500).json({ error: "Failed to get topic graph" });
    }
  });

  async function getTopicGraphPayload(topicId: string): Promise<{ nodes: any[]; links: any[] }> {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/graph/topic/${encodeURIComponent(topicId)}?hop=1`);
    if (!response.ok) {
      throw new Error(`Failed to fetch topic graph: ${response.status}`);
    }
    const payload = await response.json();
    return {
      nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
      links: Array.isArray(payload.links) ? payload.links : [],
    };
  }

  /**
   * GET /api/graph/sensemaking/:topicId
   * Return cached LLM terrain clusters, or a deterministic fallback while cache is missing/stale.
   */
  router.get("/api/graph/sensemaking/:topicId", async (req, res) => {
    try {
      const topicId = req.params.topicId;
      const graph = await getTopicGraphPayload(topicId);
      const sensemaking = await graphSensemaking.get(topicId, graph);
      res.json(sensemaking);
    } catch (error: any) {
      console.error("Failed to get graph sensemaking:", error);
      res.status(500).json({ error: "Failed to get graph sensemaking", details: error?.message });
    }
  });

  /**
   * POST /api/graph/sensemaking/:topicId/refresh
   * Start an async LLM refresh. The UI can continue using fallback/cache and poll GET.
   */
  router.post("/api/graph/sensemaking/:topicId/refresh", async (req, res) => {
    try {
      const topicId = req.params.topicId;
      const graph = await getTopicGraphPayload(topicId);
      await graphSensemaking.markRefreshing(topicId, graph);
      graphSensemaking.refresh(topicId, graph).catch((error: any) => {
        console.error(`[GraphSensemaking] Refresh failed for ${topicId}:`, error?.message || error);
      });
      const sensemaking = await graphSensemaking.get(topicId, graph);
      res.status(202).json(sensemaking);
    } catch (error: any) {
      console.error("Failed to refresh graph sensemaking:", error);
      res.status(500).json({ error: "Failed to refresh graph sensemaking", details: error?.message });
    }
  });

  /**
   * GET /api/graph/entity/:id
   * 获取实体详情和邻域 — SQLite-direct
   */
  router.get("/api/graph/entity/:id", async (req, res) => {
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
   * GET /api/graph/entity/:entityName/docs
   * 获取实体关联的文档列表
   */
  router.get("/api/graph/entity/:entityName/docs", async (req, res) => {
    try {
      const entityName = decodeURIComponent(req.params.entityName);
      const topicId = req.query.topicId as string | undefined;

      let query = `
        SELECT DISTINCT d.id, d.title, d.source_url, d.published_date, d.created_at, d.topic_id
        FROM documents d
        JOIN entities e ON e.document_id = d.id
        WHERE LOWER(e.text) = LOWER(?)
      `;
      const params: any[] = [entityName];

      if (topicId) {
        query += ` AND d.topic_id = ?`;
        params.push(topicId);
      }

      query += ` ORDER BY d.published_date DESC NULLS LAST LIMIT 20`;

      const docs = await db.all(query, params);
      res.json(docs.map((d: any) => ({
        id: d.id,
        title: d.title,
        sourceUrl: d.source_url,
        publishedDate: d.published_date,
        collectedAt: d.created_at,
        topicId: d.topic_id,
      })));
    } catch (error) {
      console.error("Failed to get entity docs:", error);
      res.status(500).json({ error: "Failed to get entity documents" });
    }
  });

  /**
   * GET /api/graph/claims/:topicId
   * 查找主题相关的 Claims — SQLite-direct
   */
  router.get("/api/graph/claims/:topicId", async (req, res) => {
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
  router.get("/api/graph/related/:entityId", async (req, res) => {
    try {
      const entityId = req.params.entityId;
      const entityText = nodeIdToText(decodeURIComponent(entityId));

      if (!entityText) return res.json({ entities: [], count: 0 });

      const related = await db.all(`
        SELECT DISTINCT
          CASE WHEN r.source_text = ? THEN r.target_text ELSE r.source_text END as name,
          r.relation, MAX(r.confidence) as confidence,
          COUNT(DISTINCT r.document_id) as doc_count,
          0.6 * MAX(r.confidence) + 0.4 * MIN(MAX(r.confidence), MIN(1.0, COUNT(DISTINCT r.document_id) * 0.25)) as agg_confidence
        FROM relations r JOIN documents d ON r.document_id = d.id
        WHERE r.source_text = ? OR r.target_text = ?
        GROUP BY name, r.relation
        ORDER BY agg_confidence DESC LIMIT 20
      `, [entityText, entityText, entityText]);

      const entities = [];
      for (const r of related) {
        const ent = await db.get("SELECT type, confidence FROM entities WHERE text = ? LIMIT 1", [r.name]);
        entities.push({ id: entityNodeId(r.name), name: r.name, type: ent?.type || 'entity', relation: r.relation, confidence: r.agg_confidence ?? r.confidence });
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
  router.get("/api/graph/recent/:topicId", async (req, res) => {
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
          AND (r.confidence > 0.5 OR COUNT(DISTINCT r.document_id) >= 2)
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
  router.get("/api/graph/timeline/:entityId", async (req, res) => {
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
   * GET /api/graph/neighbor/:entityName
   * 获取实体的邻域图 — entity neighbors with relationships
   */
  router.get("/api/graph/neighbor/:entityName", async (req, res) => {
    try {
      const entityName = decodeURIComponent(req.params.entityName);
      const hop = Math.max(1, Math.min(3, parseInt(req.query.hop as string) || 1)); // 默认1跳，最多3跳
      const limit = Math.max(10, Math.min(100, parseInt(req.query.limit as string) || 30)); // 默认30个节点

      // Get main entity info
      const mainEntity = await db.get("SELECT text, type, confidence, COUNT(DISTINCT document_id) as doc_count FROM entities WHERE text = ? GROUP BY text", [entityName]);
      if (!mainEntity) {
        return res.status(404).json({ error: "Entity not found" });
      }

      const nodes: Array<{ id: string; label: string; type: string; properties: Record<string, any> }> = [];
      const links: Array<{ id: string; source: string; target: string; label: string; properties: Record<string, any> }> = [];
      const visitedNodes = new Set<string>();
      const visitedLinks = new Set<string>();

      // Add center node
      const centerId = entityNodeId(entityName);
      nodes.push({
        id: centerId,
        label: entityName,
        type: (mainEntity.type || 'entity').toLowerCase(),
        properties: {
          docCount: mainEntity.doc_count,
          confidence: mainEntity.confidence,
          isCenter: true,
        },
      });
      visitedNodes.add(entityName);

      // BFS to collect neighbors up to hop levels
      let currentLevel = new Set<string>([entityName]);
      let level = 0;

      while (currentLevel.size > 0 && level < hop && nodes.length < limit) {
        level++;
        const nextLevel = new Set<string>();

        for (const sourceEntity of currentLevel) {
          // Get relations where this entity is source or target
          const relations = await db.all(`
            SELECT r.source_text, r.target_text, r.relation, MAX(r.confidence) as confidence,
                   COUNT(DISTINCT r.document_id) as doc_count,
                   0.6 * MAX(r.confidence) + 0.4 * MIN(MAX(r.confidence), MIN(1.0, COUNT(DISTINCT r.document_id) * 0.25)) as agg_confidence
            FROM relations r
            WHERE (r.source_text = ? OR r.target_text = ?)
            AND r.source_text != r.target_text
            GROUP BY r.source_text, r.target_text, r.relation
            ORDER BY agg_confidence DESC
            LIMIT 20
          `, [sourceEntity, sourceEntity]);

          for (const rel of relations) {
            const otherEntity = rel.source_text === sourceEntity ? rel.target_text : rel.source_text;

            // Skip if already visited or limit reached
            if (visitedNodes.has(otherEntity) || nodes.length >= limit) continue;

            // Get entity info
            const entityInfo = await db.get("SELECT type, MAX(confidence) as confidence FROM entities WHERE text = ?", [otherEntity]);

            // Add node
            const nodeId = entityNodeId(otherEntity);
            nodes.push({
              id: nodeId,
              label: otherEntity,
              type: (entityInfo?.type || 'entity').toLowerCase(),
              properties: {
                confidence: entityInfo?.confidence,
              },
            });
            visitedNodes.add(otherEntity);
            nextLevel.add(otherEntity);

            // Add link
            const sourceId = entityNodeId(rel.source_text);
            const targetId = entityNodeId(rel.target_text);
            const linkId = `${sourceId}-${targetId}-${rel.relation}`;

            if (!visitedLinks.has(linkId)) {
              links.push({
                id: linkId,
                source: sourceId,
                target: targetId,
                label: normalizeGraphRelationType(rel.relation),
                properties: { confidence: rel.agg_confidence ?? rel.confidence },
              });
              visitedLinks.add(linkId);
            }
          }
        }

        currentLevel = nextLevel;
      }

      res.json({
        centerEntity: {
          id: centerId,
          name: entityName,
          type: mainEntity.type,
          properties: {
            docCount: mainEntity.doc_count,
            confidence: mainEntity.confidence,
          },
        },
        nodes,
        links,
        graph: {
          nodes,
          links,
        },
        metadata: {
          hop,
          totalNodes: nodes.length,
          totalLinks: links.length,
          centerName: entityName,
        },
      });
    } catch (error) {
      console.error("Failed to get entity neighborhood:", error);
      res.status(500).json({ error: "Failed to get entity neighborhood" });
    }
  });

  /**
   * POST /api/graph/sync/:topicId
   * Sync topic graph data from SQLite to Kuzu
   */
  router.post("/api/graph/sync/:topicId", async (req, res) => {
    try {
      const topicId = req.params.topicId;
      const topic = await db.get("SELECT * FROM topics WHERE id = ?", [topicId]);
      if (!topic) {
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      let nodesCreated = 0;
      let relationshipsCreated = 0;

      // 1. Create/update Topic node
      await kuzuQuery(
        `MERGE (t:Topic {id: $id}) ON CREATE SET t.name = $name, t.description = $descr ON MATCH SET t.name = $name, t.description = $descr`,
        { id: topicId, name: topic.name || '', descr: topic.description || '' }
      );
      nodesCreated++;

      // 1b. Clean up old graph data for this topic (remove stale entities with wrong casing)
      try {
        // Get existing entity names for this topic
        const existingEntNames = await kuzuQuery(
          `MATCH (t:Topic {id: $id})-[:HAS_ENTITY]->(e:Entity) RETURN e.name as name`,
          { id: topicId }
        );
        for (const row of existingEntNames) {
          try {
            await kuzuQuery(`MATCH (e:Entity {name: $name}) DETACH DELETE e`, { name: row.name });
          } catch {}
        }
        // Clean old events/claims
        const existingEvents = await kuzuQuery(
          `MATCH (t:Topic {id: $id})-[:HAS_EVENT]->(e:Event) RETURN e.id as eid`,
          { id: topicId }
        );
        for (const row of existingEvents) {
          try { await kuzuQuery(`MATCH (e:Event {id: $eid}) DETACH DELETE e`, { eid: row.eid }); } catch {}
        }
        const existingClaims = await kuzuQuery(
          `MATCH (t:Topic {id: $id})-[:HAS_CLAIM]->(c:Claim) RETURN c.id as cid`,
          { id: topicId }
        );
        for (const row of existingClaims) {
          try { await kuzuQuery(`MATCH (c:Claim {id: $cid}) DETACH DELETE c`, { cid: row.cid }); } catch {}
        }
      } catch (cleanupErr: any) {
        console.error('[Kuzu] Cleanup warning:', cleanupErr?.message);
      }

      // 2. Get deduplicated entities (group by lowercase for dedup, preserve original casing)
      const entities = await db.all(`
        SELECT MAX(TRIM(e.text)) as text, e.type, COUNT(DISTINCT e.document_id) as doc_count,
               MAX(e.confidence) as confidence, MIN(e.created_at) as first_seen,
               0.6 * MAX(e.confidence) + 0.4 * MIN(MAX(e.confidence), MIN(1.0, COUNT(DISTINCT e.document_id) * 0.25)) as agg_confidence
        FROM entities e JOIN documents d ON e.document_id = d.id
        WHERE d.topic_id = ?
        GROUP BY LOWER(TRIM(e.text)), e.type ORDER BY doc_count DESC LIMIT 200
      `, [topicId]);

      // 3. Create Entity nodes
      for (const ent of entities) {
        try {
          await kuzuQuery(
            `MERGE (e:Entity {name: $name}) ON CREATE SET e.type = $type, e.confidence = $conf, e.docCount = $docs, e.firstSeen = $first ON MATCH SET e.type = $type, e.confidence = $conf, e.docCount = $docs, e.firstSeen = $first`,
            {
              name: ent.text,
              type: (ent.type || 'entity').toLowerCase(),
              conf: ent.agg_confidence ?? (ent.confidence || 0.5),
              docs: ent.doc_count || 0,
              first: ent.first_seen || '',
            }
          );
          nodesCreated++;
        } catch (e: any) {
          console.error(`[Kuzu] Failed to create entity: ${ent.text}`, e?.message);
        }
      }

      // 4. Create HAS_ENTITY relationships
      const entityNames = entities.map(e => e.text);
      for (const entName of entityNames) {
        try {
          await kuzuQuery(
            `MATCH (t:Topic {id: $tid}), (e:Entity {name: $name}) MERGE (t)-[:HAS_ENTITY]->(e)`,
            { tid: topicId, name: entName }
          );
          relationshipsCreated++;
        } catch {}
      }

      // 5. Create inter-entity relationships (use original casing, match against entity names)
      const entityNameLookup = new Map<string, string>();
      for (const name of entityNames) {
        entityNameLookup.set(name.toLowerCase(), name);
      }

      const rawRels = await db.all(`
        SELECT MAX(TRIM(r.source_text)) as source_text, MAX(TRIM(r.target_text)) as target_text,
               r.relation, MAX(r.confidence) as confidence,
               0.6 * MAX(r.confidence) + 0.4 * MIN(MAX(r.confidence), MIN(1.0, COUNT(DISTINCT r.document_id) * 0.25)) as agg_confidence
        FROM relations r JOIN documents d ON r.document_id = d.id
        WHERE d.topic_id = ? AND LOWER(TRIM(r.source_text)) != LOWER(TRIM(r.target_text))
        GROUP BY LOWER(TRIM(r.source_text)), LOWER(TRIM(r.target_text)), r.relation
        ORDER BY agg_confidence DESC LIMIT 200
      `, [topicId]);

      for (const rel of rawRels) {
        // Resolve to the canonical entity name (original casing)
        const srcCanonical = entityNameLookup.get(rel.source_text.toLowerCase());
        const tgtCanonical = entityNameLookup.get(rel.target_text.toLowerCase());
        if (!srcCanonical || !tgtCanonical) continue;
        rel.source_text = srcCanonical;
        rel.target_text = tgtCanonical;
        const relType = normalizeGraphRelationType(rel.relation);
        try {
          await kuzuQuery(
            `MATCH (a:Entity {name: $src}), (b:Entity {name: $tgt})
             MERGE (a)-[:${relType} {confidence: $conf}]->(b)`,
            { src: rel.source_text, tgt: rel.target_text, conf: rel.agg_confidence ?? (rel.confidence || 0.5) }
          );
          relationshipsCreated++;
        } catch {}
      }

      // 6. Create Event nodes
      const events = await db.all(`
        SELECT ev.id, ev.title, ev.type, ev.event_time, ev.participants, ev.confidence
        FROM events ev JOIN documents d ON ev.document_id = d.id
        WHERE d.topic_id = ? ORDER BY ev.confidence DESC LIMIT 50
      `, [topicId]);

      for (const ev of events) {
        try {
          await kuzuQuery(
            `MERGE (e:Event {id: $id}) ON CREATE SET e.title = $title, e.eventType = $type, e.eventTime = $time, e.participants = $parts, e.confidence = $conf ON MATCH SET e.title = $title, e.eventType = $type, e.eventTime = $time, e.participants = $parts, e.confidence = $conf`,
            { id: `ev_${ev.id}`, title: ev.title || ev.type || '', type: ev.type || '', time: ev.event_time || '', parts: typeof ev.participants === 'string' ? ev.participants : JSON.stringify(ev.participants || []), conf: ev.confidence || 0.5 }
          );
          nodesCreated++;
          await kuzuQuery(
            `MATCH (t:Topic {id: $tid}), (e:Event {id: $eid}) MERGE (t)-[:HAS_EVENT]->(e)`,
            { tid: topicId, eid: `ev_${ev.id}` }
          );
          relationshipsCreated++;
        } catch {}
      }

      // 7. Create Claim nodes
      const claims = await db.all(`
        SELECT c.id, c.text, c.polarity, c.confidence
        FROM claims c JOIN documents d ON c.document_id = d.id
        WHERE d.topic_id = ? ORDER BY c.confidence DESC LIMIT 50
      `, [topicId]);

      for (const cl of claims) {
        try {
          await kuzuQuery(
            `MERGE (c:Claim {id: $id}) ON CREATE SET c.text = $text, c.polarity = $pol, c.confidence = $conf ON MATCH SET c.text = $text, c.polarity = $pol, c.confidence = $conf`,
            { id: `cl_${cl.id}`, text: (cl.text || '').slice(0, 500), pol: cl.polarity || 'neutral', conf: cl.confidence || 0.5 }
          );
          nodesCreated++;
          await kuzuQuery(
            `MATCH (t:Topic {id: $tid}), (c:Claim {id: $cid}) MERGE (t)-[:HAS_CLAIM]->(c)`,
            { tid: topicId, cid: `cl_${cl.id}` }
          );
          relationshipsCreated++;
        } catch {}
      }

      res.json({
        topicId,
        topicName: topic.name,
        syncStats: { nodesCreated, relationshipsCreated },
        errors: [],
      });
    } catch (error: any) {
      console.error("Failed to sync graph:", error);
      res.status(500).json({ error: "Failed to sync graph", details: error?.message });
    }
  });

  // ===== Graph Analysis API =====

  /**
   * GET /api/graph/stats/:topicId
   * Graph statistics: density, degree, components, diameter, clustering coefficient
   */
  router.get("/api/graph/stats/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id, properties: n.properties }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence, type: e.label }));
      res.json(computeStatistics(nodes, edges));
    } catch (error: any) {
      console.error("Failed to compute graph stats:", error);
      res.status(500).json({ error: "Failed to compute graph stats", details: error?.message });
    }
  });

  /**
   * GET /api/graph/path/:topicId/:sourceId/:targetId
   * Shortest path between two entities (Dijkstra with confidence weight)
   */
  router.get("/api/graph/path/:topicId/:sourceId/:targetId", async (req, res) => {
    try {
      const { topicId, sourceId, targetId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence }));
      const result = findShortestPath(nodes, edges, decodeURIComponent(sourceId), decodeURIComponent(targetId));
      // Enrich path with node labels
      const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
      res.json({ ...result, pathLabels: result.path.map(id => nodeMap.get(id)?.label || id) });
    } catch (error: any) {
      console.error("Failed to find path:", error);
      res.status(500).json({ error: "Failed to find path", details: error?.message });
    }
  });

  /**
   * GET /api/graph/centrality/:topicId
   * PageRank centrality scores
   */
  router.get("/api/graph/centrality/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence }));
      const topK = Math.min(30, parseInt(req.query.top as string) || 20);
      res.json(computePageRank(nodes, edges).slice(0, topK));
    } catch (error: any) {
      console.error("Failed to compute centrality:", error);
      res.status(500).json({ error: "Failed to compute centrality", details: error?.message });
    }
  });

  /**
   * GET /api/graph/communities/:topicId
   * Community detection via label propagation
   */
  router.get("/api/graph/communities/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence, type: e.label }));
      res.json(detectCommunities(nodes, edges));
    } catch (error: any) {
      console.error("Failed to detect communities:", error);
      res.status(500).json({ error: "Failed to detect communities", details: error?.message });
    }
  });

  /**
   * GET /api/graph/predictions/:topicId
   * Link predictions (Jaccard + Adamic-Adar)
   */
  router.get("/api/graph/predictions/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence }));
      const topK = Math.min(30, parseInt(req.query.top as string) || 15);
      res.json(predictLinks(nodes, edges, topK));
    } catch (error: any) {
      console.error("Failed to predict links:", error);
      res.status(500).json({ error: "Failed to predict links", details: error?.message });
    }
  });

  /**
   * GET /api/graph/anomalies/:topicId
   * Anomaly detection: degree outliers, isolated high-confidence, bridge nodes
   */
  router.get("/api/graph/anomalies/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence }));
      res.json(detectAnomalies(nodes, edges));
    } catch (error: any) {
      console.error("Failed to detect anomalies:", error);
      res.status(500).json({ error: "Failed to detect anomalies", details: error?.message });
    }
  });

  /**
   * GET /api/graph/subgraph/:topicId
   * Extract filtered subgraph by nodeTypes, edgeTypes, minConfidence
   */
  router.get("/api/graph/subgraph/:topicId", async (req, res) => {
    try {
      const { topicId } = req.params;
      const graph = await getTopicGraphPayload(topicId);
      const nodes = graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id, properties: n.properties }));
      const edges = graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target, confidence: e.properties?.confidence, type: e.label }));
      const filter = {
        nodeTypes: req.query.nodeTypes ? (req.query.nodeTypes as string).split(',') : undefined,
        edgeTypes: req.query.edgeTypes ? (req.query.edgeTypes as string).split(',') : undefined,
        minConfidence: req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined,
        maxConfidence: req.query.maxConfidence ? parseFloat(req.query.maxConfidence as string) : undefined,
        maxNodes: req.query.maxNodes ? parseInt(req.query.maxNodes as string) : undefined,
      };
      res.json(extractSubgraph(nodes, edges, filter));
    } catch (error: any) {
      console.error("Failed to extract subgraph:", error);
      res.status(500).json({ error: "Failed to extract subgraph", details: error?.message });
    }
  });

  /**
   * GET /api/graph/global
   * Cross-topic entity resolution — find entities appearing across multiple topics
   */
  router.get("/api/graph/global", async (_req, res) => {
    try {
      const topics = await db.all("SELECT id, name FROM topics") as Array<{ id: string; name: string }>;
      const topicsData = [];
      for (const topic of topics) {
        try {
          const graph = await getTopicGraphPayload(topic.id);
          topicsData.push({
            topicId: topic.id,
            topicName: topic.name,
            nodes: graph.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label || n.id })),
            edges: graph.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
          });
        } catch { /* skip failed topics */ }
      }
      res.json(findCrossTopicEntities(topicsData));
    } catch (error: any) {
      console.error("Failed to resolve cross-topic entities:", error);
      res.status(500).json({ error: "Failed to resolve cross-topic entities", details: error?.message });
    }
  });

  return router;
}
