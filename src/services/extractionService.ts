/**
 * 知识抽取服务
 * 支持多种 AI 提供商（OpenAI、Gemini、自定义）
 */

import { callAI, extractWithSchema, getAIConfig, resetAIConfig } from './aiService.js';

// ==================== 类型定义 ====================

export interface Entity {
  id: string;
  text: string;
  type: 'person' | 'organization' | 'technology' | 'product' | 'location' | 'event' | 'other';
  confidence: number;
  metadata?: Record<string, any>;
}

export interface Relation {
  id: string;
  source: string; // entity ID or text
  target: string; // entity ID or text
  relation: string;
  confidence: number;
}

export interface Claim {
  id: string;
  text: string;
  type: 'prediction' | 'opinion' | 'assertion' | 'finding' | 'announcement';
  polarity: 'positive' | 'negative' | 'neutral';
  confidence: number;
  sourceContext?: string;
}

export interface Event {
  id: string;
  type: string;
  title: string;
  description: string;
  time?: string;
  location?: string;
  participants: string[];
  confidence: number;
}

export interface ExtractionResult {
  entities: Entity[];
  relations: Relation[];
  claims: Claim[];
  events: Event[];
  metadata: {
    textLength: number;
    extractedAt: string;
    provider: string;
    model: string;
  };
}

// ==================== 实体抽取 ====================

/**
 * 从文本中抽取实体（人物、机构、技术、产品等）
 */
export async function extractEntities(text: string, options?: {
  maxEntities?: number;
  entityTypes?: string[];
}): Promise<Entity[]> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  if (!text || text.trim().length < 10) {
    return [];
  }

  const maxEntities = options?.maxEntities || 50;
  const entityTypes = options?.entityTypes || ['person', 'organization', 'technology', 'product', 'location', 'event'];

  try {
    const schema = {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '实体的确切文本，尽可能使用原文' },
              type: {
                type: 'string',
                description: '实体类型',
                enum: ['person', 'organization', 'technology', 'product', 'location', 'event', 'other']
              },
              confidence: { type: 'number', description: '置信度 0-1' },
              description: { type: 'string', description: '实体的简短描述' }
            },
            required: ['text', 'type', 'confidence', 'description'],
            additionalProperties: false
          }
        }
      },
      required: ['entities'],
      additionalProperties: false
    };

    const prompt = `从以下文本中抽取关键实体。请识别并分类人物、机构、技术、产品、地点和事件。

文本：
"""${text.substring(0, 15000)}"""

请为每个实体提供：
- text: 实体的确切文本
- type: 实体类型（person/organization/technology/product/location/event/other）
- confidence: 置信度（0-1之间的浮点数，基于文本中实体提及的明确程度）
- description: 简短描述（可选）

最多返回 ${maxEntities} 个最重要的实体。`;

    const result = await extractWithSchema(prompt, schema);

    if (result && result.entities) {
      return (result.entities as any[]).map((e: any, idx: number) => ({
        id: `entity_${Date.now()}_${idx}`,
        text: e.text,
        type: e.type,
        confidence: Math.min(1, Math.max(0, e.confidence || 0.5)),
        metadata: e.description ? { description: e.description } : undefined
      }));
    }

    return [];
  } catch (error) {
    console.error("实体抽取错误:", error);
    return [];
  }
}

// ==================== 关系抽取 ====================

/**
 * 从文本中抽取实体间的关系
 */
