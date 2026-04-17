/**
 * 主题服务
 * 处理主题相关的 API 调用
 */

import type { Topic } from '../types';

const API_BASE = '';

export type { Topic };

/**
 * 获取所有主题
 */
export async function fetchTopics(): Promise<Topic[]> {
  const response = await fetch(`${API_BASE}/api/topics`);
  if (!response.ok) {
    throw new Error('Failed to fetch topics');
  }
  return response.json();
}
