/**
 * 数据源采集服务
 * 支持从 arXiv、RSS 订阅源和 GDELT 采集数据
 */

import type { Topic } from '../types';

// ===== 类型定义 =====

/**
 * arXiv 论文元数据
 */
export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  arxivId: string;
  pdfUrl: string;
  categories: string[];
  source?: string;
  url?: string;
  date?: string;
  metadata?: Record<string, any>;
}

/**
 * RSS 订阅项
 */
export interface RSSFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

/**
 * GDELT 新闻项
 */
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedDate: string;
  language: string;
  tone?: number;
  location?: string;
  themes?: string[];
}

/**
 * 日期范围
 */
export interface DateRange {
  start: string;
  end: string;
}

/**
 * 采集器配置
 */
export interface CollectorConfig {
  arxiv?: {
    enabled: boolean;
    maxResults: number;
    categories?: string[];
  };
  rss?: {
    enabled: boolean;
    feeds: string[];
  };
  gdelt?: {
    enabled: boolean;
    maxResults?: number;
  };
}

/**
 * 采集结果汇总
 */
export interface CollectedData {
  arxivPapers: ArxivPaper[];
  rssItems: RSSFeedItem[];
  newsItems: NewsItem[];
  gdeltNews?: NewsItem[];
  collectedAt: string;
  topicId: string;
  sourceCounts: {
    arxiv: number;
    rss: number;
    gdelt: number;
  };
}

// ===== arXiv API =====

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';

/**
 * 构建查询关键词
 * 将 topic 的 keywords 和 aliases 组合成 arXiv 查询字符串
 */
function buildArxivQuery(topic: Topic): string {
  const terms = [...topic.keywords, ...topic.aliases];
  // 连接词：OR 查询以获得更多结果
  return terms.map(t => `all:${encodeURIComponent(t)}`).join('+OR+');
}

/**
 * 调用 arXiv API 获取论文
 */