export async function extractRelations(text: string, entities?: Entity[]): Promise<Relation[]> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  if (!text || text.trim().length < 10) {
    return [];
  }

  // 提供已知实体作为上下文
  const entityContext = entities && entities.length > 0
    ? `\n\n已知实体（用于建立关系）:\n${entities.map(e => `- ${e.text} (${e.type})`).join('\n')}`
    : '';

  try {
    const schema = {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: '源实体的文本' },
              target: { type: 'string', description: '目标实体的文本' },
              relation: {
                type: 'string',
                description: '关系类型，使用简短的动词或动词短语，如 invests_in, partners_with, acquires, launches'
              },
              confidence: { type: 'number', description: '置信度 0-1' }
            },
            required: ['source', 'target', 'relation', 'confidence'],
            additionalProperties: false
          }
        }
      },
      required: ['relations'],
      additionalProperties: false
    };

    const prompt = `从以下文本中抽取实体之间的关系。${entityContext}

文本：
"""${text.substring(0, 15000)}"""

请识别实体之间的关系，例如：
- 合作关系 (partner_with, collaborates_with)
- 竞争关系 (competes_with)
- 所属关系 (owned_by, part_of)
- 投资关系 (invests_in, funded_by)
- 发布/推出关系 (releases, launches)
- 使用/采用关系 (uses, adopts)
- 其他有意义的语义关系

为每个关系提供：
- source: 源实体文本
- target: 目标实体文本
- relation: 关系类型（使用动词或简短短语）
- confidence: 置信度（0-1）`;

    const result = await extractWithSchema(prompt, schema);

    if (result && result.relations) {
      return (result.relations as any[]).map((r: any, idx: number) => ({
        id: `relation_${Date.now()}_${idx}`,
        source: r.source,
        target: r.target,
        relation: r.relation,
        confidence: Math.min(1, Math.max(0, r.confidence || 0.5))
      }));
    }

    return [];
  } catch (error) {
    console.error("关系抽取错误:", error);
    return [];
  }
}

// ==================== Claim 抽取 ====================

/**
 * 从文本中抽取主张、观点、预测等 Claims
 */
export async function extractClaims(text: string): Promise<Claim[]> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  if (!text || text.trim().length < 10) {
    return [];
  }

  try {
    const schema = {
      type: 'object',
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '主张的文本内容' },
              type: {
                type: 'string',
                description: 'Claim 类型',
                enum: ['prediction', 'opinion', 'assertion', 'finding', 'announcement']
              },
              polarity: {
                type: 'string',
                description: '情感倾向',
                enum: ['positive', 'negative', 'neutral']
              },
              confidence: { type: 'number', description: '置信度 0-1' },
              context: { type: 'string', description: '上下文说明，如谁说的' }
            },
            required: ['text', 'type', 'polarity', 'confidence', 'context'],
            additionalProperties: false
          }
        }
      },
      required: ['claims'],
      additionalProperties: false
    };

    const prompt = `从以下文本中抽取所有重要的主张、观点、预测和发现。

文本：
"""${text.substring(0, 15000)}"""

请识别并分类以下类型的内容：
- prediction: 对未来的预测或预期
- opinion: 作者的观点、看法或评价
- assertion: 确定的声明或断言
- finding: 研究发现或数据结论
- announcement: 公告或发布信息

为每个 claim 提供：
- text: claim 的确切文本（尽可能使用原文）
- type: claim 类型
- polarity: 情感倾向 (positive/negative/neutral)
- confidence: 置信度（0-1，基于文本中表达的明确程度）
- context: 简短的上下文说明（谁说的，在什么情况下）`;

    const result = await extractWithSchema(prompt, schema);

    if (result && result.claims) {
      return (result.claims as any[]).map((c: any, idx: number) => ({
        id: `claim_${Date.now()}_${idx}`,
        text: c.text,
        type: c.type,
        polarity: c.polarity,
        confidence: Math.min(1, Math.max(0, c.confidence || 0.5)),
        sourceContext: c.context
      }));
    }

    return [];
  } catch (error) {
    console.error("Claim 抽取错误:", error);
    return [];
  }
}

// ==================== 事件抽取 ====================

/**
 * 从文本中抽取事件（时间、地点、参与方）
 */
