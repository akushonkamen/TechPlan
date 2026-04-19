import { useState, useEffect } from 'react';
import { Search, RefreshCw, ExternalLink, Trash2, Database, Sparkles, Settings, AlertTriangle } from 'lucide-react';
import { fetchRealTimeTechNews, type FetchedDocument } from '../services/agentService';
import { fetchAllDocuments, saveFetchedDocuments, deleteDocument, type DbDocument } from '../services/documentService';
import { fetchTopics } from '../services/topicService';
import { getAIConfig } from '../services/aiService';

interface DedupResult {
  unique: FetchedDocument[];
  duplicates: Array<{
    document: FetchedDocument;
    reason: string;
  }>;
  stats: {
    original: number;
    unique: number;
    removed: number;
  };
}

export default function DataSources() {
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [customQuery, setCustomQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [dbDocuments, setDbDocuments] = useState<DbDocument[]>([]);
  const [recentFetched, setRecentFetched] = useState<FetchedDocument[]>([]);
  const [dedupMessage, setDedupMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Load topics and documents on mount
  useEffect(() => {
    loadData();
    checkAIConfig();
  }, []);

  const checkAIConfig = async () => {
    try {
      const config = await getAIConfig();
      setAiConfigured(!!config.apiKey);
    } catch {
      setAiConfigured(false);
    }
  };

  const loadData = async () => {
    try {
      const [topicsData, docsData] = await Promise.all([
        fetchTopics(),
        fetchAllDocuments()
      ]);
      setTopics(topicsData);
      setDbDocuments(docsData);
      if (topicsData.length > 0 && !selectedTopicId) {
        setSelectedTopicId(topicsData[0].id);
      }
      setErrorMessage('');
    } catch (error: any) {
      console.error("Failed to load data:", error);
      setErrorMessage(`加载数据失败: ${error.message}`);
    }
  };

  const getSelectedTopic = () => topics.find(t => t.id === selectedTopicId);

  const handleSearch = async () => {
    if (isSearching) return;

    // 清空之前的消息
    setErrorMessage('');
    setDedupMessage('');

    const query = customQuery.trim();
    const topic = getSelectedTopic();

    if (!query && !topic) {
      setErrorMessage('请先选择一个主题或输入搜索词');
      return;
    }

    setIsSearching(true);

    try {
      // 使用自定义搜索词或主题关键词
      const searchQuery = query || `${topic?.name} ${topic?.keywords?.slice(0, 3).join(' ') || ''}`;

      console.log('开始检索:', searchQuery);

      const results = await fetchRealTimeTechNews(searchQuery);

      console.log('检索结果:', results);

      if (results.length === 0) {
        setErrorMessage('未找到相关文档，请尝试其他关键词');
        return;
      }

      // 去重
      const deduped = await deduplicateWithApi(results);

      // 保存到数据库（关联到选中主题）
      await saveFetchedDocuments(deduped.map(doc => ({
        title: doc.title,
        source: doc.source,
        type: doc.type,
        date: doc.date,
        url: doc.url
      })), selectedTopicId || null);

      setRecentFetched(deduped);
      setDedupMessage(`✓ 成功采集 ${deduped.length} 篇文档${results.length > deduped.length ? ` (去重 ${results.length - deduped.length} 篇)` : ''}`);

      // 刷新文档列表
      await loadData();
    } catch (error: any) {
      console.error("Search failed:", error);
      setErrorMessage(`采集失败: ${error.message || error}。请检查：1) 是否已在设置页面配置 AI 服务；2) API Key 是否正确`);
    } finally {
      setIsSearching(false);
    }
  };

  const deduplicateWithApi = async (documents: FetchedDocument[]): Promise<FetchedDocument[]> => {
    try {
      const response = await fetch('http://localhost:3000/api/documents/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents, similarityThreshold: 0.85 })
      });
      if (response.ok) {
        const result: DedupResult = await response.json();
        return result.unique;
      }
    } catch (error) {
      console.error('Dedup failed:', error);
    }
    return documents;
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('确定要删除此文档吗？')) return;
    try {
      await deleteDocument(id);
      await loadData();
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  const filteredDocuments = selectedTopicId
    ? dbDocuments.filter(d => d.topic_id === selectedTopicId)
    : dbDocuments;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">数据采集</h2>
        <p className="mt-1 text-sm text-gray-500">基于 AI 联网检索采集最新技术文档</p>
      </div>

      {/* AI Configuration Warning */}
      {aiConfigured === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-amber-900">需要配置 AI 服务</h4>
            <p className="text-sm text-amber-800 mt-1">
              使用数据采集功能前，请先在「设置」页面配置 AI API Key（支持 OpenAI 或 Google Gemini）。
            </p>
            <a
              href="/settings"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-900 hover:text-amber-700"
            >
              <Settings className="w-4 h-4" />
              前往设置
            </a>
          </div>
        </div>
      )}

      {/* Search Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex gap-4 mb-4">
          {/* Topic Selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">选择主题</label>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">全部文档</option>
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Custom Query Input */}
          <div className="flex-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">自定义搜索词（可选）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="输入关键词，留空则使用主题关键词"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || aiConfigured === false}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title={aiConfigured === false ? '请先配置 AI 服务' : ''}
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    检索中...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    开始检索
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Topic Info */}
        {getSelectedTopic() && (
          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-indigo-900">{getSelectedTopic().name}</h4>
                <p className="text-sm text-indigo-700 mt-1">{getSelectedTopic().description}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getSelectedTopic().keywords?.map((kw: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-white rounded text-xs text-indigo-700">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200 flex items-start gap-2">
            <span className="text-red-500 font-bold">!</span>
            <div>
              <div className="font-medium">采集失败</div>
              <div className="mt-1">{errorMessage}</div>
            </div>
          </div>
        )}
        {dedupMessage && !errorMessage && (
          <div className="mt-4 p-3 rounded-lg text-sm bg-green-50 text-green-800 border border-green-200">
            {dedupMessage}
          </div>
        )}
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="font-medium text-gray-900">
            已采集文档
            {selectedTopicId && ` (${getSelectedTopic()?.name})`}
          </h3>
          <span className="text-sm text-gray-500">共 {filteredDocuments.length} 篇</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">标题</th>
                <th className="px-6 py-3">来源</th>
                <th className="px-6 py-3">发布日期</th>
                <th className="px-6 py-3">采集时间</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>暂无文档，点击上方"开始检索"进行采集</p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900 max-w-md truncate" title={doc.title}>
                      {doc.title}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{doc.source || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{doc.published_date || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {doc.collected_date ? new Date(doc.collected_date).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {doc.source_url && (
                          <a
                            href={doc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 text-xs flex items-center gap-1"
                          >
                            查看 <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
