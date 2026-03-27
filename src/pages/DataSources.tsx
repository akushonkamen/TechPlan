import { useState, useEffect } from 'react';
import { Database, Upload, RefreshCw, ExternalLink, FileText, Globe, BookOpen, Loader2, Trash2, FilterX } from 'lucide-react';
import { fetchRealTimeTechNews, type FetchedDocument } from '../services/agentService';
import { fetchAllDocuments, saveFetchedDocuments, deleteDocument, type DbDocument } from '../services/documentService';

interface DedupResult {
  unique: FetchedDocument[];
  duplicates: Array<{
    document: FetchedDocument;
    reason: string;
    duplicateOf?: FetchedDocument;
  }>;
  stats: {
    original: number;
    unique: number;
    removed: number;
    byUrl: number;
    byTitleSimilarity: number;
  };
}

interface Source {
  id: number;
  name: string;
  type: string;
  status: 'active' | 'syncing' | 'error';
  lastSync: Date;
  count: number;
  icon: any;
}

const initialSources: Source[] = [
  { id: 1, name: 'arXiv', type: '论文库', status: 'active', lastSync: new Date(Date.now() - 10 * 60000), count: 12450, icon: BookOpen },
  { id: 2, name: 'OpenAlex', type: '论文库', status: 'active', lastSync: new Date(Date.now() - 60 * 60000), count: 45200, icon: BookOpen },
  { id: 3, name: 'GDELT', type: '新闻源', status: 'active', lastSync: new Date(Date.now() - 5 * 60000), count: 8930, icon: Globe },
  { id: 4, name: '内部竞品分析库', type: '内部文档', status: 'active', lastSync: new Date(Date.now() - 24 * 60 * 60000), count: 124, icon: FileText },
];

const initialDocs: FetchedDocument[] = [
  { title: 'LLaMA-3: Open Foundation and Fine-Tuned Chat Models', source: 'arXiv', type: '论文', date: '2026-03-26', url: '#' },
  { title: 'Apple 宣布在 iOS 19 中全面集成端侧 AI', source: 'TechCrunch', type: '新闻', date: '2026-03-25', url: '#' },
  { title: '宁德时代发布凝聚态电池量产计划', source: '官网新闻', type: '新闻', date: '2026-03-24', url: '#' },
  { title: '2026年Q1竞品技术路线追踪报告.pdf', source: '人工上传', type: '内部文档', date: '2026-03-23', url: '#' },
];

function getRelativeTime(date: Date, now: number) {
  const diffInSeconds = (date.getTime() - now) / 1000;
  if (Math.abs(diffInSeconds) < 60) return '刚刚';

  const rtf = new Intl.RelativeTimeFormat('zh', { numeric: 'auto' });
  if (Math.abs(diffInSeconds) < 3600) return rtf.format(Math.round(diffInSeconds / 60), 'minute');
  if (Math.abs(diffInSeconds) < 86400) return rtf.format(Math.round(diffInSeconds / 3600), 'hour');
  return rtf.format(Math.round(diffInSeconds / 86400), 'day');
}

