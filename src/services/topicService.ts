/**
 * 主题服务
 * 处理主题相关的 API 调用
 */

const API_BASE = '';

export interface Topic {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  owner: string;
  priority: 'high' | 'medium' | 'low';
  scope: string;
  createdAt: string;
  keywords: string[];
  organizations: string[];
  schedule: 'daily' | 'weekly' | 'monthly';
}

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

/**
 * 获取单个主题
 */
export async function fetchTopic(id: string): Promise<Topic> {
  const response = await fetch(`${API_BASE}/api/topics/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch topic');
  }
  return response.json();
}

/**
 * 创建主题
 */
export async function createTopic(topic: Omit<Topic, 'id'>): Promise<Topic> {
  const response = await fetch(`${API_BASE}/api/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topic)
  });
  if (!response.ok) {
    throw new Error('Failed to create topic');
  }
  return response.json();
}

/**
 * 更新主题
 */
export async function updateTopic(id: string, topic: Partial<Topic>): Promise<Topic> {
  const response = await fetch(`${API_BASE}/api/topics/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topic)
  });
  if (!response.ok) {
    throw new Error('Failed to update topic');
  }
  return response.json();
}

/**
 * 删除主题
 */
export async function deleteTopic(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/topics/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete topic');
  }
}
