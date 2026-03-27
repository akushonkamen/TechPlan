/**
 * Entity Resolution Service - 实体消歧服务
 *
 * 职责：
 * - 别名归一：将同一实体的不同别名/缩写/翻译归一
 * - 同名消歧：区分同名不同实体
 * - 机构归并：将子机构、部门、关联公司归并到主机构
 * - 主题映射：将抽取的实体关联到正确的技术主题
 */

import { callAI } from './aiService.js';

// ============ 类型定义 ============

export interface Entity {
  id: string;
  text: string;
  type: string;
  confidence: number;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

// 兼容 extractionService 的 Entity 类型（使用小写类型名）
export type ExtractionEntity = {
  id: string;
  text: string;
  type: 'person' | 'organization' | 'technology' | 'product' | 'location' | 'event' | 'other';
  confidence: number;
  metadata?: Record<string, unknown>;
} & Entity;

export interface ResolvedEntity extends Entity {
  canonicalId: string;
  canonicalName: string;
  aliases: string[];
  sameAs?: string[];
  disambiguated?: boolean;
  parentId?: string; // 用于机构归并，指向主机构ID
  topicIds?: string[]; // 关联的主题ID列表
}

export interface ResolutionConfig {
  enableAliasNormalization: boolean;
  enableSameNameDisambiguation: boolean;
  enableOrgMerge: boolean;
  confidenceThreshold: number;
}

export interface AliasMapping {
  [key: string]: string; // alias -> canonicalName
}

export interface DisambiguationContext {
  documentType?: string;
  domain?: string;
  topicId?: string;
  coOccurringEntities?: string[];
}

export interface ResolutionResult {
  entities: ResolvedEntity[];
  statistics: {
    total: number;
    normalized: number;
    disambiguated: number;
    merged: number;
    unresolved: number;
  };
}

// ============ 常量配置 ============

const DEFAULT_CONFIG: ResolutionConfig = {
  enableAliasNormalization: true,
  enableSameNameDisambiguation: true,
  enableOrgMerge: true,
  confidenceThreshold: 0.7,
};

// 常见缩写映射
const COMMON_ABBREVIATIONS: AliasMapping = {
  // AI/ML
  'AI': 'Artificial Intelligence',
  'ML': 'Machine Learning',
  'DL': 'Deep Learning',
  'NLP': 'Natural Language Processing',
  'CV': 'Computer Vision',
  'LLM': 'Large Language Model',
  'GPT': 'Generative Pre-trained Transformer',
  'RAG': 'Retrieval-Augmented Generation',
  'CNN': 'Convolutional Neural Network',
  'RNN': 'Recurrent Neural Network',
  'GAN': 'Generative Adversarial Network',

  // 技术栈
  'JS': 'JavaScript',
  'TS': 'TypeScript',
  'TF': 'TensorFlow',
  'PT': 'PyTorch',
  'API': 'Application Programming Interface',
  'CLI': 'Command Line Interface',
  'GUI': 'Graphical User Interface',
  'SDK': 'Software Development Kit',
  'IDE': 'Integrated Development Environment',
  'CI/CD': 'Continuous Integration/Continuous Deployment',

  // 云服务
  'AWS': 'Amazon Web Services',
  'GCP': 'Google Cloud Platform',
  'Azure': 'Microsoft Azure',
  'VPC': 'Virtual Private Cloud',
  'S3': 'Amazon Simple Storage Service',
  'EC2': 'Elastic Compute Cloud',
  'CDN': 'Content Delivery Network',

  // 数据库
  'DB': 'Database',
  'RDBMS': 'Relational Database Management System',
  'NoSQL': 'Not Only SQL',
  'SQL': 'Structured Query Language',

  // 公司后缀
  'co.': 'company',
  'corp.': 'corporation',
  'inc.': 'incorporated',
  'ltd.': 'limited',
  'llc': 'limited liability company',
};

// 中英文对照映射
const CHINESE_ENGLISH_MAPPING: AliasMapping = {
  // AI/ML
  '人工智能': 'Artificial Intelligence',
  '机器学习': 'Machine Learning',
  '深度学习': 'Deep Learning',
  '自然语言处理': 'Natural Language Processing',
  '计算机视觉': 'Computer Vision',
  '大语言模型': 'Large Language Model',
  '生成式预训练': 'Generative Pre-trained',
  '检索增强生成': 'Retrieval-Augmented Generation',

  // 技术术语
  '神经网络': 'Neural Network',
  '卷积神经网络': 'Convolutional Neural Network',
  '循环神经网络': 'Recurrent Neural Network',
  '生成对抗网络': 'Generative Adversarial Network',
  '强化学习': 'Reinforcement Learning',
  '监督学习': 'Supervised Learning',
  '无监督学习': 'Unsupervised Learning',

  // 云/架构
  '云计算': 'Cloud Computing',
  '微服务': 'Microservices',
  '容器化': 'Containerization',
  '服务网格': 'Service Mesh',
  '边缘计算': 'Edge Computing',
  '分布式系统': 'Distributed System',

  // 公司
  '阿里巴巴': 'Alibaba',
  '腾讯': 'Tencent',
  '百度': 'Baidu',
  '字节跳动': 'ByteDance',
  '华为': 'Huawei',
  '京东': 'JD.com',
  '美团': 'Meituan',
  '网易': 'NetEase',
  '小米': 'Xiaomi',
  '拼多多': 'Pinduoduo',
  '快手': 'Kuaishou',
  '滴滴': 'Didi',
  '蚂蚁集团': 'Ant Group',
  '商汤科技': 'SenseTime',
  '旷视科技': 'Megvii',
  '依图科技': 'Yitu',
  '云从科技': 'CloudWalk',
};

// 公司后缀变体
const COMPANY_SUFFIXES = [
  'Inc', 'Inc.', 'Incorporated',
  'Corp', 'Corp.', 'Corporation',
  'Ltd', 'Ltd.', 'Limited',
  'LLC', 'L.L.C.',
  'Co', 'Co.', 'Company',
  'GmbH', 'AG', 'SA', 'S.A.',
  'Pty', 'Pty.', 'Pty Ltd',
  'B.V.', 'NV', 'S.p.A.',
  '株式会社', '有限公司', '股份有限公司',
  '集团', '科技公司', '技术公司',
  'Tech', 'Technologies',
  'Solutions', 'Systems',
];

// 机构层级关系映射（子机构 -> 主机构）
const ORGANIZATION_HIERARCHY: Record<string, string> = {
  // Google/Alphabet
  'Google DeepMind': 'Alphabet Inc.',
  'Google Cloud': 'Alphabet Inc.',
  'Google Brain': 'Alphabet Inc.',
  'Waymo': 'Alphabet Inc.',
  'YouTube': 'Alphabet Inc.',
  'Android': 'Alphabet Inc.',
  'Google': 'Alphabet Inc.',

  // Microsoft
  'Microsoft Research': 'Microsoft Corporation',
  'Microsoft Azure': 'Microsoft Corporation',
  'LinkedIn': 'Microsoft Corporation',
  'GitHub': 'Microsoft Corporation',
  'OpenAI (Partner)': 'Microsoft Corporation',

  // Amazon
  'Amazon Web Services': 'Amazon.com, Inc.',
  'AWS': 'Amazon.com, Inc.',
  'Amazon Prime': 'Amazon.com, Inc.',
  'Amazon Alexa': 'Amazon.com, Inc.',

  // Meta
  'Facebook': 'Meta Platforms, Inc.',
  'Instagram': 'Meta Platforms, Inc.',
  'WhatsApp': 'Meta Platforms, Inc.',
  'Oculus': 'Meta Platforms, Inc.',
  'Meta AI': 'Meta Platforms, Inc.',

  // 阿里巴巴
  '阿里云': 'Alibaba Group',
  '淘宝': 'Alibaba Group',
  '天猫': 'Alibaba Group',
  '支付宝': 'Ant Group',
  '蚂蚁金服': 'Ant Group',

  // 腾讯
  '微信': 'Tencent Holdings',
  'QQ': 'Tencent Holdings',
  '腾讯云': 'Tencent Holdings',
  '腾讯游戏': 'Tencent Holdings',

  // 字节跳动
  '抖音': 'ByteDance',
  'TikTok': 'ByteDance',
  '今日头条': 'ByteDance',
  '西瓜视频': 'ByteDance',
  '飞书': 'ByteDance',
  'Lark': 'ByteDance',
};

// ============ 辅助函数 ============

/**
 * 标准化字符串：小写、去除空格和特殊字符
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fff]/g, ''); // 保留中文字符
}

/**
 * 移除公司后缀
 */
function removeCompanySuffix(name: string): string {
  let result = name;
  for (const suffix of COMPANY_SUFFIXES) {
    const regex = new RegExp(`\\s*${suffix}\\s*$`, 'i');
    result = result.replace(regex, '');
  }
  return result.trim();
}

/**
 * 应用缩写映射
 */
function applyAbbreviationMapping(name: string): string {
  const normalized = normalizeString(name);
  const upperName = name.toUpperCase();

  // 检查是否是已知的缩写
  for (const [abbr, full] of Object.entries(COMMON_ABBREVIATIONS)) {
    if (normalized === normalizeString(abbr) || upperName === abbr.toUpperCase()) {
      return full;
    }
  }

  return name;
}

/**
 * 应用中英文映射
 */
function applyChineseEnglishMapping(name: string): string {
  const trimmed = name.trim();

  // 检查是否是中文
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return CHINESE_ENGLISH_MAPPING[trimmed] || trimmed;
  }

