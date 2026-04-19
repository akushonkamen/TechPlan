/**
 * 推理编排服务 (Reasoning Orchestrator)
 * 实现技术规划工作流驱动的多阶段推理链
 *
 * 设计稿参考：6.5 推理与评估能力
 */

import { callAI, getAIConfig } from './aiService.js';
import type {
  Topic,
  DbDocument,
  Recommendation,
  AnalysisRequest,
  AnalysisResult,
} from '../types.js';

// ==================== 类型定义 ====================

/**
 * 评分卡维度
 * 技术方向评估的关键指标
 */
export interface ScoringCard {
  topicId: string;
  topicName: string;
  direction: string; // 技术方向名称
  scores: {
    maturity: number; // 技术成熟度 0-100
    academicInterest: number; // 学术热度 0-100
    industryAdoption: number; // 产业化速度 0-100
    competition: number; // 竞争拥挤度 0-100 (越高越拥挤)
    ecosystemDependency: number; // 生态依赖度 0-100
    capabilityMatch: number; // 企业能力匹配度 0-100
    standardizationWindow: number; // 标准化窗口 0-100
    policyRisk: number; // 政策风险 0-100 (越高风险越大)
    roiPotential: number; // 投入产出潜力 0-100
    timing: number; // 建议进入时机 0-100
  };
  overallScore: number; // 综合评分 0-100
  recommendation: RecommendationType;
  rationale: string; // 决策理由
  evidence: string[]; // 支持证据
  confidence: number; // 推理置信度
  lastUpdated: string;
}

/**
 * 建议类型
 * 设计稿：输出建议类型
 */
export type RecommendationType =
  | 'continuous_tracking' // 持续跟踪
  | 'small_pilot' // 小规模试点
  | 'heavy_investment' // 重点投入
  | 'joint_development' // 联合布局
  | 'risk_avoidance'; // 规避风险

/**
 * 工作流阶段状态
 */
export interface WorkflowStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

/**
 * 工作流执行状态
 */
export interface WorkflowExecution {
  id: string;
  topicId: string;
  type: 'analysis' | 'decision_support' | 'trend_analysis';
  stages: WorkflowStage[];
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: AnalysisResult;
}

/**
 * 证据包
 * 召集的相关证据集合
 */
export interface EvidencePackage {
  documents: Array<{
    id: string;
    title: string;
    source: string;
    date: string;
    relevance: number;
  }>;
  claims: Array<{
    text: string;
    type: string;
    polarity: string;
    confidence: number;
  }>;
  events: Array<{
    title: string;
    type: string;
    time: string;
    participants: string[];
  }>;
  metrics: Array<{
    name: string;
    value: string | number;
    category: string;
    unit?: string;
  }>;
}

/**
 * 竞争态势分析结果
 */
export interface CompetitiveLandscape {
  keyPlayers: Array<{
    name: string;
    type: 'company' | 'research' | 'organization';
    strength: string[];
    weakness?: string[];
  }>;
  marketPosition: 'early' | 'growth' | 'mature' | 'declining';
  collaborationOpportunities: string[];
  threats: string[];
}

/**
 * 风险与机会分析
 */
export interface RiskOpportunityAnalysis {
  opportunities: Array<{
    description: string;
    impact: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    timeframe?: string;
  }>;
  risks: Array<{
    description: string;
    impact: 'high' | 'medium' | 'low';
    likelihood: 'high' | 'medium' | 'low';
    mitigation?: string;
  }>;
}

// ==================== 评分卡模型 ====================

/**
 * 计算评分卡
 * 基于收集的证据计算各维度得分
 */
