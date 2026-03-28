/**
 * 统一的 AI 服务抽象层
 * 支持 OpenAI、Gemini 和自定义兼容 OpenAI API 的服务
 */

import fs from 'fs';
import path from 'path';

// AI 提供商类型
export type AIProvider = 'openai' | 'gemini' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

// 获取当前 AI 配置
let currentConfig: AIConfig | null = null;

export async function getAIConfig(): Promise<AIConfig> {
  // 从配置文件读取（每次都重新读取以获取最新配置）
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      const provider = config.aiProvider || 'openai';
      const apiKey = getConfigKey(config, provider);
      const baseUrl = getConfigBaseUrl(config, provider);
      const model = getConfigModel(config, provider);

      if (apiKey) {
        currentConfig = {
          provider,
          apiKey,
          baseUrl,
          model,
        };

        // 同时设置环境变量供 OpenAI SDK 使用
        process.env.OPENAI_API_KEY = apiKey;
        if (baseUrl) {
          process.env.OPENAI_BASE_URL = baseUrl;
        }

        return currentConfig;
      }
    }
  } catch (error) {
    console.error('Failed to read config file:', error);
  }

  // 优先从环境变量获取
  if (process.env.OPENAI_API_KEY) {
    currentConfig = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    };
    return currentConfig;
  }

  if (process.env.GEMINI_API_KEY) {
    currentConfig = {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: process.env.GEMINI_BASE_URL,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview',
    };
    return currentConfig;
  }

  // 返回空配置
  return {
    provider: 'openai',
    apiKey: '',
    baseUrl: undefined,
    model: 'gpt-4o',
  };
}

function getConfigKey(config: any, provider: AIProvider): string {
  switch (provider) {
    case 'openai': return config.openaiApiKey || '';
    case 'gemini': return config.geminiApiKey || '';
    case 'custom': return config.customApiKey || '';
    default: return '';
  }
}

function getConfigBaseUrl(config: any, provider: AIProvider): string | undefined {
  switch (provider) {
    case 'openai': return config.openaiBaseUrl;
    case 'gemini': return config.geminiBaseUrl;
    case 'custom': return config.customBaseUrl;
    default: return undefined;
  }
}

function getConfigModel(config: any, provider: AIProvider): string | undefined {
  switch (provider) {
    case 'openai': return config.openaiModel;
    case 'gemini': return config.geminiModel;
    case 'custom': return config.customModel;
    default: return undefined;
  }
}

/**
 * 重置配置缓存（用于配置更新后）
 */
export function resetAIConfig() {
  currentConfig = null;
}

/**
 * 调用 AI 模型进行文本生成
 */
export async function callAI(prompt: string, systemPrompt?: string, options?: {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}): Promise<string> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  try {
    if (config.provider === 'openai' || config.provider === 'custom') {
      return await callOpenAI(config, prompt, systemPrompt, options);
    } else if (config.provider === 'gemini') {
      return await callGemini(config, prompt, systemPrompt, options);
    } else {
      throw new Error(`不支持的提供商: ${config.provider}`);
    }
  } catch (error) {
    console.error("AI 调用失败:", error);
    throw error;
  }
}

/**
 * 调用 OpenAI 兼容接口
 */
async function callOpenAI(
  config: AIConfig,
  prompt: string,
  systemPrompt?: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' | 'text' };
  }
): Promise<string> {
  const OpenAI = await import('openai');

  const client = new OpenAI.OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://api.openai.com/v1',
  });

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await client.chat.completions.create({
    model: config.model || 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4000,
    response_format: options?.responseFormat,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * 调用 Gemini API
 */
async function callGemini(
  config: AIConfig,
  prompt: string,
  systemPrompt?: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' | 'text' };
  }
): Promise<string> {
  const { GoogleGenAI, Type } = await import('@google/genai');

  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const response = await ai.models.generateContent({
    model: config.model || 'gemini-2.5-flash-preview',
    contents: fullPrompt,
    config: {
      responseMimeType: options?.responseFormat?.type === 'json_object'
        ? 'application/json'
        : 'text/plain',
      temperature: options?.temperature ?? 0.7,
    },
  });

  return response.text || '';
}

/**
 * 结构化抽取 - 使用 JSON Schema
 */
export interface ExtractionSchema {
  type: string;
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: any;
  }>;
  required?: string[];
  [key: string]: any;
}

export async function extractWithSchema(
  prompt: string,
  schema: ExtractionSchema
): Promise<any> {
  const config = await getAIConfig();

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请先在「设置」页面配置 AI 服务。");
  }

  try {
    if (config.provider === 'openai' || config.provider === 'custom') {
      // OpenAI 使用 JSON Schema
      const OpenAI = await import('openai');
      const client = new OpenAI.OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.openai.com/v1',
      });

      const response = await client.chat.completions.create({
        model: config.model || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extraction',
            strict: true,
            schema: schema,
          },
        },
        temperature: 0.2,
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } else if (config.provider === 'gemini') {
      // Gemini 使用原生 Schema 方式
      const { GoogleGenAI, Type } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: config.apiKey });

      // 转换 Schema 为 Gemini 格式
      const geminiSchema = convertToGeminiSchema(schema);

      const response = await ai.models.generateContent({
        model: config.model || 'gemini-2.5-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: geminiSchema,
        },
      });

      return JSON.parse(response.text || '{}');
    }
  } catch (error: any) {
    console.error("结构化抽取失败:", error);
    throw error;
  }
}

/**
 * 转换通用 Schema 为 Gemini 格式
 */
function convertToGeminiSchema(schema: ExtractionSchema): any {
  const { Type } = require('@google/genai');

  const convertProperty = (prop: any) => {
    const converted: any = {
      type: prop.type === 'array' ? Type.ARRAY : prop.type.toUpperCase(),
    };

    if (prop.description) {
      converted.description = prop.description;
    }

    if (prop.enum) {
      converted.enum = prop.enum;
    }

    if (prop.items) {
      converted.items = convertProperty(prop.items);
    }

    return converted;
  };

  const properties: any = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    properties[key] = convertProperty(value);
  }

  return {
    type: Type.OBJECT,
    properties,
    required: schema.required || [],
  };
}