  // 反向查找：英文 -> 中文（取最常见的中文表达）
  for (const [chinese, english] of Object.entries(CHINESE_ENGLISH_MAPPING)) {
    if (normalizeString(trimmed) === normalizeString(english)) {
      return chinese; // 返回中文作为标准名称
    }
  }

  return trimmed;
}

/**
 * 计算字符串相似度（Levenshtein距离）
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1;

  // Levenshtein距离
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = dp[len1][len2];
  return 1 - distance / maxLen;
}

/**
 * 生成标准ID
 */
function generateCanonicalId(name: string, type: string): string {
  const normalized = normalizeString(name);
  const typePrefix = type.toLowerCase().replace(/\s+/g, '_');
  const namePart = normalized.replace(/\s+/g, '-');
  return `${typePrefix}:${namePart}`;
}

// ============ 核心消歧函数 ============

/**
 * 别名归一化
 */
async function normalizeAliases(entities: Entity[]): Promise<ResolvedEntity[]> {
  const resolvedMap = new Map<string, ResolvedEntity>();

  for (const entity of entities) {
    let canonicalName = entity.text;

    // 1. 应用缩写映射
    canonicalName = applyAbbreviationMapping(canonicalName);

    // 2. 应用中英文映射
    canonicalName = applyChineseEnglishMapping(canonicalName);

    // 3. 移除公司后缀
    const normalizedType = normalizeEntityType(entity.type);
    if (normalizedType === 'ORGANIZATION' || normalizedType === 'COMPANY') {
      canonicalName = removeCompanySuffix(canonicalName);
    }

    // 4. 计算标准ID
    const canonicalId = generateCanonicalId(canonicalName, entity.type);

    // 5. 检查是否已有相似实体
    let merged = false;
    for (const [existingId, existingEntity] of Array.from(resolvedMap.entries())) {
      if (existingEntity.type === entity.type) {
        const similarity = calculateSimilarity(canonicalName, existingEntity.canonicalName);
        if (similarity > 0.85) {
          // 合并到现有实体
          existingEntity.aliases.push(entity.text);
          if (entity.aliases) {
            existingEntity.aliases.push(...entity.aliases);
          }
          existingEntity.sameAs = existingEntity.sameAs || [];
          existingEntity.sameAs.push(entity.id);
          existingEntity.confidence = Math.max(existingEntity.confidence, entity.confidence);
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      resolvedMap.set(canonicalId, {
        ...entity,
        canonicalId,
        canonicalName,
        aliases: [entity.text, ...(entity.aliases || [])],
        disambiguated: false,
      });
    }
  }

  return Array.from(resolvedMap.values());
}

/**
 * 使用 AI 进行同名消歧
 */
async function disambiguateWithAI(
  entity: Entity,
  candidates: ResolvedEntity[],
  context: DisambiguationContext
): Promise<ResolvedEntity | null> {
  const prompt = `我需要判断一个实体是否与已有实体相同。

当前实体：
- 名称：${entity.text}
- 类型：${entity.type}
- 置信度：${entity.confidence}

已有候选实体：
${candidates.map((c, i) => `- 候选${i + 1}：${c.canonicalName}（类型：${c.type}）`).join('\n')}

上下文信息：
${context.documentType ? `- 文档类型：${context.documentType}` : ''}
${context.domain ? `- 领域：${context.domain}` : ''}
${context.topicId ? `- 主题ID：${context.topicId}` : ''}

请判断当前实体是否与某个候选实体相同。如果相同，返回候选编号（1-${candidates.length}）；如果不同，返回"新实体"。

只返回数字或"新实体"，不要解释。`;

  try {
    const response = await callAI(prompt, undefined, { temperature: 0.1 });
    const result = response.trim();

    if (result === '新实体' || result === 'new') {
      return null;
    }

    const match = result.match(/(\d+)/);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < candidates.length) {
        return candidates[index];
      }
    }
  } catch (error) {
    console.warn('AI消歧失败，回退到规则匹配:', error);
  }

  return null;
}

