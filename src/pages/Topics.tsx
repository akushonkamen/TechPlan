import type { FormEvent, ChangeEvent } from 'react';
import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Tags, Upload, FileText, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { Topic } from '../types';
import TopicForm from '../components/TopicForm';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { CARD, BTN_PRIMARY, SPINNER } from '../lib/design';

export default function Topics() {
  const [searchTerm, setSearchTerm] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Per-topic document counts + expanded state
  const [topicDocCounts, setTopicDocCounts] = useState<Record<string, number>>({});
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [topicDocs, setTopicDocs] = useState<{ id: string; title: string; published_date?: string; source?: string; source_url?: string }[]>([]);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; title: string; size: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadTopicId, setUploadTopicId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    keywords: '',
    organizations: '',
    schedule: 'daily' as 'daily' | 'weekly' | 'disabled',
    dailyReportEnabled: false,
    weeklyReportEnabled: true,
    monthlyReportEnabled: false,
    quarterlyReportEnabled: false,
  });

  useEffect(() => { fetchTopics(); }, []);

  const fetchTopics = async () => {
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        // Fetch doc counts for each topic
        const counts: Record<string, number> = {};
        await Promise.all(data.map(async (t: Topic) => {
          try {
            const docRes = await fetch(`/api/documents?topic_id=${t.id}`);
            if (docRes.ok) {
              const docs = await docRes.json();
              counts[t.id] = Array.isArray(docs) ? docs.length : 0;
            }
          } catch { counts[t.id] = 0; }
        }));
        setTopicDocCounts(counts);
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTopicDocs = async (topicId: string) => {
    try {
      const res = await fetch(`/api/documents?topic_id=${topicId}`);
      if (res.ok) setTopicDocs(await res.json());
    } catch (error) {
      console.error('Failed to fetch topic documents:', error);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', priority: 'medium', keywords: '', organizations: '', schedule: 'daily', dailyReportEnabled: false, weeklyReportEnabled: true, monthlyReportEnabled: false, quarterlyReportEnabled: false });
    setEditingTopicId(null);
  };

  const openCreateModal = () => { resetForm(); setModalMode('create'); setIsModalOpen(true); };

  const openEditModal = (topic: Topic) => {
    setFormData({
      name: topic.name,
      description: topic.description,
      priority: topic.priority,
      keywords: topic.keywords.join(', '),
      organizations: topic.organizations.join(', '),
      schedule: topic.schedule === 'daily' || topic.schedule === 'weekly' ? topic.schedule : 'daily',
      dailyReportEnabled: topic.dailyReportEnabled,
      weeklyReportEnabled: topic.weeklyReportEnabled,
      monthlyReportEnabled: topic.monthlyReportEnabled,
      quarterlyReportEnabled: topic.quarterlyReportEnabled,
    });
    setEditingTopicId(topic.id);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
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
        schedule: formData.schedule,
        dailyReportEnabled: formData.dailyReportEnabled,
        weeklyReportEnabled: formData.weeklyReportEnabled,
        monthlyReportEnabled: formData.monthlyReportEnabled,
        quarterlyReportEnabled: formData.quarterlyReportEnabled,
      };

      if (modalMode === 'create') {
        const newTopic: Topic = { ...topicData, id: Date.now().toString() };
        const res = await fetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTopic) });
        if (res.ok) { setTopics([(await res.json()), ...topics]); setIsModalOpen(false); resetForm(); }
        else throw new Error('Failed to create topic');
      } else if (editingTopicId) {
        const res = await fetch(`/api/topics/${editingTopicId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...topicData, id: editingTopicId }) });
        if (res.ok) { const result = await res.json(); setTopics(topics.map(t => t.id === editingTopicId ? result : t)); setIsModalOpen(false); resetForm(); }
        else throw new Error('Failed to update topic');
      }
    } catch (error) {
      console.error('Failed to save topic:', error);
      alert(modalMode === 'create' ? '创建主题失败' : '更新主题失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try {
      await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      setTopics(topics.filter(t => t.id !== id));
    } catch { alert('删除失败'); }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('确定删除此文档？')) return;
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (expandedTopicId) fetchTopicDocs(expandedTopicId);
      fetchTopics();
    } catch {
      alert('删除文档失败');
    }
  };

  // File upload logic
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const supported = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown'];
    if (!supported.includes(file.type)) { setUploadError('不支持的文件类型'); setUploadedFile(null); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('文件大小不能超过 10MB'); setUploadedFile(null); return; }
    setUploadError('');
    setUploadedFile({ name: file.name, title: file.name.replace(/\.[^/.]+$/, ''), size: file.size });
  };

  const handleFileUpload = async () => {
    if (!uploadedFile || !fileInputRef.current?.files?.[0] || !uploadTopicId) return;
    const file = fileInputRef.current.files[0];
    setUploadingFile(uploadedFile.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('topicId', uploadTopicId);
      const endpoint = '/api/upload';
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json()).error || '上传失败');
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTopics();
      if (expandedTopicId) await fetchTopicDocs(expandedTopicId);
    } catch (error: unknown) {
      setUploadError(`上传失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploadingFile(null);
    }
  };

  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const toggleExpand = (topicId: string) => {
    if (expandedTopicId === topicId) {
      setExpandedTopicId(null);
      setTopicDocs([]);
    } else {
      setExpandedTopicId(topicId);
      setUploadTopicId(topicId);
      fetchTopicDocs(topicId);
    }
  };

  const filteredTopics = topics.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.keywords.some(k => k.toLowerCase().includes(searchTerm.toLowerCase())) ||
    t.organizations.some(o => o.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const priorityColors: Record<string, string> = {
    high: 'bg-[#A0453A]/10 text-[#A0453A]',
    medium: 'bg-[#9C7B3C]/10 text-[#9C7B3C]',
    low: 'bg-[#5B7553]/10 text-[#5B7553]',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <PageHeader title="主题追踪" description="管理技术追踪主题，查看文档，设置优先级和关键词">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888]" />
          <input
            type="text"
            placeholder="搜索主题..."
            className="pl-9 pr-4 py-2 bg-[#F7F7F7] rounded-full text-sm w-full sm:w-56 focus:bg-white transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={openCreateModal}
          className={`flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
        >
          <Plus className="w-4 h-4" />
          新建主题
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className={SPINNER} />
        </div>
      ) : filteredTopics.length === 0 ? (
        <EmptyState
          icon={<Tags className="w-12 h-12" />}
          title="暂无主题"
          description="创建一个技术追踪主题，开始文档管理和报告生成"
          action={
            <button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-2 bg-[#1d1d1f] text-white rounded-[980px] text-sm font-medium hover:bg-[#1a1a1a] transition-all">
              <Plus className="w-4 h-4" />新建主题
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopics.map(topic => {
            const isExpanded = expandedTopicId === topic.id;
            const docCount = topicDocCounts[topic.id] ?? 0;
            return (
              <div key={topic.id} className={`${CARD} overflow-hidden border border-[#1d1d1f]/30 transition-all group ${isExpanded ? 'md:col-span-2 lg:col-span-3' : ''}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-[#1d1d1f] truncate">{topic.name}</h3>
                      <p className="text-xs text-[#888] mt-1 line-clamp-2">{topic.description}</p>
                    </div>
                    <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[topic.priority]}`}>
                      {topic.priority === 'high' ? '高' : topic.priority === 'medium' ? '中' : '低'}
                    </span>
                  </div>

                  {/* Keywords */}
                  {topic.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {topic.keywords.slice(0, 3).map(kw => (
                        <span key={kw} className="px-2 py-0.5 bg-[#F7F7F7] border border-[#1d1d1f]/20 rounded-full text-[10px] text-[#888]">{kw}</span>
                      ))}
                      {topic.keywords.length > 3 && (
                        <span className="px-2 py-0.5 bg-[#F7F7F7] rounded-full text-[10px] text-[#888]">+{topic.keywords.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Organizations */}
                  {topic.organizations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {topic.organizations.slice(0, 2).map(org => (
                        <span key={org} className="px-2 py-0.5 bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 rounded-full text-[10px] text-[#1d1d1f]">{org}</span>
                      ))}
                    </div>
                  )}

                  {/* Schedule + Report types */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${topic.schedule === 'disabled' ? 'bg-[#888]/10 text-[#888]' : 'bg-[#2A5A6B]/10 text-[#2A5A6B]'}`}>
                      {topic.schedule === 'daily' ? '日采集' : topic.schedule === 'weekly' ? '周采集' : '已停用'}
                    </span>
                    {topic.dailyReportEnabled && <span className="px-2 py-0.5 bg-[#9C7B3C]/10 text-[#9C7B3C] rounded-full text-[10px] font-medium">日报</span>}
                    {topic.weeklyReportEnabled && <span className="px-2 py-0.5 bg-[#5B7553]/10 text-[#5B7553] rounded-full text-[10px] font-medium">周报</span>}
                    {topic.monthlyReportEnabled && <span className="px-2 py-0.5 bg-[#2A5A6B]/10 text-[#2A5A6B] rounded-full text-[10px] font-medium">月报</span>}
                    {topic.quarterlyReportEnabled && <span className="px-2 py-0.5 bg-[#7B5EA7]/10 text-[#7B5EA7] rounded-full text-[10px] font-medium">季报</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#1d1d1f]/20">
                    <button
                      onClick={() => toggleExpand(topic.id)}
                      className="flex items-center gap-1 px-3 py-2 text-xs text-[#888] hover:text-[#1d1d1f] transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {docCount} 篇
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(topic)} className="p-2 text-[#888] hover:text-[#1d1d1f] rounded-full hover:bg-[#1d1d1f]/5 transition-all" title="编辑">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(topic.id)} className="p-2 text-[#888] hover:text-[#A0453A] rounded-full hover:bg-[#A0453A]/5 transition-all" title="删除" aria-label="删除主题">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Document list + Upload */}
                {isExpanded && (
                  <div className="border-t border-[#1d1d1f]/20 px-5 pb-5 pt-4 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Document list */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-medium text-[#888]">已采集文档</h4>
                          <span className="text-xs text-[#888]">{topicDocs.length} 篇</span>
                        </div>
                        {topicDocs.length === 0 ? (
                          <p className="text-xs text-[#888] py-4 text-center">暂无文档，请上传文件或生成报告</p>
                        ) : (
                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {topicDocs.map((doc: any) => (
                              <div key={doc.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-[#F7F7F7] transition-colors">
                                <FileText className="w-3.5 h-3.5 text-[#888] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-[#1d1d1f] truncate">{doc.title}</p>
                                  <span className="text-[10px] text-[#888]">{doc.published_date || doc.source || ''}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {doc.source_url && (
                                    <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="p-1 text-[#888] hover:text-[#1d1d1f] transition-colors">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                  <button onClick={() => handleDeleteDocument(doc.id)} className="p-1 text-[#888] hover:text-[#A0453A] transition-colors" aria-label="删除文档">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Upload area */}
                      <div>
                        <h4 className="text-xs font-medium text-[#888] mb-3">上传文档</h4>
                        <div
                          className="border-2 border-dashed border-[#1d1d1f]/30 rounded-xl p-5 text-center hover:border-[#1d1d1f] transition-colors cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={handleFileSelect} className="hidden" />
                          <Upload className="w-6 h-6 text-[#888] mx-auto mb-2" />
                          <p className="text-xs text-[#888]">PDF、Word、TXT、Markdown</p>
                        </div>

                        {uploadedFile && (
                          <div className="mt-3 bg-[#F7F7F7] rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[#1d1d1f] truncate">{uploadedFile.name}</p>
                                <p className="text-[10px] text-[#888]">{formatSize(uploadedFile.size)}</p>
                              </div>
                              <button onClick={() => { setUploadedFile(null); setUploadError(''); }} className="text-[#888] hover:text-[#888]">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="mt-2">
                              <button onClick={() => handleFileUpload()} disabled={uploadingFile !== null} className="w-full py-1.5 text-xs font-medium bg-[#1d1d1f] text-white rounded-full hover:bg-[#1a1a1a] transition-all disabled:opacity-40">
                                {uploadingFile ? '上传中...' : '上传'}
                              </button>
                            </div>
                          </div>
                        )}

                        {uploadError && <p className="mt-2 text-[10px] text-[#A0453A]">{uploadError}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Topic Form Modal */}
      <TopicForm
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        onSubmit={handleSubmit}
        formData={formData}
        onFormDataChange={setFormData}
        isSubmitting={isSubmitting}
        mode={modalMode}
      />
    </div>
  );
}
