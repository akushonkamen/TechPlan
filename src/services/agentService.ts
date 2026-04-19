import { GoogleGenAI, Type } from '@google/genai';

// 初始化 Gemini API 客户端
// 这里的 API Key 由 AI Studio 平台在运行时自动注入
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export interface FetchedDocument {
  title: string;
  source: string;
  type: '新闻' | '论文' | '标准' | '内部文档';
  date: string;
  url: string;
}

/**
 * 真正的 Agentic 检索：利用 Gemini + Google Search 实时获取最新技术情报
 */
export async function fetchRealTimeTechNews(topic: string): Promise<FetchedDocument[]> {
  if (!apiKey) {
    console.warn("未检测到 GEMINI_API_KEY，无法执行真实网络检索。");
    return [];
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
              source: { type: Type.STRING, description: "发布来源，例如 arXiv, TechCrunch, Nature 等" },
              type: { type: Type.STRING, description: "必须是 '新闻' 或 '论文'" },
              date: { type: Type.STRING, description: "发布日期，格式 YYYY-MM-DD" },
              url: { type: Type.STRING, description: "文章的真实 URL 链接" }
            },
            required: ["title", "source", "type", "date", "url"]
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as FetchedDocument[];
      return data;
    }
    return [];
  } catch (error) {
    console.error(`Agent 检索主题 [${topic}] 时发生错误:`, error);
    return [];
  }
}
