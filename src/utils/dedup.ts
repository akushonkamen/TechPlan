/**
 * 内容去重工具函数
 */

export interface Document {
  title: string;
  url: string;
  source?: string;
  type?: string;
  date?: string;
}

export interface DedupResult {
  unique: Document[];
  duplicates: Array<{
    document: Document;
    reason: string;
    duplicateOf?: Document;
  }>;
  stats: {
    original: number;
    unique: number;
    removed: number;
    byUrl: number;
    byTitleSimilarity: number;
  };
}

/**
 * 规范化标题：统一小写、去除多余空格、特殊字符等
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // 移除多余空格
    .replace(/\s+/g, ' ')
    // 移除常见的前缀标点
    .replace(/^[\s\-–—|:：,.。]+/, '')
    // 移除常见的后缀标点
    .replace(/[\s\-–—|:：,.。]+$/, '')
    // 统一破折号
    .replace(/[\-–—]/g, '-')
    // 移除中英文括号内容（可选，用于去除副标题）
    // .replace(/\([^)]*\)|（[^）]*）|「[^」]*」|『[^』]*』/g, '')
    .trim();
}

/**
 * 计算两个字符串的相似度 (使用 Levenshtein 距离)
 * 返回 0-1 之间的值，1 表示完全相同
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeTitle(str1);
  const s2 = normalizeTitle(str2);

  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;

  // 空字符串处理
  if (len1 === 0 || len2 === 0) return 0;

  // 短字符串直接比较
  if (len1 < 3 || len2 < 3) {
    return s1 === s2 ? 1 : 0;
  }

  // Levenshtein 距离算法
  const matrix: number[][] = [];
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        );
      }
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);

  // 转换为相似度: 1 - (distance / maxLength)
  return 1 - distance / maxLen;
}

/**
 * URL 去重判断
 * 规范化 URL 后进行比较
 */
export function isDuplicateUrl(url1: string, url2: string): boolean {
  const normalizeUrl = (url: string): string => {
    return url
      .toLowerCase()
      .trim()
      // 移除协议
      .replace(/^https?:\/\//, '')
      // 移除 www 前缀
      .replace(/^www\./, '')
      // 移除尾部斜杠
      .replace(/\/$/, '')
      // 移除常见追踪参数
      .split('?')[0]
      // 移除锚点
      .split('#')[0];
  };

  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * 检查两个文档是否为相似标题重复
 */
export function isSimilarTitle(doc1: Document, doc2: Document, threshold: number = 0.85): boolean {
  return calculateSimilarity(doc1.title, doc2.title) >= threshold;
}

/**
 * 主去重函数
 * @param documents 待去重的文档列表
 * @param similarityThreshold 标题相似度阈值，默认 0.85
 * @returns 去重结果
 */
export function deduplicateDocuments(documents: Document[], similarityThreshold: number = 0.85): DedupResult {
  const unique: Document[] = [];
  const duplicates: DedupResult['duplicates'] = [];
  const seenUrls = new Set<string>();
  const seenTitles: string[] = [];

  // 用于统计
  let byUrl = 0;
  let byTitleSimilarity = 0;

  for (const doc of documents) {
    let isDuplicate = false;
    let reason = '';
    let duplicateOf: Document | undefined;

    // 1. URL 哈希去重
    const isUrlDup = Array.from(seenUrls).some(seenUrl => isDuplicateUrl(seenUrl, doc.url));
    if (isUrlDup) {
      isDuplicate = true;
      reason = 'duplicate_url';
      byUrl++;
      // 找到原始文档
      duplicateOf = unique.find(u => isDuplicateUrl(u.url, doc.url));
    }

    // 2. 标题相似度去重
    if (!isDuplicate) {
      for (const seenTitle of seenTitles) {
        if (calculateSimilarity(seenTitle, doc.title) >= similarityThreshold) {
          isDuplicate = true;
          reason = 'similar_title';
          byTitleSimilarity++;
          duplicateOf = unique.find(u => calculateSimilarity(u.title, doc.title) >= similarityThreshold);
          break;
        }
      }
    }

    if (isDuplicate) {
      duplicates.push({
        document: doc,
        reason,
        duplicateOf
      });
    } else {
      unique.push(doc);
      seenUrls.add(doc.url);
      seenTitles.push(doc.title);
    }
  }

  return {
    unique,
    duplicates,
    stats: {
      original: documents.length,
      unique: unique.length,
      removed: duplicates.length,
      byUrl,
      byTitleSimilarity
    }
  };
}