export async function fetchArxivPapers(
  query: string,
  maxResults: number = 10
): Promise<ArxivPaper[]> {
  const url = `${ARXIV_API_BASE}?search_query=${query}&start=0&max_results=${maxResults}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`arXiv API 请求失败: ${response.status}`);
    }

    const xmlText = await response.text();
    return parseArxivXML(xmlText);
  } catch (error) {
    console.error('获取 arXiv 论文时出错:', error);
    return [];
  }
}

/**
 * 解析 arXiv Atom XML 响应
 */
function parseArxivXML(xmlText: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // 使用正则表达式解析 XML（避免额外依赖）
  // 每个论文条目包含在 <entry> 标签中
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryContent = match[1];

    // 提取 id 和 arxivId
    const idMatch = entryContent.match(/<id>(.*?)<\/id>/);
    const id = idMatch ? idMatch[1].trim() : '';
    const arxivIdMatch = id.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
    const arxivId = arxivIdMatch ? arxivIdMatch[1] : '';

    // 提取标题
    const titleMatch = entryContent.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? cleanText(titleMatch[1]) : '';

    // 提取摘要
    const summaryMatch = entryContent.match(/<summary>([\s\S]*?)<\/summary>/);
    const summary = summaryMatch ? cleanText(summaryMatch[1]) : '';

    // 提取发布日期
    const publishedMatch = entryContent.match(/<published>(.*?)<\/published>/);
    const published = publishedMatch ? publishedMatch[1] : '';

    // 提取作者
    const authors: string[] = [];
    const authorRegex = /<name>(.*?)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entryContent)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    // 提取分类
    const categories: string[] = [];
    const categoryRegex = /<term[^>]*>(.*?)<\/term>/g;
    let categoryMatch: RegExpExecArray | null;
    while ((categoryMatch = categoryRegex.exec(entryContent)) !== null) {
      categories.push(categoryMatch[1]);
    }

    if (arxivId && title) {
      papers.push({
        id: `arxiv-${arxivId}`,
        title,
        authors,
        summary,
        published,
        arxivId,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
        categories,
      });
    }
  }

  return papers;
}

/**
 * 清理 XML 文本内容（移除多余空白和换行）
 */
function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ===== RSS Feed Parser =====

/**
 * 从多个 RSS 源获取内容
 */
export async function fetchRSSFeeds(urls: string[]): Promise<RSSFeedItem[]> {
  const results = await Promise.allSettled(
    urls.map(url => fetchSingleRSSFeed(url))
  );

  const items: RSSFeedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // 按发布日期降序排序
  return items.sort((a, b) =>
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
}

/**
 * 获取单个 RSS 源
 */
async function fetchSingleRSSFeed(url: string): Promise<RSSFeedItem[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/xml, application/rss+xml, application/atom+xml',
      },
    });

    if (!response.ok) {
      console.warn(`RSS 源请求失败: ${url} - ${response.status}`);
      return [];
    }

    const xmlText = await response.text();
    return parseRSSFeed(xmlText, url);
  } catch (error) {
    console.error(`获取 RSS 源 ${url} 时出错:`, error);
    return [];
  }
}

/**
 * 解析 RSS/Atom Feed
 * 支持 RSS 2.0 和 Atom 1.0 格式
 */
function parseRSSFeed(xmlText: string, sourceUrl: string): RSSFeedItem[] {
  const items: RSSFeedItem[] = [];

  // 尝试解析 RSS 2.0 格式 (<item> 标签)
  const rssItemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = rssItemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    const item = parseRSSItem(itemContent, sourceUrl);
    if (item) {
      items.push(item);
    }
  }

  // 如果没有 RSS item，尝试解析 Atom 1.0 格式 (<entry> 标签)
  if (items.length === 0) {
    const atomEntryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    while ((match = atomEntryRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];
      const item = parseAtomEntry(itemContent, sourceUrl);
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * 解析 RSS 2.0 item
 */
function parseRSSItem(itemContent: string, sourceUrl: string): RSSFeedItem | null {
  const titleMatch = itemContent.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
  const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
  const descMatch = itemContent.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
  const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);

  const title = titleMatch ? cleanCDATA(titleMatch[1]) : '';
  const link = linkMatch ? linkMatch[1].trim() : '';
  const description = descMatch ? cleanCDATA(descMatch[1]) : '';
  const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

  if (!title) return null;

  return {
    title,
    link,
    description: stripHtmlTags(description),
    pubDate,
    source: getDomainFromUrl(sourceUrl),
  };
}

/**
 * 解析 Atom 1.0 entry
 */
function parseAtomEntry(itemContent: string, sourceUrl: string): RSSFeedItem | null {
  const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
  const linkMatch = itemContent.match(/<link[^>]*href=["'](.*?)["']/);
  const contentMatch = itemContent.match(/<(?:content|summary)(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:content|summary)>/);
  const pubDateMatch = itemContent.match(/<(?:published|updated)>(.*?)<\/(?:published|updated)>/);

  const title = titleMatch ? cleanCDATA(titleMatch[1]) : '';
  const link = linkMatch ? linkMatch[1] : '';
  const description = contentMatch ? cleanCDATA(contentMatch[1]) : '';
  const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

  if (!title) return null;

  return {
    title,
    link,
    description: stripHtmlTags(description),
    pubDate,
    source: getDomainFromUrl(sourceUrl),
  };
}

/**
 * 清理 CDATA 标记
 */
function cleanCDATA(text: string): string {
  return text.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
}

/**
 * 移除 HTML 标签
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 从 URL 提取域名作为来源标识
 */
function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'Unknown';
  }
}

// ===== GDELT API =====

const GDELT_API_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

/**
 * 从 GDELT 获取新闻
 * 注意：GDELT API 可能有频率限制，实际使用时需要考虑缓存
 */
export async function fetchGDELTNews(
  query: string,
  dateRange?: DateRange,
  maxResults: number = 20
): Promise<NewsItem[]> {
  try {
    // GDELT 使用简单的查询参数格式
    const params = new URLSearchParams({
      query: query,
      format: 'json',
      maxrecords: String(maxResults),
      mode: 'artlist',
    });

    if (dateRange) {
      params.append('startdate', dateRange.start.replace(/-/g, ''));
      params.append('enddate', dateRange.end.replace(/-/g, ''));
    }

    const url = `${GDELT_API_BASE}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`GDELT API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return parseGDELTResponse(data);
  } catch (error) {
    console.error('获取 GDELT 新闻时出错:', error);
    return [];
  }
}

/**
 * 解析 GDELT API 响应
 * GDELT 返回的是制表符分隔的格式或 JSON 格式
 */
function parseGDELTResponse(data: any): NewsItem[] {
  // GDELT API 的响应格式可能有变化，这里做健壮处理
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    title: item.title || item.seendate || '',
    url: item.url || '',
    source: item.domain || item.source || 'GDELT',
    publishedDate: item.seendate ? formatGDELTDate(item.seendate) : new Date().toISOString(),
    language: item.language || 'en',
    tone: item.tone ? parseFloat(item.tone) : undefined,
    location: item.location || undefined,
    themes: item.themes ? item.themes.split(';').filter(Boolean) : [],
  }));
}

/**
 * 格式化 GDELT 日期 (YYYYMMDDHHMMSS -> ISO)
 */
function formatGDELTDate(gdeltDate: string): string {
  if (gdeltDate.length >= 14) {
    const year = gdeltDate.slice(0, 4);
    const month = gdeltDate.slice(4, 6);
    const day = gdeltDate.slice(6, 8);
    const hour = gdeltDate.slice(8, 10);
    const minute = gdeltDate.slice(10, 12);
    return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
  }
  return gdeltDate;
}

// ===== 统一采集接口 =====

/**
 * 根据主题配置采集数据
 */
export async function collectByTopic(
  topic: Topic,
  config: CollectorConfig
): Promise<CollectedData> {
  const result: CollectedData = {
    arxivPapers: [],
    rssItems: [],
    newsItems: [],
    collectedAt: new Date().toISOString(),
    topicId: topic.id,
    sourceCounts: {
      arxiv: 0,
      rss: 0,
      gdelt: 0,
    },
  };

  // 采集 arXiv 论文
  if (config.arxiv?.enabled) {
    const query = buildArxivQuery(topic);
    const maxResults = config.arxiv.maxResults || 10;
    result.arxivPapers = await fetchArxivPapers(query, maxResults);
    result.sourceCounts.arxiv = result.arxivPapers.length;
  }

  // 采集 RSS 源
  if (config.rss?.enabled && config.rss.feeds.length > 0) {
    result.rssItems = await fetchRSSFeeds(config.rss.feeds);
    result.sourceCounts.rss = result.rssItems.length;
  }

  // 采集 GDELT 新闻
  if (config.gdelt?.enabled) {
    const query = topic.keywords.join(' ');
    const maxResults = config.gdelt.maxResults || 20;
    result.newsItems = await fetchGDELTNews(query, undefined, maxResults);
    result.sourceCounts.gdelt = result.newsItems.length;
  }

  return result;
}

/**
 * 默认采集器配置
 */
export const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  arxiv: {
    enabled: true,
    maxResults: 10,
  },
  rss: {
    enabled: true,
    feeds: [
      'https://www.reddit.com/r/MachineLearning/.rss',
      'https://news.ycombinator.com/rss',
    ],
  },
  gdelt: {
    enabled: false, // GDELT 默认关闭，因为 API 可能有频率限制
    maxResults: 20,
  },
};

/**
 * 去重 arXiv 论文（基于 arxivId）
 */
export function deduplicateArxivPapers(papers: ArxivPaper[]): ArxivPaper[] {
  const seen = new Set<string>();
  return papers.filter(paper => {
    if (seen.has(paper.arxivId)) {
      return false;
    }
    seen.add(paper.arxivId);
    return true;
  });
}

/**
 * 去重 RSS/新闻项（基于 URL）
 */
export function deduplicateNewsItems(items: RSSFeedItem[] | NewsItem[]): any[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const url = 'link' in item ? item.link : item.url;
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

/**
 * 将 ArxivPaper 转换为 CreateDocumentInput
 * 可用于保存到数据库
 */
export function arxivPaperToDocument(paper: ArxivPaper, topicId?: string) {
  return {
    title: paper.title,
    source: 'arXiv',
    source_url: paper.pdfUrl,
    published_date: paper.published,
    collected_date: new Date().toISOString(),
    content: paper.summary,
    topic_id: topicId,
    metadata: {
      arxivId: paper.arxivId,
      authors: paper.authors,
      categories: paper.categories,
      type: 'paper',
    },
  };
}

/**
 * 将 RSSFeedItem 转换为 CreateDocumentInput
 */
export function rssItemToDocument(item: RSSFeedItem, topicId?: string) {
  return {
    title: item.title,
    source: item.source,
    source_url: item.link,
    published_date: item.pubDate,
    collected_date: new Date().toISOString(),
    content: item.description,
    topic_id: topicId,
    metadata: {
      type: 'news',
    },
  };
}

/**
 * 将 NewsItem 转换为 CreateDocumentInput
 */
export function newsItemToDocument(item: NewsItem, topicId?: string) {
  return {
    title: item.title,
    source: item.source,
    source_url: item.url,
    published_date: item.publishedDate,
    collected_date: new Date().toISOString(),
    topic_id: topicId,
    metadata: {
      type: 'news',
      language: item.language,
      tone: item.tone,
      location: item.location,
      themes: item.themes,
    },
  };
}

// ===== 任务队列和重试机制 =====

/**
 * 采集任务状态
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 采集任务
 */
export interface CollectionTask {
  id: string;
  topicId: string;
  topicName: string;
  status: TaskStatus;
  config: CollectorConfig;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  result?: CollectedData;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // 初始延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  backoffMultiplier: number; // 退避乘数
  retryableErrors: string[]; // 可重试的错误模式
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'fetch failed'],
};

/**
 * 带重试的异步函数执行器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (error: Error, attempt: number) => void
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 检查是否为可重试的错误
      const isRetryable = config.retryableErrors.some(pattern =>
        lastError.message.toLowerCase().includes(pattern.toLowerCase())
      );

      if (!isRetryable || attempt === config.maxRetries) {
        throw lastError;
      }

      // 计算退避延迟
      const currentDelay = Math.min(delay, config.maxDelay);
      console.log(`重试第 ${attempt + 1} 次，延迟 ${currentDelay}ms: ${lastError.message}`);

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await sleep(currentDelay);
      delay *= config.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 任务队列
 */
class CollectionTaskQueue {
  private queue: CollectionTask[] = [];
  private processing = false;
  private retryConfig: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * 添加任务到队列
   */
  enqueue(task: Omit<CollectionTask, 'id' | 'createdAt' | 'retryCount' | 'status'>): CollectionTask {
    const newTask: CollectionTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(newTask);
    return newTask;
  }

  /**
   * 获取队列中的所有任务
   */
  getAllTasks(): CollectionTask[] {
    return [...this.queue];
  }

  /**
   * 获取指定状态的任务
   */
  getTasksByStatus(status: TaskStatus): CollectionTask[] {
    return this.queue.filter(t => t.status === status);
  }

  /**
   * 根据 ID 获取任务
   */
  getTask(id: string): CollectionTask | undefined {
    return this.queue.find(t => t.id === id);
  }

  /**
   * 根据 topicId 获取任务
   */
  getTasksByTopic(topicId: string): CollectionTask[] {
    return this.queue.filter(t => t.topicId === topicId);
  }

  /**
   * 处理队列中的任务
   */
  async processQueue(
    collector: (topic: Topic, config: CollectorConfig) => Promise<CollectedData>,
    topicGetter: (topicId: string) => Promise<Topic>
  ): Promise<void> {
    if (this.processing) {
      console.log('队列正在处理中，跳过本次调用');
      return;
    }

    this.processing = true;

    try {
      const pendingTasks = this.getTasksByStatus('pending');

      for (const task of pendingTasks) {
        await this.processTask(task, collector, topicGetter);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * 处理单个任务（带重试）
   */
  private async processTask(
    task: CollectionTask,
    collector: (topic: Topic, config: CollectorConfig) => Promise<CollectedData>,
    topicGetter: (topicId: string) => Promise<Topic>
  ): Promise<void> {
    // 更新任务状态
    task.status = 'running';
    task.startedAt = new Date().toISOString();

    try {
      const topic = await topicGetter(task.topicId);

      const result = await withRetry(
        () => collector(topic, task.config),
        this.retryConfig,
        (error, attempt) => {
          task.retryCount = attempt;
          console.error(`任务 ${task.id} 第 ${attempt} 次重试:`, error.message);
        }
      );

      task.result = result;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();

      console.log(`任务 ${task.id} 完成: 采集 ${result.sourceCounts.arxiv + result.sourceCounts.rss + result.sourceCounts.gdelt} 条数据`);
    } catch (error) {
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      task.error = error instanceof Error ? error.message : String(error);

      console.error(`任务 ${task.id} 失败:`, task.error);
    }
  }

  /**
   * 重试失败的任务
   */
  async retryFailedTasks(
    collector: (topic: Topic, config: CollectorConfig) => Promise<CollectedData>,
    topicGetter: (topicId: string) => Promise<Topic>
  ): Promise<void> {
    const failedTasks = this.getTasksByStatus('failed');

    for (const task of failedTasks) {
      if (task.retryCount < task.maxRetries) {
        task.status = 'pending';
        task.retryCount++;
        task.error = undefined;
      }
    }

    await this.processQueue(collector, topicGetter);
  }

  /**
   * 清除已完成的任务
   */
  clearCompleted(): void {
    this.queue = this.queue.filter(t => t.status !== 'completed');
  }

  /**
   * 清除所有任务
   */
  clearAll(): void {
    this.queue = [];
  }

  /**
   * 获取队列统计
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    return {
      total: this.queue.length,
      pending: this.getTasksByStatus('pending').length,
      running: this.getTasksByStatus('running').length,
      completed: this.getTasksByStatus('completed').length,
      failed: this.getTasksByStatus('failed').length,
    };
  }
}

/**
 * 全局任务队列实例
 */
let globalQueue: CollectionTaskQueue | null = null;

/**
 * 获取全局任务队列
 */
export function getTaskQueue(retryConfig?: Partial<RetryConfig>): CollectionTaskQueue {
  if (!globalQueue) {
    globalQueue = new CollectionTaskQueue(retryConfig);
  }
  return globalQueue;
}

/**
 * 创建采集任务并加入队列
 */
export async function createCollectionTask(
  topic: Topic,
  config: CollectorConfig,
  retryConfig?: Partial<RetryConfig>
): Promise<CollectionTask> {
  const queue = getTaskQueue(retryConfig);

  return queue.enqueue({
    topicId: topic.id,
    topicName: topic.name,
    config,
    maxRetries: retryConfig?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
  });
}

/**
 * 启动任务队列处理
 */
export async function startTaskProcessing(
  collector: (topic: Topic, config: CollectorConfig) => Promise<CollectedData>,
  topicGetter: (topicId: string) => Promise<Topic>,
  intervalMs: number = 60000 // 默认每分钟检查一次
): Promise<() => void> {
  const queue = getTaskQueue();

  const intervalId = setInterval(() => {
    queue.processQueue(collector, topicGetter);
  }, intervalMs);

  // 立即执行一次
  await queue.processQueue(collector, topicGetter);

  // 返回停止函数
  return () => clearInterval(intervalId);
}

/**
 * 获取队列状态
 */
export function getQueueStatus() {
  const queue = getTaskQueue();
  return queue.getStats();
}

/**
 * 获取所有任务
 */
export function getAllTasks(): CollectionTask[] {
  const queue = getTaskQueue();
  return queue.getAllTasks();
}

/**
 * 根据 topicId 获取任务
 */
export function getTasksByTopic(topicId: string): CollectionTask[] {
  const queue = getTaskQueue();
  return queue.getTasksByTopic(topicId);
}
