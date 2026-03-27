/**
 * 报告服务
 * 基于已采集的文档生成分析报告
 */

import { callAI, getAIConfig } from './aiService.js';

export interface ReportInput {
  topicId: string;
  topicName: string;
  timeRange?: {
    start: string;
    end: string;
  };
  documents: Array<{
    id: string;
    title: string;
    source: string;
    published_date: string;
    content?: string;
  }>;
}

export interface GeneratedReport {
  topicId: string;
  topicName: string;
  type: 'weekly' | 'special';
  title: string;
  summary: string;
  keyFindings: string[];
  documentSummary: {
    total: number;
    byType: Record<string, number>;
    dateRange: string;
  };
  generatedAt: string;
}

/**
 * 生成主题周报
 */
export async function generateWeeklyReport(input: ReportInput): Promise<GeneratedReport> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  const { topicName, documents, timeRange } = input;

  // 构建文档摘要
  const docSummary = documents.map(doc =>
    `- ${doc.title} (${doc.source}, ${doc.published_date})`
  ).join('\n');

  const prompt = `请为主题"${topicName}"生成一份技术情报周报。

${timeRange ? `时间范围: ${timeRange.start} 至 ${timeRange.end}` : ''}

本次采集到 ${documents.length} 篇文档：

${docSummary}

请生成一份结构化的周报，包含以下内容：

1. **本周概要**: 用2-3句话概括本周最重要的进展
2. **关键发现**: 列出3-5条最重要的技术突破或行业动态
3. **数据统计**: 总结文档数量、类型分布等

请用中文回复，格式为 JSON：
{
  "summary": "本周概要",
  "keyFindings": ["发现1", "发现2", ...],
  "trends": "趋势分析（可选）"
}`;

  try {
    const result = await callAI(prompt, '你是一个专业的技术分析师，擅长从技术文档中提取关键信息并生成结构化的分析报告。请始终以 JSON 格式回复。');

    // 尝试解析 JSON
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      // 如果不是纯 JSON，尝试提取 JSON 部分
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // 如果完全无法解析，使用默认结构
        parsed = {
          summary: result.substring(0, 500),
          keyFindings: ["详见原文"],
          trends: ""
        };
      }
    }

    // 统计文档类型
    const byType: Record<string, number> = {};
    documents.forEach(doc => {
      // content is string, parse it as JSON metadata
      let metadata = {};
      if (doc.content) {
        try {
          metadata = JSON.parse(doc.content);
        } catch {
          // ignore parse errors
        }
      }
      // also check metadata field if available
      const docMetadata = (doc as any).metadata || metadata;
      const type = (docMetadata as any)?.type || '其他';
      byType[type] = (byType[type] || 0) + 1;
    });

    // 计算日期范围
    const dates = documents
      .map(d => d.published_date)
      .filter(Boolean)
      .sort();
    const dateRange = dates.length > 0
      ? `${dates[0]} ~ ${dates[dates.length - 1]}`
      : '未知';

    return {
      topicId: input.topicId,
      topicName: input.topicName,
      type: 'weekly',
      title: `${topicName} - 技术情报周报`,
      summary: parsed.summary || '',
      keyFindings: parsed.keyFindings || [],
      documentSummary: {
        total: documents.length,
        byType,
        dateRange
      },
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('生成周报失败:', error);
    throw error;
  }
}

/**
 * 保存报告到数据库
 */
export async function saveReport(report: GeneratedReport & { topicId: string }): Promise<void> {
  const response = await fetch('http://localhost:3000/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report)
  });

  if (!response.ok) {
    throw new Error('Failed to save report');
  }
}

/**
 * 获取主题的所有报告
 */
export async function fetchReports(topicId?: string): Promise<any[]> {
  const url = topicId
    ? `http://localhost:3000/api/reports?topicId=${topicId}`
    : 'http://localhost:3000/api/reports';

  const response = await fetch(url);
  if (!response.ok) {
    // 如果 API 还未实现，返回空数组
    if (response.status === 404) return [];
    throw new Error('Failed to fetch reports');
  }
  return response.json();
}

/**
 * 获取单个报告
 */
export async function fetchReport(id: string): Promise<any> {
  const response = await fetch(`http://localhost:3000/api/reports/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch report');
  }
  return response.json();
}