export async function extractEvents(text: string): Promise<Event[]> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  if (!text || text.trim().length < 10) {
    return [];
  }

  try {
    const schema = {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventType: { type: 'string', description: '事件类型' },
              title: { type: 'string', description: '事件的简短标题' },
              description: { type: 'string', description: '事件的详细描述' },
              time: { type: 'string', description: '事件时间' },
              location: { type: 'string', description: '事件地点' },
              participants: {
                type: 'array',
                items: { type: 'string' },
                description: '参与该事件的实体列表'
              },
              confidence: { type: 'number', description: '置信度 0-1' }
            },
            required: ['eventType', 'title', 'description', 'time', 'location', 'participants', 'confidence'],
            additionalProperties: false
          }
        }
      },
      required: ['events'],
      additionalProperties: false
    };

    const prompt = `从以下文本中抽取所有重要的事件。

文本：
"""${text.substring(0, 15000)}"""

请识别具体发生或将要发生的事件，例如：
- 产品发布/发布会
- 投资交易/并购
- 合作签约
- 技术突破/研究发布
- 政策发布/法规变化
- 会议/活动

为每个事件提供：
- eventType: 事件类型（如 product_launch, investment, partnership, research_breakthrough）
- title: 事件标题
- description: 事件详细描述
- time: 事件时间（如果提到）
- location: 事件地点（如果提到）
- participants: 参与方列表（人物、机构等）
- confidence: 置信度（0-1）`;

    const result = await extractWithSchema(prompt, schema);

    if (result && result.events) {
      return (result.events as any[]).map((e: any, idx: number) => ({
        id: `event_${Date.now()}_${idx}`,
        type: e.eventType,
        title: e.title,
        description: e.description,
        time: e.time,
        location: e.location,
        participants: Array.isArray(e.participants) ? e.participants : [],
        confidence: Math.min(1, Math.max(0, e.confidence || 0.5))
      }));
    }

    return [];
  } catch (error) {
    console.error("事件抽取错误:", error);
    return [];
  }
}

// ==================== 综合分析 ====================

/**
 * 一次性执行所有抽取任务（实体、关系、Claims、事件）
 */
export async function analyzeText(text: string, options?: {
  includeEntities?: boolean;
  includeRelations?: boolean;
  includeClaims?: boolean;
  includeEvents?: boolean;
}): Promise<ExtractionResult> {
  const includeEntities = options?.includeEntities !== false;
  const includeRelations = options?.includeRelations !== false;
  const includeClaims = options?.includeClaims !== false;
  const includeEvents = options?.includeEvents !== false;

  const config = await getAIConfig();

  // 并行执行所有抽取
  const [entities, relations, claims, events] = await Promise.all([
    includeEntities ? extractEntities(text) : Promise.resolve([]),
    includeRelations ? extractRelations(text) : Promise.resolve([]),
    includeClaims ? extractClaims(text) : Promise.resolve([]),
    includeEvents ? extractEvents(text) : Promise.resolve([])
  ]);

  // 如果抽取了实体，重新抽取关系以获得更准确的结果
  let finalRelations = relations;
  if (includeEntities && entities.length > 0) {
    finalRelations = await extractRelations(text, entities);
  }

  return {
    entities,
    relations: finalRelations,
    claims,
    events,
    metadata: {
      textLength: text.length,
      extractedAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model || 'unknown',
    }
  };
}

// ==================== 图谱可视化格式转换 ====================

/**
 * 将抽取结果转换为图谱可视化格式（兼容前端可视化库）
 */
export function toGraphFormat(extraction: ExtractionResult): {
  nodes: Array<{ id: string; label: string; type: string; confidence: number }>;
  links: Array<{ source: string; target: string; label: string; confidence: number }>;
} {
  const nodes = extraction.entities.map(e => ({
    id: e.id,
    label: e.text,
    type: e.type,
    confidence: e.confidence
  }));

  // 为关系中的实体创建节点（如果尚未存在）
  const nodeMap = new Map(nodes.map(n => [n.label.toLowerCase(), n.id]));
  const links: Array<{ source: string; target: string; label: string; confidence: number }> = [];

  for (const rel of extraction.relations) {
    // 查找或创建源节点
    let sourceId = nodeMap.get(rel.source.toLowerCase());
    if (!sourceId) {
      sourceId = `node_${rel.source.toLowerCase().replace(/\s+/g, '_')}`;
      nodes.push({
        id: sourceId,
        label: rel.source,
        type: 'other' as const,
        confidence: rel.confidence
      });
      nodeMap.set(rel.source.toLowerCase(), sourceId);
    }

    // 查找或创建目标节点
    let targetId = nodeMap.get(rel.target.toLowerCase());
    if (!targetId) {
      targetId = `node_${rel.target.toLowerCase().replace(/\s+/g, '_')}`;
      nodes.push({
        id: targetId,
        label: rel.target,
        type: 'other' as const,
        confidence: rel.confidence
      });
      nodeMap.set(rel.target.toLowerCase(), targetId);
    }

    links.push({
      source: sourceId,
      target: targetId,
      label: rel.relation,
      confidence: rel.confidence
    });
  }

  return { nodes, links };
}
