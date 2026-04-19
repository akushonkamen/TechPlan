import React, { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw, ExternalLink, Trash2, Database, Sparkles, Settings, AlertTriangle, Upload, FileText, Check, X } from 'lucide-react';
import { fetchTopics } from '../services/topicService';
import { useResearch } from '../hooks/useSkills';

export interface FetchedDocument {
  title: string;
  source: string;
  type: '新闻' | '论文' | '标准' | '内部文档';
  date: string;
  url: string;
}

export default function DataSources() {
  const researchSkill = useResearch();
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [customQuery, setCustomQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [dbDocuments, setDbDocuments] = useState<any[]>([]);
  const [recentFetched, setRecentFetched] = useState<FetchedDocument[]>([]);
  const [dedupMessage, setDedupMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // 文件上传状态
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; title: string; size: number } | null>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    checkAIConfig();
  }, []);

  const checkAIConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      const hasKey = !!(config.openaiApiKey || config.geminiApiKey || config.customApiKey);
      setAiConfigured(hasKey);
    } catch {
      setAiConfigured(false);
    }
  };

  const loadData = async () => {
    try {
      const [topicsData, docsRes] = await Promise.all([
        fetchTopics(),
        fetch('/api/documents')
      ]);
      const docsData = docsRes.ok ? await docsRes.json() : [];
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
      const searchQuery = query || topic?.name || '';

      // 触发 Claude Code skill 进行检索
      await researchSkill.research({
        topicId: topic?.id || '',
        topicName: searchQuery,
        keywords: topic?.keywords || [searchQuery],
        organizations: topic?.organizations || [],
      });

      const results: FetchedDocument[] = researchSkill.result?.documents?.map((d: any) => ({
        title: d.title,
        source: d.source || 'web',
        type: '新闻',
        date: new Date().toISOString().split('T')[0],
        url: d.sourceUrl || d.url || '#',
      })) || [];

      if (results.length === 0) {
        setErrorMessage('未找到相关文档，请尝试其他关键词');
        return;
      }

      // 保存到数据库（关联到选中主题）
      let savedCount = 0;
      for (const doc of results) {
        try {
          const saveRes = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: doc.title,
              source: doc.source,
              source_url: doc.url,
              published_date: doc.date,
              collected_date: new Date().toISOString(),
              content: null,
              topic_id: selectedTopicId || null,
              metadata: { type: doc.type },
            }),
          });
          if (saveRes.ok) savedCount++;
        } catch (e) {
          // 跳过保存失败的
        }
      }

      setRecentFetched(results);
      setDedupMessage(`✓ 成功采集 ${results.length} 篇文档，保存 ${savedCount} 篇`);
      await loadData();
    } catch (error: any) {
      console.error("Search failed:", error);
      setErrorMessage(`采集失败: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('确定要删除此文档吗？')) return;
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  // 文件上传处理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件类型
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ];

    if (!supportedTypes.includes(file.type)) {
      setUploadError('不支持的文件类型。请上传 PDF、Word、TXT 或 Markdown 文件');
      setUploadedFile(null);
      return;
    }

    // 检查文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('文件大小不能超过 10MB');
      setUploadedFile(null);
      return;
    }

    setUploadError('');
    setUploadedFile({
      name: file.name,
      title: file.name.replace(/\.[^/.]+$/, ''), // 去除扩展名
      size: file.size,
    });
  };

  const handleFileUpload = async (analyze: boolean = false) => {
    if (!uploadedFile || !fileInputRef.current?.files?.[0]) return;

    const file = fileInputRef.current.files[0];
    setUploadingFile(uploadedFile.name);
    setUploadSuccess('');
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedTopicId) {
        formData.append('topicId', selectedTopicId);
      }

      const endpoint = analyze ? '/api/upload-and-analyze' : '/api/upload';
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }

      // 显示成功信息
      if (analyze) {
        setUploadSuccess(`✓ 文件 "${uploadedFile.title}" 上传成功并完成分析！`);
        if (data.extraction) {
          setUploadSuccess(prev => prev + ` 抽取结果: ${data.extraction.entities} 个实体, ${data.extraction.relations} 个关系, ${data.extraction.claims} 个主张, ${data.extraction.events} 个事件。`);
        }
      } else {
        setUploadSuccess(`✓ 文件 "${uploadedFile.title}" 上传成功！提取了 ${data.contentLength} 个字符。`);
      }

      // 清空文件选择
      setUploadedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // 刷新文档列表
      await loadData();
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploadError(`上传失败: ${error.message}`);
    } finally {
      setUploadingFile(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredDocuments = selectedTopicId
    ? dbDocuments.filter((d: any) => d.topic_id === selectedTopicId)
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
              使用数据采集功能前，请先在「设置」页面配置 AI API Key。
            </p>
          </div>
        </div>
      )}

      {/* Internal Document Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Upload className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">内部文档上传</h3>
            <p className="text-sm text-gray-500">支持 PDF、Word、TXT、Markdown 文件（最大 10MB）</p>
          </div>
        </div>

        {/* File Input */}
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <FileText className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-gray-700 font-medium">点击选择文件或拖拽到此处</p>
            <p className="text-sm text-gray-500 mt-1">PDF、DOCX、DOC、TXT、MD</p>
          </label>
        </div>

        {/* Selected File Info */}
        {uploadedFile && (
          <div className="mt-4 bg-indigo-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-indigo-600" />
                <div>
                  <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                  <p className="text-sm text-gray-500">标题: {uploadedFile.title} • 大小: {formatFileSize(uploadedFile.size)}</p>
                </div>
              </div>
              <button
                onClick={() => { setUploadedFile(null); setUploadError(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {uploadError}
          </div>
        )}

        {/* Upload Success */}
        {uploadSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {uploadSuccess}
          </div>
        )}

        {/* Upload Actions */}
        {uploadedFile && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => handleFileUpload(false)}
              disabled={uploadingFile !== null}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingFile ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  上传文档
                </>
              )}
            </button>
            <button
              onClick={() => handleFileUpload(true)}
              disabled={uploadingFile !== null}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingFile ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  上传并分析
                </>
              )}
            </button>
          </div>
        )}
      </div>

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
            <label className="block text-sm font-medium text-gray-700 mb-1">搜索词（可选，留空用主题名）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="输入关键词"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || aiConfigured === false}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
            {errorMessage}
          </div>
        )}
        {dedupMessage && !errorMessage && (
          <div className="mt-4 p-3 rounded-lg text-sm bg-green-50 text-green-800 border border-green-200">
            {dedupMessage}
          </div>
        )}

        {/* Recent Results */}
        {recentFetched.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">本次采集结果：</h4>
            {recentFetched.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg p-3">
                <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">{doc.type}</span>
                <span className="flex-1 truncate">{doc.title}</span>
                <span className="text-gray-400">{doc.source}</span>
                <span className="text-gray-400">{doc.date}</span>
                {doc.url && doc.url !== '#' && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
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
                filteredDocuments.map((doc: any) => (
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