export async function calculateScoringCard(
  topic: Topic,
  evidence: EvidencePackage,
  timeWindow?: string
): Promise<ScoringCard> {
  const config = await getAIConfig();
  if (!config.apiKey) {
    throw new Error("未配置 API Key");
  }

  // 构建证据摘要
  const evidenceSummary = buildEvidenceSummary(evidence);

  const prompt = `你是一位技术战略分析专家。请基于以下证据，对技术方向进行评分。

**技术主题**: ${topic.name}
**主题描述**: ${topic.description || '无'}
**关注关键词**: ${topic.keywords?.join(', ') || '无'}
**关注机构**: ${topic.organizations?.join(', ') || '无'}

**收集到的证据**:
${evidenceSummary}

请对以下10个维度进行评分（0-100分）：

1. **技术成熟度** (maturity): 技术发展阶段，从概念到成熟商用
2. **学术热度** (academicInterest): 论文发布量、引用量等学术关注度
3. **产业化速度** (industryAdoption): 商业应用落地的速度和规模
4. **竞争拥挤度** (competition): 参与者数量和竞争激烈程度
5. **生态依赖度** (ecosystemDependency): 对外部生态的依赖程度
6. **企业能力匹配度** (capabilityMatch): 与企业现有能力的匹配程度
7. **标准化窗口** (standardizationWindow): 标准制定的机会窗口
8. **政策风险** (policyRisk): 政策法规带来的不确定性风险
9. **投入产出潜力** (roiPotential): 预期投资回报率
10. **进入时机** (timing): 进入该领域的最佳时机

请以JSON格式回复：
{
  "scores": {
    "maturity": 数字,
    "academicInterest": 数字,
    "industryAdoption": 数字,
    "competition": 数字,
    "ecosystemDependency": 数字,
    "capabilityMatch": 数字,
    "standardizationWindow": 数字,
    "policyRisk": 数字,
    "roiPotential": 数字,
    "timing": 数字
  },
  "overallScore": 数字,
  "recommendation": "continuous_tracking | small_pilot | heavy_investment | joint_development | risk_avoidance",
  "rationale": "详细的决策理由",
  "evidence": ["证据1", "证据2", "证据3"],
  "confidence": 数字
}`;

  try {
    const response = await callAI(
      prompt,
      '你是技术战略分析专家，专注于技术规划决策支持。请始终以JSON格式回复。',
      { temperature: 0.3, maxTokens: 2000 }
    );

    // 解析JSON
    let parsed: any;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
    } catch {
      // 解析失败，返回默认评分
      parsed = getDefaultScores(topic);
    }

    return {
      topicId: topic.id,
      topicName: topic.name,
      direction: topic.name,
      scores: parsed.scores || getDefaultScores(topic).scores,
      overallScore: parsed.overallScore || 50,
      recommendation: parsed.recommendation || 'continuous_tracking',
      rationale: parsed.rationale || '暂无详细分析',
      evidence: parsed.evidence || [],
      confidence: parsed.confidence || 0.5,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('评分卡计算失败:', error);
    return getDefaultScores(topic);
  }
}

/**
 * 获取默认评分（降级方案）
 */
