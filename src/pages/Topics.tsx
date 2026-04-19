import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, Play, X, Loader2, ExternalLink } from 'lucide-react';
import type { Topic } from '../types';
import { fetchRealTimeTechNews, FetchedDocument } from '../services/agentService';
import TopicForm from '../components/TopicForm';

export default function Topics() {
  const [searchTerm, setSearchTerm] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Research state
  const [researchingTopicId, setResearchingTopicId] = useState<string | null>(null);
  const [researchResults, setResearchResults] = useState<{ topicName: string; docs: FetchedDocument[] } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    keywords: '',
    organizations: '',
    schedule: 'weekly' as 'daily' | 'weekly' | 'monthly'
  });

  useEffect(() => {
    fetchTopics();
  }, []);

  const fetchTopics = async () => {
    try {
      const response = await fetch('/api/topics');
      if (response.ok) {
        const data = await response.json();
        setTopics(data);
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      priority: 'medium',
      keywords: '',
      organizations: '',
      schedule: 'weekly'
    });
    setEditingTopicId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openEditModal = (topic: Topic) => {
    setFormData({
      name: topic.name,
      description: topic.description,
      priority: topic.priority,
      keywords: topic.keywords.join(', '),
      organizations: topic.organizations.join(', '),
      schedule: topic.schedule
    });
    setEditingTopicId(topic.id);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const topicData = {
        name: formData.name,
        description: formData.description,
        aliases: [] as string[],
        owner: '当前用户',
        priority: formData.priority,
        scope: '全球',
        createdAt: new Date().toISOString().split('T')[0],
        keywords: formData.keywords.split(/[,，]/).map(k => k.trim()).filter(Boolean),
        organizations: formData.organizations.split(/[,，]/).map(o => o.trim()).filter(Boolean),
        schedule: formData.schedule
      };

      if (modalMode === 'create') {
        const newTopic: Topic = {
          ...topicData,
          id: Date.now().toString()
        };

        const response = await fetch('/api/topics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTopic),
        });

        if (response.ok) {
          const result = await response.json();
          setTopics([result, ...topics]);
          setIsModalOpen(false);
          resetForm();
        } else {
          throw new Error('Failed to create topic');
        }
      } else {
        // Edit mode
        if (!editingTopicId) return;

        const updatedTopic: Topic = {
          ...topicData,
          id: editingTopicId
        };

        const response = await fetch(`/api/topics/${editingTopicId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedTopic),
        });

        if (response.ok) {
          const result = await response.json();
          setTopics(topics.map(t => t.id === editingTopicId ? result : t));
          setIsModalOpen(false);
          resetForm();
        } else {
          throw new Error('Failed to update topic');
        }
      }
    } catch (error) {
      console.error('Failed to save topic:', error);
      alert(modalMode === 'create' ? '创建主题失败，请重试。' : '更新主题失败，请重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个主题吗？')) return;

    try {
      const response = await fetch(`/api/topics/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTopics(topics.filter(t => t.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete topic:', error);
      alert('删除主题失败，请重试。');
    }
  };

  const handleResearch = async (topic: Topic) => {
    setResearchingTopicId(topic.id);
    try {
      const docs = await fetchRealTimeTechNews(topic.name);
      setResearchResults({ topicName: topic.name, docs });
    } catch (error) {
      console.error("Research failed:", error);
      alert("检索失败，请检查网络或 API Key 配置。");
    } finally {
      setResearchingTopicId(null);
    }
  };

  const filteredTopics = topics.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.keywords.some(k => k.toLowerCase().includes(searchTerm.toLowerCase())) ||
    t.organizations.some(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">主题管理</h2>
          <p className="mt-1 text-sm text-gray-500">配置和管理需要持续追踪的技术主题台账。</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建主题
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索主题名称、关键词或机构..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">所有优先级</option>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">主题名称</th>
                <th className="px-6 py-3">优先级</th>
                <th className="px-6 py-3">核心关键词</th>
                <th className="px-6 py-3">关注机构</th>
                <th className="px-6 py-3">采集频率</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTopics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    没有找到匹配的主题
                  </td>
                </tr>
              ) : (
                filteredTopics.map((topic) => (
                  <tr key={topic.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{topic.name}</div>
                      <div className="text-xs text-gray-500 mt-1 line-clamp-1">{topic.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                        topic.priority === 'high' ? 'bg-red-50 text-red-700' :
                        topic.priority === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-green-50 text-green-700'
                      }`}>
                        {topic.priority === 'high' ? '高' : topic.priority === 'medium' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {topic.keywords.slice(0, 2).map(kw => (
                          <span key={kw} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{kw}</span>
                        ))}
                        {topic.keywords.length > 2 && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">+{topic.keywords.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {topic.organizations.slice(0, 2).map(org => (
                          <span key={org} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">{org}</span>
                        ))}
                        {topic.organizations.length > 2 && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">+{topic.organizations.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-600">
                        {topic.schedule === 'daily' ? '每日' : topic.schedule === 'weekly' ? '每周' : '每月'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleResearch(topic)}
                          disabled={researchingTopicId === topic.id}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                          title="按需采集"
                        >
                          {researchingTopicId === topic.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => openEditModal(topic)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(topic.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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

      {/* Topic Form Modal (reused for create and edit) */}
      <TopicForm
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        onSubmit={handleSubmit}
        formData={formData}
        onFormDataChange={setFormData}
        isSubmitting={isSubmitting}
        mode={modalMode}
      />

      {/* Research Results Modal */}
      {researchResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">检索完成：{researchResults.topicName}</h3>
                <p className="text-sm text-gray-500 mt-1">共发现 {researchResults.docs.length} 条最新高价值情报，已自动沉淀至知识图谱。</p>
              </div>
              <button
                onClick={() => setResearchResults(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
              {researchResults.docs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  未检索到相关最新情报，请稍后再试或调整主题关键词。
                </div>
              ) : (
                <div className="space-y-4">
                  {researchResults.docs.map((doc, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="font-medium text-gray-900 leading-snug">{doc.title}</h4>
                        <span className="shrink-0 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded font-medium">
                          {doc.type}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3 text-gray-500">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                            {doc.source}
                          </span>
                          <span>{doc.date}</span>
                        </div>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          查看原文 <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setResearchResults(null)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                关闭
              </button>
              <a
                href="/data-sources"
                className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                前往数据源管理
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