/**
 * 同名消歧
 */
async function disambiguateSameName(
  entities: Entity[],
  context: DisambiguationContext
): Promise<ResolvedEntity[]> {
  // 先按名称分组
  const nameGroups = new Map<string, Entity[]>();

  for (const entity of entities) {
    const normalized = normalizeString(entity.text);
    if (!nameGroups.has(normalized)) {
      nameGroups.set(normalized, []);
    }
    nameGroups.get(normalized)!.push(entity);
  }

  const results: ResolvedEntity[] = [];

  // 对每组同名实体进行消歧
  for (const [normalizedName, group] of Array.from(nameGroups.entries())) {
    if (group.length === 1) {
      // 只有一个实体，不需要消歧
      const entity = group[0];
      results.push({
        ...entity,
        canonicalId: generateCanonicalId(entity.text, entity.type),
        canonicalName: entity.text,
        aliases: [entity.text, ...(entity.aliases || [])],
        disambiguated: false,
      });
    } else {
      // 多个同名实体，需要消歧
      const candidates: ResolvedEntity[] = [];
      const newEntities: Entity[] = [];

      for (const entity of group) {
        const canonicalName = entity.text;
        const resolved: ResolvedEntity = {
          ...entity,
          canonicalId: generateCanonicalId(canonicalName, entity.type),
          canonicalName,
          aliases: [entity.text, ...(entity.aliases || [])],
          disambiguated: true,
        };

        // 检查类型是否不同
        const typeMatch = candidates.find((c) => c.type === entity.type);
        if (typeMatch) {
          // 类型相同，可能是同一实体，需要进一步判断
          const existing = candidates.find(
            (c) => calculateSimilarity(c.canonicalName, canonicalName) > 0.95
          );
          if (existing) {
            existing.aliases.push(...(entity.aliases || []));
            existing.sameAs = existing.sameAs || [];
            existing.sameAs.push(entity.id);
          } else {
            // 使用 AI 判断
            const aiResult = await disambiguateWithAI(entity, candidates, context);
            if (aiResult) {
              aiResult.aliases.push(...(entity.aliases || []));
              aiResult.sameAs = aiResult.sameAs || [];
              aiResult.sameAs.push(entity.id);
            } else {
              candidates.push(resolved);
            }
          }
        } else {
          // 类型不同，肯定是不同实体
          candidates.push(resolved);
        }
      }

      results.push(...candidates);
    }
  }

  return results;
}