export default function DataSources() {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [recentDocs, setRecentDocs] = useState<FetchedDocument[]>(initialDocs);
  const [dbDocuments, setDbDocuments] = useState<DbDocument[]>([]);
  const [now, setNow] = useState(Date.now());
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isLoadingDbDocs, setIsLoadingDbDocs] = useState(false);
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [showDedupToast, setShowDedupToast] = useState(false);

  // Update 'now' every second to refresh relative times more responsively
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load documents from database on mount
  useEffect(() => {
    loadDbDocuments();
  }, []);

  const loadDbDocuments = async () => {
    setIsLoadingDbDocs(true);
    try {
      const docs = await fetchAllDocuments();
      setDbDocuments(docs);
    } catch (error) {
      console.error("Failed to load documents from database:", error);
    } finally {
      setIsLoadingDbDocs(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('确定要删除此文档吗？')) return;
    try {
      await deleteDocument(id);
      await loadDbDocuments();
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  /**
   * 调用去重 API
   */
  const deduplicateDocuments = async (documents: FetchedDocument[]): Promise<FetchedDocument[]> => {
    try {
      const response = await fetch('http://localhost:3000/api/documents/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents, similarityThreshold: 0.85 })
      });

      if (!response.ok) {
        console.error('去重请求失败:', response.statusText);
        return documents;
      }

      const result: DedupResult = await response.json();
      setDedupResult(result);

      // 显示去重结果提示
      if (result.stats.removed > 0) {
        setShowDedupToast(true);
        setTimeout(() => setShowDedupToast(false), 5000);
      }

      return result.unique;
    } catch (error) {
      console.error('去重失败:', error);
      return documents;
    }
  };

  const handleManualSync = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    
    // Set all sources to syncing state
    setSources(prev => prev.map(s => ({ ...s, status: 'syncing' })));

    try {
      // 真正的 Agentic 检索：调用 Gemini API 联网搜索最新技术情报
      const [llmResults, batteryResults] = await Promise.all([
        fetchRealTimeTechNews("端侧大模型 (On-device LLM)"),
        fetchRealTimeTechNews("固态电池 (Solid-state battery)")
      ]);

      const combinedResults = [...llmResults, ...batteryResults];
      
      // 按日期降序排序
      combinedResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (combinedResults.length > 0) {
        // 执行去重
        const uniqueDocs = await deduplicateDocuments(combinedResults);

        setRecentDocs(uniqueDocs);

        // Save to database (只保存去重后的文档)
        try {
          await saveFetchedDocuments(uniqueDocs);
          // Reload documents from database
          await loadDbDocuments();
        } catch (error) {
          console.error("Failed to save documents to database:", error);
        }
      }

      // Update source counts and timestamps based on real fetched data
      setSources(prev => prev.map(s => {
        let addedCount = 0;
        if (s.name === 'arXiv' || s.name === 'OpenAlex') {
          addedCount = combinedResults.filter(doc => doc.type === '论文').length;
        } else if (s.name === 'GDELT') {
          addedCount = combinedResults.filter(doc => doc.type === '新闻').length;
        }

        return {
          ...s,
          status: 'active',
          count: s.count + addedCount,
          lastSync: new Date()
        };
      }));
    } catch (error) {
      console.error("同步失败:", error);
      // Revert status on error
      setSources(prev => prev.map(s => ({ ...s, status: 'active' })));
    } finally {
      setIsManualSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">数据源与采集</h2>
          <p className="mt-1 text-sm text-gray-500">管理外部数据源接入、查看采集状态，或手动上传内部补充材料。</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleManualSync}
            disabled={isManualSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
            {isManualSyncing ? '联网检索中...' : '手动触发同步'}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm">
            <Upload className="w-4 h-4" />
            上传内部文档
          </button>
        </div>
      </div>

      {/* 去重结果提示 */}
      {showDedupToast && dedupResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <FilterX className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-blue-900">内容去重完成</h4>
            <p className="text-sm text-blue-700 mt-1">
              已从 <span className="font-semibold">{dedupResult.stats.original}</span> 篇文档中去除
              <span className="font-semibold"> {dedupResult.stats.removed}</span> 篇重复内容
              （URL重复 {dedupResult.stats.byUrl} 篇，标题相似 {dedupResult.stats.byTitleSimilarity} 篇）
            </p>
          </div>
          <button
            onClick={() => setShowDedupToast(false)}
            className="text-blue-400 hover:text-blue-600"
          >
            &times;
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {sources.map((source) => (
          <div key={source.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-gray-50 rounded-lg">
                <source.icon className="w-5 h-5 text-gray-600" />
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                source.status === 'syncing' ? 'text-blue-700 bg-blue-50' : 'text-green-700 bg-green-50'
              }`}>
                {source.status === 'syncing' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                )}
                {source.status === 'syncing' ? '同步中' : '正常'}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-gray-900">{source.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{source.type}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
              <span className="text-gray-500">已采集: <span className="font-medium text-gray-900 transition-all duration-500">{source.count.toLocaleString()}</span></span>
              <span className="text-gray-400 text-xs">{getRelativeTime(source.lastSync, now)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-medium text-gray-900">最新采集文档 (真实网络数据)</h3>
          <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">查看全部</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">文档标题</th>
                <th className="px-6 py-3">类型</th>
                <th className="px-6 py-3">来源</th>
                <th className="px-6 py-3">采集时间</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    暂无数据，请点击“手动触发同步”进行全网检索。
                  </td>
                </tr>
              ) : (
                recentDocs.map((doc, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900 max-w-md truncate" title={doc.title}>
                      {doc.title}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{doc.type}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{doc.source}</td>
                    <td className="px-6 py-4 text-gray-500">{doc.date}</td>
                    <td className="px-6 py-4 text-right">
                      <a 
                        href={doc.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs flex items-center gap-1 ml-auto justify-end"
                      >
                        查看原文 <ExternalLink className="w-3 h-3" />
                      </a>
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
