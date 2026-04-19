/**
 * AI Agent 服务 - 实时技术情报检索
 * 支持多种 AI 提供商（OpenAI、Gemini、自定义）
 */

import { getAIConfig } from './aiService.js';

export interface FetchedDocument {
  title: string;
  source: string;
  type: '新闻' | '论文' | '标准' | '内部文档';
  date: string;
  url: string;
}

/**
 * 真正的 Agentic 检索：利用 AI + 搜索工具实时获取最新技术情报
 */
export async function fetchRealTimeTechNews(topic: string): Promise<FetchedDocument[]> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  try {
    if (config.provider === 'openai' || config.provider === 'custom') {
      return await fetchWithOpenAI(config, topic);
    } else if (config.provider === 'gemini') {
      return await fetchWithGemini(config, topic);
    } else {
      return [];
    }
  } catch (error) {
    console.error(`Agent 检索主题 [${topic}] 时发生错误:`, error);
    return [];
  }
}

/**
 * 使用 OpenAI 兼容接口进行检索
 */
async function fetchWithOpenAI(config: any, topic: string): Promise<FetchedDocument[]> {
  const OpenAI = await import('openai');

  const client = new OpenAI.OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
  });

  const response = await client.chat.completions.create({
    model: config.model || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `你是一个技术情报搜集助手。请搜索关于指定主题的最新新闻、突破或研究论文。
返回 3 个高度相关的结果，格式为 JSON 数组。`
      },
      {
        role: 'user',
        content: `Search for the latest news, breakthroughs, or research papers about "${topic}" from the last 7 days. Return 3 highly relevant results.

Please respond with a JSON array of objects with these exact fields:
- title: 文章或论文的标题
- source: 发布来源，例如 arXiv, TechCrunch, Nature 等
- type: 必须是 '新闻' 或 '论文'
- date: 发布日期，格式 YYYY-MM-DD
- url: 文章的真实 URL 链接

Only return the JSON array, no additional text.`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  // 如果返回的是单个对象包裹数组，提取数组
  const results = Array.isArray(parsed) ? parsed : (parsed.results || parsed);

  return results.slice(0, 3).map((doc: any) => ({
    title: doc.title || '',
    source: doc.source || '',
    type: doc.type || '论文',
    date: doc.date || new Date().toISOString().split('T')[0],
    url: doc.url || '#',
  }));
}

/**
 * 使用 Gemini API 进行检索
 */
async function fetchWithGemini(config: any, topic: string): Promise<FetchedDocument[]> {
  const { GoogleGenAI, Type } = await import('@google/genai');

  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const response = await ai.models.generateContent({
    model: config.model || 'gemini-2.5-flash-preview',
    contents: `Search the web for the latest news, breakthroughs, or research papers about "${topic}" from the last 7 days. Return 3 highly relevant results.`,
    config: {
      // 开启 Google Search 联网工具
      tools: [{ googleSearch: {} }],
      // 强制输出 JSON 结构化数据
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "文章或论文的标题" },
            source: { type: Type.STRING, description: "发布来源" },
            type: { type: Type.STRING, description: "必须是 '新闻' 或 '论文'" },
            date: { type: Type.STRING, description: "发布日期" },
            url: { type: Type.STRING, description: "URL" }
          },
          required: ["title", "source", "type", "date", "url"]
        }
      }
    }
  });

  if (response.text) {
    const data = JSON.parse(response.text) as FetchedDocument[];
    return data.slice(0, 3);
  }

  return [];
}