function getDefaultScores(topic: Topic): ScoringCard {
  return {
    topicId: topic.id,
    topicName: topic.name,
    direction: topic.name,
    scores: {
      maturity: 50,
      academicInterest: 50,
      industryAdoption: 50,
      competition: 50,
      ecosystemDependency: 50,
      capabilityMatch: 50,
      standardizationWindow: 50,
      policyRisk: 50,
      roiPotential: 50,
      timing: 50,
    },
    overallScore: 50,
    recommendation: 'continuous_tracking',
    rationale: '数据不足，需要更多证据支持分析',
    evidence: [],
    confidence: 0.3,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 构建证据摘要
 */
function buildEvidenceSummary(evidence: EvidencePackage): string {
  const parts: string[] = [];

  if (evidence.documents.length > 0) {
    parts.push(`**文档** (${evidence.documents.length}篇):`);
    evidence.documents.slice(0, 10).forEach((doc, i) => {
      parts.push(`  ${i + 1}. ${doc.title} (${doc.source}, ${doc.date})`);
    });
  }

  if (evidence.claims.length > 0) {
    parts.push(`\n**关键主张** (${evidence.claims.length}条):`);
    evidence.claims.slice(0, 5).forEach((claim, i) => {
      parts.push(`  ${i + 1}. ${claim.text} (${claim.polarity})`);
    });
  }

  if (evidence.events.length > 0) {
    parts.push(`\n**相关事件** (${evidence.events.length}件):`);
    evidence.events.slice(0, 5).forEach((event, i) => {
      parts.push(`  ${i + 1}. ${event.title} (${event.time})`);
    });
  }

  if (evidence.metrics.length > 0) {
    parts.push(`\n**性能指标** (${evidence.metrics.length}项):`);
    evidence.metrics.slice(0, 5).forEach((metric, i) => {
      parts.push(`  ${i + 1}. ${metric.name}: ${metric.value} ${metric.unit || ''}`);
    });
  }

  return parts.join('\n') || '暂无证据数据';
}

// ==================== 工作流执行 ====================

/**
 * 执行技术规划工作流
 * 设计稿：多阶段推理链
 */
export async function executeWorkflow(
  request: AnalysisRequest,
  db: any
): Promise<WorkflowExecution> {
  const executionId = `wf_${Date.now()}`;
  const stages: WorkflowStage[] = [
    { name: 'topic_definition', status: 'pending' },
    { name: 'query_expansion', status: 'pending' },
    { name: 'evidence_retrieval', status: 'pending' },
    { name: 'evidence_rating', status: 'pending' },
    { name: 'graph_update', status: 'pending' },
    { name: 'direction_evaluation', status: 'pending' },
    { name: 'competitive_analysis', status: 'pending' },
    { name: 'risk_opportunity_analysis', status: 'pending' },
    { name: 'recommendation_generation', status: 'pending' },
    { name: 'report_output', status: 'pending' },
  ];

  const execution: WorkflowExecution = {
    id: executionId,
    topicId: request.topicId,
    type: request.type as any,
    stages,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  try {
    // 1. 主题定义
    await runStage(execution, 'topic_definition', async () => {
      const topic = await db.get('SELECT * FROM topics WHERE id = ?', [request.topicId]);
      if (!topic) throw new Error('主题不存在');
      return topic;
    });

    // 2. 查询扩展
    await runStage(execution, 'query_expansion', async () => {
      const topic = stages[0].result;
      const expandedQueries = expandQuery(topic);
      return expandedQueries;
    });

    // 3. 证据召回
    await runStage(execution, 'evidence_retrieval', async () => {
      const queries = stages[1].result;
      const evidence = await retrieveEvidence(queries, db, request.topicId);
      return evidence;
    });

    // 4. 证据评级
    await runStage(execution, 'evidence_rating', async () => {
      const evidence = stages[2].result as EvidencePackage;
      const rated = rateEvidence(evidence);
      return rated;
    });

    // 5. 图谱增量更新
    await runStage(execution, 'graph_update', async () => {
      // 这里可以调用 graphService 进行图谱更新
      return { updated: true };
    });

    // 6. 技术方向评估
    await runStage(execution, 'direction_evaluation', async () => {
      const topic = stages[0].result;
      const evidence = stages[3].result as EvidencePackage;
      const scoringCard = await calculateScoringCard(topic, evidence);
      return scoringCard;
    });

    // 7. 竞争态势分析
    await runStage(execution, 'competitive_analysis', async () => {
      const evidence = stages[3].result as EvidencePackage;
      const landscape = await analyzeCompetitiveLandscape(evidence);
      return landscape;
    });

    // 8. 风险与机会推理
    await runStage(execution, 'risk_opportunity_analysis', async () => {
      const evidence = stages[3].result as EvidencePackage;
      const scoringCard = stages[5].result as ScoringCard;
      const analysis = await analyzeRisksAndOpportunities(evidence, scoringCard);
      return analysis;
    });

    // 9. 决策建议生成
    await runStage(execution, 'recommendation_generation', async () => {
      const scoringCard = stages[5].result as ScoringCard;
      const landscape = stages[6].result as CompetitiveLandscape;
      const riskOpp = stages[7].result as RiskOpportunityAnalysis;

      const recommendations = generateRecommendations(
        scoringCard,
        landscape,
        riskOpp
      );
      return recommendations;
    });

    // 10. 报告输出
    await runStage(execution, 'report_output', async () => {
      const scoringCard = stages[5].result as ScoringCard;
      const landscape = stages[6].result;
      const riskOpp = stages[7].result;
      const recommendations = stages[8].result;

      return generateAnalysisReport(
        executionId,
        request.topicId,
        scoringCard,
        landscape,
        riskOpp,
        recommendations
      );
    });

    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();
    execution.result = stages[9].result;

  } catch (error) {
    execution.status = 'failed';
    execution.completedAt = new Date().toISOString();
    const failedStage = stages.find(s => s.status === 'failed');
    if (failedStage) {
      failedStage.error = error instanceof Error ? error.message : String(error);
    }
  }

  return execution;
}

/**
 * 运行单个工作流阶段
 */
async function runStage(
  execution: WorkflowExecution,
  stageName: string,
  fn: () => Promise<any>
): Promise<void> {
  const stage = execution.stages.find(s => s.name === stageName);
  if (!stage) throw new Error(`Stage ${stageName} not found`);

  stage.status = 'running';
  stage.startedAt = new Date().toISOString();

  try {
    stage.result = await fn();
    stage.status = 'completed';
    stage.completedAt = new Date().toISOString();
  } catch (error) {
    stage.status = 'failed';
    stage.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

// ==================== 辅助函数 ====================

/**
 * 查询扩展
 * 基于主题关键词扩展搜索查询
 */
function expandQuery(topic: Topic): string[] {
  const queries: string[] = [];

  // 基础查询
  queries.push(topic.name);

  // 关键词组合
  if (topic.keywords && topic.keywords.length > 0) {
    topic.keywords.forEach(keyword => {
      queries.push(`${topic.name} ${keyword}`);
    });
  }

  // 机构组合
  if (topic.organizations && topic.organizations.length > 0) {
    topic.organizations.forEach(org => {
      queries.push(`${topic.name} ${org}`);
    });
  }

  return queries;
}

/**
 * 证据召回
 * 从数据库和相关来源收集证据
 */
async function retrieveEvidence(
  queries: string[],
  db: any,
  topicId: string
): Promise<EvidencePackage> {
  const evidence: EvidencePackage = {
    documents: [],
    claims: [],
    events: [],
    metrics: [],
  };

  // 从数据库获取相关文档
  const docs = await db.all(
    `SELECT * FROM documents WHERE topic_id = ? OR title LIKE ? OR content LIKE ?
     ORDER BY published_date DESC LIMIT 50`,
    [topicId, `%${queries[0]}%`, `%${queries[0]}%`]
  );

  evidence.documents = docs.map((doc: any) => ({
    id: doc.id,
    title: doc.title,
    source: doc.source || 'unknown',
    date: doc.published_date || doc.collected_date,
    relevance: 0.8, // 简化处理
  }));

  // 获取相关实体（作为 Claims 的简化版本）
  const entities = await db.all(
    `SELECT * FROM entities WHERE document_id IN (
      SELECT id FROM documents WHERE topic_id = ?
    ) LIMIT 20`,
    [topicId]
  );

  evidence.claims = entities.map((e: any) => ({
    text: e.text,
    type: e.type || 'finding',
    polarity: 'neutral',
    confidence: e.confidence || 0.5,
  }));

  // 获取事件（如果存在）
  // events 可以从抽取结果中获取

  return evidence;
}

/**
 * 证据评级
 * 对收集的证据进行质量和相关性评分
 */
function rateEvidence(evidence: EvidencePackage): EvidencePackage {
  // 为每个文档计算相关性得分
  evidence.documents = evidence.documents.map(doc => ({
    ...doc,
    relevance: calculateRelevance(doc),
  }));

  return evidence;
}

/**
 * 计算文档相关性
 */
function calculateRelevance(doc: { title: string; source: string; date: string }): number {
  let score = 0.5;

  // 根据来源调整
  const trustedSources = ['arXiv', 'Nature', 'Science', 'IEEE', 'ACM'];
  if (trustedSources.some(s => doc.source.includes(s))) {
    score += 0.2;
  }

  // 根据时间调整（越新越好）
  const docDate = new Date(doc.date);
  const daysOld = (Date.now() - docDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 30) score += 0.2;
  else if (daysOld < 90) score += 0.1;

  return Math.min(1, score);
}

/**
 * 竞争态势分析
 */
async function analyzeCompetitiveLandscape(
  evidence: EvidencePackage
): Promise<CompetitiveLandscape> {
  const config = await getAIConfig();
  if (!config.apiKey) {
    return getCompetitiveAnalysisDefault();
  }

  const prompt = `基于以下证据，分析技术领域的竞争态势。

**证据摘要**:
${buildEvidenceSummary(evidence)}

请分析：
1. 关键参与者（公司、研究机构）
2. 市场发展阶段（early/growth/mature/declining）
3. 合作机会
4. 潜在威胁

请以JSON格式回复：
{
  "keyPlayers": [
    {"name": "名称", "type": "company|research|organization", "strength": ["优势1", "优势2"], "weakness": ["劣势"]}
  ],
  "marketPosition": "early|growth|mature|declining",
  "collaborationOpportunities": ["机会1", "机会2"],
  "threats": ["威胁1", "威胁2"]
}`;

  try {
    const response = await callAI(
      prompt,
      '你是竞争分析专家。',
      { temperature: 0.3, maxTokens: 1500 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('竞争分析失败:', error);
  }

  return getCompetitiveAnalysisDefault();
}

function getCompetitiveAnalysisDefault(): CompetitiveLandscape {
  return {
    keyPlayers: [],
    marketPosition: 'early',
    collaborationOpportunities: [],
    threats: [],
  };
}

/**
 * 风险与机会分析
 */
async function analyzeRisksAndOpportunities(
  evidence: EvidencePackage,
  scoringCard: ScoringCard
): Promise<RiskOpportunityAnalysis> {
  const config = await getAIConfig();
  if (!config.apiKey) {
    return getRiskOpportunityDefault();
  }

  const prompt = `基于以下证据和评分，分析风险与机会。

**评分摘要**:
- 技术成熟度: ${scoringCard.scores.maturity}
- 竞争程度: ${scoringCard.scores.competition}
- 政策风险: ${scoringCard.scores.policyRisk}
- 投入产出: ${scoringCard.scores.roiPotential}

**证据**:
${buildEvidenceSummary(evidence)}

请识别：
1. 关键机会（描述、影响、可能性、时间框架）
2. 主要风险（描述、影响、可能性、缓解措施）

请以JSON格式回复：
{
  "opportunities": [
    {"description": "描述", "impact": "high|medium|low", "likelihood": "high|medium|low", "timeframe": "时间框架"}
  ],
  "risks": [
    {"description": "描述", "impact": "high|medium|low", "likelihood": "high|medium|low", "mitigation": "缓解措施"}
  ]
}`;

  try {
    const response = await callAI(
      prompt,
      '你是风险分析专家。',
      { temperature: 0.3, maxTokens: 1500 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('风险分析失败:', error);
  }

  return getRiskOpportunityDefault();
}

function getRiskOpportunityDefault(): RiskOpportunityAnalysis {
  return {
    opportunities: [],
    risks: [],
  };
}

/**
 * 生成决策建议
 */
function generateRecommendations(
  scoringCard: ScoringCard,
  landscape: CompetitiveLandscape,
  riskOpp: RiskOpportunityAnalysis
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // 基于评分卡生成建议
  const rec: Recommendation = {
    id: `rec_${Date.now()}`,
    topicId: scoringCard.topicId,
    direction: scoringCard.direction,
    actionType: scoringCard.recommendation,
    rationale: scoringCard.rationale,
    confidence: scoringCard.confidence,
    generatedAt: new Date().toISOString(),
  };

  recommendations.push(rec);

  // 添加基于风险和机会的建议
  if (riskOpp.opportunities.length > 0) {
    riskOpp.opportunities.slice(0, 2).forEach((opp, i) => {
      if (opp.impact === 'high' && opp.likelihood === 'high') {
        recommendations.push({
          id: `rec_opp_${i}_${Date.now()}`,
          topicId: scoringCard.topicId,
          direction: scoringCard.direction,
          actionType: 'invest',
          rationale: `抓住机会: ${opp.description}`,
          confidence: 0.7,
          generatedAt: new Date().toISOString(),
        });
      }
    });
  }

  // 添加基于风险的建议
  if (riskOpp.risks.length > 0) {
    riskOpp.risks.slice(0, 2).forEach((risk, i) => {
      if (risk.impact === 'high' && risk.likelihood === 'high') {
        recommendations.push({
          id: `rec_risk_${i}_${Date.now()}`,
          topicId: scoringCard.topicId,
          direction: scoringCard.direction,
          actionType: 'avoid',
          rationale: `规避风险: ${risk.description}`,
          confidence: 0.7,
          generatedAt: new Date().toISOString(),
        });
      }
    });
  }

  return recommendations;
}

/**
 * 生成分析报告
 */
function generateAnalysisReport(
  executionId: string,
  topicId: string,
  scoringCard: ScoringCard,
  landscape: CompetitiveLandscape,
  riskOpp: RiskOpportunityAnalysis,
  recommendations: Recommendation[]
): AnalysisResult {
  return {
    id: executionId,
    topicId,
    type: 'special_analysis',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: `技术方向 "${scoringCard.direction}" 综合评分 ${scoringCard.overallScore}/100，建议${scoringCard.recommendation}。`,
    findings: [
      {
        title: '技术成熟度评估',
        description: `技术成熟度得分为 ${scoringCard.scores.maturity}/100`,
        confidence: scoringCard.confidence,
        evidence: scoringCard.evidence,
      },
      {
        title: '竞争态势',
        description: `市场处于 ${landscape.marketPosition} 阶段，关键参与者 ${landscape.keyPlayers.length} 家`,
        confidence: 0.7,
        evidence: landscape.keyPlayers.map(p => p.name),
      },
    ],
    recommendations,
    graph: {
      nodes: scoringCard.evidence.length,
      edges: landscape.keyPlayers.length,
    },
  };
}

// ==================== 导出函数 ====================

/**
 * 快速分析 - 简化版工作流
 */
export async function quickAnalysis(
  topicId: string,
  db: any
): Promise<ScoringCard> {
  const topic = await db.get('SELECT * FROM topics WHERE id = ?', [topicId]);
  if (!topic) {
    throw new Error('主题不存在');
  }

  const queries = expandQuery(topic);
  const evidence = await retrieveEvidence(queries, db, topicId);
  const rated = rateEvidence(evidence);

  return calculateScoringCard(topic, rated);
}

/**
 * 批量评估多个技术方向
 */
export async function evaluateDirections(
  directions: string[],
  db: any
): Promise<ScoringCard[]> {
  const results: ScoringCard[] = [];

  for (const direction of directions) {
    // 创建临时主题对象
    const tempTopic: Topic = {
      id: `temp_${Date.now()}`,
      name: direction,
      aliases: [],
      description: '',
      owner: 'system',
      priority: 'medium',
      scope: 'technology',
      createdAt: new Date().toISOString(),
      keywords: [direction],
      organizations: [],
      schedule: 'daily',
    };

    try {
      const queries = expandQuery(tempTopic);
      const evidence = await retrieveEvidence(queries, db, tempTopic.id);
      const scoringCard = await calculateScoringCard(tempTopic, evidence);
      results.push(scoringCard);
    } catch (error) {
      console.error(`评估方向 ${direction} 失败:`, error);
    }
  }

  return results;
}
