import type { DbDocument, CreateDocumentInput } from '../types';

// Re-export DbDocument for use in other modules
export type { DbDocument };

// Use full URL for server-side calls
const API_BASE = process.env.API_BASE_URL || '/api';

export async function fetchAllDocuments(topicId?: string): Promise<DbDocument[]> {
  const url = topicId
    ? `${API_BASE}/topics/${topicId}/documents`
    : `${API_BASE}/documents`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }
  return response.json();
}

export async function fetchDocument(id: string): Promise<DbDocument> {
  const response = await fetch(`${API_BASE}/documents/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }
  return response.json();
}

export async function createDocument(input: CreateDocumentInput): Promise<DbDocument> {
  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('Failed to create document');
  }
  return response.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete document');
  }
}

/**
 * 保存采集到的文档到数据库
 * 将 FetchedDocument 转换为 CreateDocumentInput 并保存
 */
export async function saveFetchedDocuments(
  docs: Array<{
    title: string;
    source: string;
    type: string;
    date: string;
    url: string;
  }>,
  topicId?: string
): Promise<DbDocument[]> {
  const createPromises = docs.map(doc =>
    createDocument({
      title: doc.title,
      source: doc.source,
      source_url: doc.url,
      published_date: doc.date,
      collected_date: new Date().toISOString(),
      metadata: {
        type: doc.type,
      },
      topic_id: topicId,
    })
  );

  return Promise.all(createPromises);
}