/**
 * 机构归并
 */
async function mergeOrganizations(entities: Entity[]): Promise<ResolvedEntity[]> {
  const resolved: ResolvedEntity[] = [];
  const processedIds = new Set<string>();

  for (const entity of entities) {
    if (processedIds.has(entity.id)) {
      continue;
    }

    const entityName = entity.text.trim();
    let parentOrg: string | undefined;

    // 查找是否是某个主机构的子机构
    for (const [subOrg, mainOrg] of Object.entries(ORGANIZATION_HIERARCHY)) {
      if (normalizeString(entityName) === normalizeString(subOrg)) {
        parentOrg = mainOrg;
        break;
      }
    }

    const canonicalName = parentOrg || entityName;
    const canonicalId = generateCanonicalId(canonicalName, entity.type);

    const resolvedEntity: ResolvedEntity = {
      ...entity,
      canonicalId,
      canonicalName,
      aliases: [entity.text, ...(entity.aliases || [])],
      disambiguated: !!parentOrg,
      parentId: parentOrg ? generateCanonicalId(parentOrg, entity.type) : undefined,
    };

    // 如果有父机构，添加 sameAs 关系
    if (parentOrg) {
      resolvedEntity.sameAs = [generateCanonicalId(parentOrg, entity.type)];
    }

    resolved.push(resolvedEntity);
    processedIds.add(entity.id);
  }

  // 二次归并：将指向同一主机构的实体进行合并
  const mergedMap = new Map<string, ResolvedEntity>();

  for (const entity of resolved) {
    const key = entity.canonicalId;

    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!;
      existing.aliases.push(...entity.aliases);
      if (entity.sameAs) {
        existing.sameAs = existing.sameAs || [];
        existing.sameAs.push(...entity.sameAs);
      }
    } else {
      mergedMap.set(key, entity);
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * 主题映射
 */
async function mapToTopics(
  entities: ResolvedEntity[],
  context: DisambiguationContext
): Promise<Map<string, string[]>> {
  const topicMap = new Map<string, string[]>();

  // 基于实体类型进行初步主题映射（使用规范化类型）
  const typeTopicMapping: Record<string, string[]> = {
    'TECHNOLOGY': ['技术', '研发'],
    'PRODUCT': ['产品', '业务'],
    'COMPANY': ['公司', '行业'],
    'ORGANIZATION': ['组织', '机构'],
    'PERSON': ['人物', '专家'],
    'LOCATION': ['地点', '区域'],
    'EVENT': ['事件', '活动'],
    'CONCEPT': ['概念', '理论'],
    'TOOL': ['工具', '软件'],
    'FRAMEWORK': ['框架', '库'],
    'LANGUAGE': ['编程语言'],
    'PLATFORM': ['平台', '基础设施'],
    'OTHER': ['其他'],
  };

  for (const entity of entities) {
    const normalizedType = normalizeEntityType(entity.type);
    const suggestedTopics = typeTopicMapping[normalizedType] || typeTopicMapping['OTHER'] || [];

    // 如果提供了主题上下文，优先使用
    if (context.topicId) {
      topicMap.set(entity.canonicalId, [context.topicId]);
    } else {
      topicMap.set(entity.canonicalId, suggestedTopics);
    }
  }

  return topicMap;
}

// ============ 主入口函数 ============

/**
 * 规范化实体类型（小写转大写，兼容 extractionService）
 */
function normalizeEntityType(type: string): string {
  const typeMapping: Record<string, string> = {
    'person': 'PERSON',
    'organization': 'ORGANIZATION',
    'technology': 'TECHNOLOGY',
    'product': 'PRODUCT',
    'location': 'LOCATION',
    'event': 'EVENT',
    'other': 'OTHER',
    'company': 'COMPANY',
  };
  return typeMapping[type.toLowerCase()] || type.toUpperCase();
}

/**
 * 综合实体消歧
 */
export async function resolveEntities(
  entities: Entity[],
  config: Partial<ResolutionConfig> = {},
  context: DisambiguationContext = {}
): Promise<ResolutionResult> {
  // 规范化实体类型
  const normalizedEntities = entities.map(e => ({
    ...e,
    type: normalizeEntityType(e.type),
  }));
  const fullConfig: ResolutionConfig = { ...DEFAULT_CONFIG, ...config };

  let workingEntities: ResolvedEntity[] = [];
  let normalizedCount = 0;
  let disambiguatedCount = 0;
  let mergedCount = 0;

  // 1. 别名归一
  if (fullConfig.enableAliasNormalization) {
    const normalized = await normalizeAliases(normalizedEntities);
    normalizedCount = normalizedEntities.length - normalized.length;
    workingEntities = normalized;
  } else {
    // 如果不启用别名归一，初始化为基本的 ResolvedEntity
    workingEntities = normalizedEntities.map(e => ({
      ...e,
      canonicalId: generateCanonicalId(e.text, e.type),
      canonicalName: e.text,
      aliases: [e.text, ...(e.aliases || [])],
      disambiguated: false,
    }));
  }

  // 2. 同名消歧
  if (fullConfig.enableSameNameDisambiguation) {
    const disambiguated = await disambiguateSameName(workingEntities, context);
    disambiguatedCount = disambiguated.filter((e) => e.disambiguated).length;
    workingEntities = disambiguated;
  }

  // 3. 机构归并
  if (fullConfig.enableOrgMerge) {
    const orgEntities = workingEntities.filter(
      (e) => e.type === 'ORGANIZATION' || e.type === 'COMPANY' || e.type === 'organization' || e.type === 'company'
    );
    const nonOrgEntities = workingEntities.filter(
      (e) => e.type !== 'ORGANIZATION' && e.type !== 'COMPANY' && e.type !== 'organization' && e.type !== 'company'
    );

    if (orgEntities.length > 0) {
      const merged = await mergeOrganizations(orgEntities);
      mergedCount = orgEntities.length - merged.length;
      workingEntities = [...nonOrgEntities, ...merged];
    }
  }

  // 4. 主题映射
  const topicMap = await mapToTopics(workingEntities, context);
  workingEntities = workingEntities.map(entity => ({
    ...entity,
    topicIds: topicMap.get(entity.canonicalId) || [],
  }));

  // 5. 过滤低置信度实体
  const filtered = workingEntities.filter(
    (e) => e.confidence >= fullConfig.confidenceThreshold
  );

  return {
    entities: filtered,
    statistics: {
      total: entities.length,
      normalized: normalizedCount,
      disambiguated: disambiguatedCount,
      merged: mergedCount,
      unresolved: entities.length - filtered.length,
    },
  };
}

/**
 * 单独的别名归一化接口
 */
export async function normalizeEntityAliases(
  entities: Entity[]
): Promise<ResolvedEntity[]> {
  return normalizeAliases(entities);
}

/**
 * 单独的同名消歧接口
 */
export async function disambiguateEntities(
  entities: Entity[],
  context: DisambiguationContext = {}
): Promise<ResolvedEntity[]> {
  return disambiguateSameName(entities, context);
}

/**
 * 单独的机构归并接口
 */
export async function mergeEntityOrganizations(
  entities: Entity[]
): Promise<ResolvedEntity[]> {
  return mergeOrganizations(entities);
}

/**
 * 实体相似度计算
 */
export function calculateEntitySimilarity(
  entity1: Entity | ResolvedEntity,
  entity2: Entity | ResolvedEntity
): number {
  // 类型不同直接返回低相似度
  if (entity1.type !== entity2.type) {
    return 0.3;
  }

  const nameSimilarity = calculateSimilarity(entity1.text, entity2.text);

  // 考虑别名
  let aliasSimilarity = 0;
  if (entity1.aliases && entity2.aliases) {
    for (const alias1 of entity1.aliases) {
      for (const alias2 of entity2.aliases) {
        aliasSimilarity = Math.max(aliasSimilarity, calculateSimilarity(alias1, alias2));
      }
    }
  }

  return Math.max(nameSimilarity, aliasSimilarity);
}

/**
 * 更新消歧配置
 */
export function updateAliasMapping(
  category: 'abbreviation' | 'chinese' | 'organization',
  mappings: AliasMapping
): void {
  switch (category) {
    case 'abbreviation':
      Object.assign(COMMON_ABBREVIATIONS, mappings);
      break;
    case 'chinese':
      Object.assign(CHINESE_ENGLISH_MAPPING, mappings);
      break;
    case 'organization':
      Object.assign(ORGANIZATION_HIERARCHY, mappings);
      break;
  }
}

/**
 * 获取当前映射规则
 */
export function getAliasMappings(): {
  abbreviations: AliasMapping;
  chinese: AliasMapping;
  organizations: Record<string, string>;
} {
  return {
    abbreviations: { ...COMMON_ABBREVIATIONS },
    chinese: { ...CHINESE_ENGLISH_MAPPING },
    organizations: { ...ORGANIZATION_HIERARCHY },
  };
}

/**
 * 与 extractionService 集成：处理抽取结果中的实体
 * 接收 extractionService.Entity 类型，返回消歧后的实体
 */
export async function resolveExtractedEntities(
  entities: Array<{
    id: string;
    text: string;
    type: 'person' | 'organization' | 'technology' | 'product' | 'location' | 'event' | 'other';
    confidence: number;
    metadata?: Record<string, unknown>;
  }>,
  config?: Partial<ResolutionConfig>,
  context?: DisambiguationContext
): Promise<ResolutionResult> {
  // 转换为内部 Entity 格式
  const internalEntities: Entity[] = entities.map(e => ({
    ...e,
    type: normalizeEntityType(e.type),
  }));

  return resolveEntities(internalEntities, config, context);
}

/**
 * 批量处理文档的实体消歧（用于数据采集管道）
 */
export async function resolveDocumentEntities(
  documents: Array<{
    id: string;
    text: string;
    entities?: Entity[];
    documentType?: string;
    domain?: string;
  }>,
  config?: Partial<ResolutionConfig>
): Promise<Array<{
  documentId: string;
  resolved: ResolutionResult;
}>> {
  const results = await Promise.all(
    documents.map(async (doc) => {
      const context: DisambiguationContext = {
        documentType: doc.documentType,
        domain: doc.domain,
      };

      const entities = doc.entities || [];
      const resolved = await resolveEntities(entities, config, context);

      return {
        documentId: doc.id,
        resolved,
      };
    })
  );

  return results;
}
