import type { Database } from 'sqlite';
import { getGraphService } from './graphService.js';
import type { GraphNode, GraphRelationship } from '../types/graph.js';
import type { ReportGraphLink } from './reportService.js';
import { v4 as uuidv4 } from 'uuid';

interface ReportContent {
  executiveSummary?: {
    overview: string;
    keyPoints: string[];
    confidence: string;
    period?: { start: string; end: string };
  };
  sections?: Array<{
    id: string;
    title: string;
    thesis: string;
    content: string;
    highlights: string[];
    signals: Array<{
      type: string;
      title: string;
      description: string;
      confidence: number;
    }>;
    entityRefs: string[];
  }>;
  timeline?: Array<{
    date: string;
    event: string;
    significance: string;
    entityRefs: string[];
  }>;
  metrics?: {
    documentsAnalyzed: number;
    entitiesCovered: number;
    sourcesCredibility: string;
  };
}

interface GraphSnapshot {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  highlights: Array<{
    nodeId: string;
    sectionRef: string;
    reason: string;
  }>;
}

interface EvidencePath {
  from: string;
  to: string;
  path: string[];
  evidence: string[];
}

export class ReportGraphService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async buildGraphLinks(
    reportId: string,
    topicId: string,
    content: ReportContent
  ): Promise<ReportGraphLink[]> {
    const links: ReportGraphLink[] = [];
    const graphService = getGraphService();

    const subgraph = await graphService.getTopicGraph(topicId, 2);
    const nodeMap = new Map<string, GraphNode>();
    for (const node of subgraph.nodes) {
      const name = node.properties.name || node.properties.title || '';
      if (name) {
        nodeMap.set(name.toLowerCase(), node);
      }
    }

    if (content.sections) {
      for (const section of content.sections) {
        if (section.entityRefs) {
          for (const entityName of section.entityRefs) {
            const node = nodeMap.get(entityName.toLowerCase());
            if (node) {
              const link: ReportGraphLink = {
                id: uuidv4(),
                report_id: reportId,
                section_id: section.id,
                graph_node_id: node.id,
                link_type: 'entity_ref',
                metadata: { entityName, sectionTitle: section.title },
                created_at: new Date().toISOString(),
              };
              links.push(link);
              await this.saveLink(link);
            }
          }
        }
      }
    }

    if (content.timeline) {
      for (let i = 0; i < content.timeline.length; i++) {
        const entry = content.timeline[i];
        if (entry.entityRefs) {
          for (const entityName of entry.entityRefs) {
            const node = nodeMap.get(entityName.toLowerCase());
            if (node) {
              const link: ReportGraphLink = {
                id: uuidv4(),
                report_id: reportId,
                section_id: `timeline_${i}`,
                graph_node_id: node.id,
                link_type: 'entity_ref',
                metadata: { entityName, event: entry.event },
                created_at: new Date().toISOString(),
              };
              links.push(link);
              await this.saveLink(link);
            }
          }
        }
      }
    }

    return links;
  }

  private async saveLink(link: ReportGraphLink): Promise<void> {
    await this.db.run(
      `INSERT INTO report_graph_links (id, report_id, section_id, graph_node_id, graph_relationship_id, link_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        link.id,
        link.report_id,
        link.section_id,
        link.graph_node_id || null,
        link.graph_relationship_id || null,
        link.link_type,
        link.metadata ? JSON.stringify(link.metadata) : null,
        link.created_at,
      ]
    );
  }

  async getGraphSnapshot(reportId: string): Promise<GraphSnapshot> {
    const report = await this.db.get(
      "SELECT topic_id, content FROM reports WHERE id = ?",
      [reportId]
    );

    if (!report) {
      throw new Error('Report not found');
    }

    const links = await this.db.all(
      "SELECT * FROM report_graph_links WHERE report_id = ?",
      [reportId]
    ) as ReportGraphLink[];

    const graphService = getGraphService();
    const subgraph = await graphService.getTopicGraph(report.topic_id, 2);

    const nodeIds = new Set<string>();
    for (const link of links) {
      if (link.graph_node_id) {
        nodeIds.add(link.graph_node_id);
      }
    }

    const highlights: GraphSnapshot['highlights'] = links
      .filter(l => l.graph_node_id)
      .map(l => ({
        nodeId: l.graph_node_id!,
        sectionRef: l.section_id,
        reason: (l.metadata as any)?.entityName || l.link_type,
      }));

    return {
      nodes: subgraph.nodes,
      relationships: subgraph.relationships,
      highlights,
    };
  }

  async getSectionEvidence(
    reportId: string,
    sectionId: string
  ): Promise<{
    section: string;
    claims: Array<{
      claim: string;
      evidence: Array<{
        type: 'document' | 'entity' | 'event';
        id: string;
        content: string;
        source: string;
      }>;
      confidence: number;
    }>;
  }> {
    const report = await this.db.get(
      "SELECT topic_id, content FROM reports WHERE id = ?",
      [reportId]
    );

    if (!report) {
      throw new Error('Report not found');
    }

    let content: ReportContent;
    try {
      content = typeof report.content === 'string' 
        ? JSON.parse(report.content) 
        : report.content;
    } catch {
      throw new Error('Invalid report content');
    }

    const section = content.sections?.find(s => s.id === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    const claims: Array<{
      claim: string;
      evidence: Array<{
        type: 'document' | 'entity' | 'event';
        id: string;
        content: string;
        source: string;
      }>;
      confidence: number;
    }> = [];

    if (section.entityRefs && section.entityRefs.length > 0) {
      for (const entityName of section.entityRefs) {
        const entityDocs = await this.db.all(
          `SELECT d.id, d.title, d.source, substr(d.content, 1, 500) as excerpt
           FROM documents d
           JOIN entities e ON e.document_id = d.id
           WHERE d.topic_id = ? AND e.text = ?
           LIMIT 3`,
          [report.topic_id, entityName]
        );

        if (entityDocs.length > 0) {
          claims.push({
            claim: `${entityName} 相关动态`,
            evidence: entityDocs.map(doc => ({
              type: 'document' as const,
              id: doc.id,
              content: doc.excerpt || doc.title,
              source: doc.source || '未知来源',
            })),
            confidence: 0.8,
          });
        }
      }
    }

    for (const signal of section.signals || []) {
      claims.push({
        claim: signal.title,
        evidence: [{
          type: 'document',
          id: 'signal',
          content: signal.description,
          source: '分析推断',
        }],
        confidence: signal.confidence,
      });
    }

    return {
      section: section.title,
      claims,
    };
  }

  async findEvidencePath(
    reportId: string,
    fromEntity: string,
    toEntity: string
  ): Promise<EvidencePath | null> {
    const report = await this.db.get(
      "SELECT topic_id FROM reports WHERE id = ?",
      [reportId]
    );

    if (!report) {
      return null;
    }

    const graphService = getGraphService();
    const subgraph = await graphService.getTopicGraph(report.topic_id, 3);

    const fromNode = subgraph.nodes.find(
      n => (n.properties.name || '').toLowerCase() === fromEntity.toLowerCase()
    );
    const toNode = subgraph.nodes.find(
      n => (n.properties.name || '').toLowerCase() === toEntity.toLowerCase()
    );

    if (!fromNode || !toNode) {
      return null;
    }

    const path = await graphService.findPath(fromNode.id, toNode.id, 4);
    if (!path || path.length < 2) {
      return null;
    }

    const evidence: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const rel = subgraph.relationships.find(
        r => r.from === path[i].id && r.to === path[i + 1].id
      );
      if (rel) {
        evidence.push(`${path[i].properties.name} --[${rel.type}]--> ${path[i + 1].properties.name}`);
      }
    }

    return {
      from: fromEntity,
      to: toEntity,
      path: path.map(n => n.properties.name || n.id),
      evidence,
    };
  }

  async getRelatedNodes(
    reportId: string,
    sectionId: string
  ): Promise<GraphNode[]> {
    const links = await this.db.all(
      "SELECT graph_node_id FROM report_graph_links WHERE report_id = ? AND section_id = ?",
      [reportId, sectionId]
    ) as { graph_node_id: string }[];

    const nodeIds = links.map(l => l.graph_node_id).filter(Boolean);
    if (nodeIds.length === 0) {
      return [];
    }

    const graphService = getGraphService();
    const nodes: GraphNode[] = [];

    for (const nodeId of nodeIds) {
      const node = await graphService.getNode(nodeId);
      if (node) {
        nodes.push(node);
      }
    }

    return nodes;
  }
}
