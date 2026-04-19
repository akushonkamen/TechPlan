import type { FormEvent, ChangeEvent } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Loader2, Tags, Upload, FileText, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { Topic } from '../types';
import TopicForm from '../components/TopicForm';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
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

  // Per-topic skill status tracking (3-step pipeline: research→extract→sync-graph)
  const [topicSkillStatus, setTopicSkillStatus] = useState<Record<string, 'idle' | 'researching' | 'extracting' | 'syncing' | 'completed' | 'failed'>>({});

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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    keywords: '',
    organizations: '',
    schedule: 'weekly' as 'daily' | 'weekly' | 'monthly',
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
    setFormData({ name: '', description: '', priority: 'medium', keywords: '', organizations: '', schedule: 'weekly' });
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
      schedule: topic.schedule,
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

  // Chain: research → extract → sync-graph (three-step pipeline)
  const handleCollect = useCallback(async (topic: Topic) => {
    setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'researching' }));

    try {
      // Step 1: Trigger research
      const researchRes = await fetch('/api/skill/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          topicName: topic.name,
          keywords: JSON.stringify(topic.keywords),
          organizations: JSON.stringify(topic.organizations),
          maxResults: 10,
        }),
      });

      if (!researchRes.ok) throw new Error('启动采集失败');
      const { executionId: researchId } = await researchRes.json();

      // Poll until research completes
      await new Promise<void>((resolve, reject) => {
        const poll = async () => {
          try {
            const res = await fetch(`/api/skill/${researchId}/status`);
            if (res.ok) {
              const status = await res.json();
              if (status.status === 'completed') { resolve(); return; }
              if (status.status === 'failed') { reject(new Error('采集失败')); return; }
            }
          } catch { /* ignore */ }
          setTimeout(poll, 3000);
        };
        setTimeout(poll, 3000);
      });

      // Step 2: Trigger extract
      setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'extracting' }));
      const extractRes = await fetch('/api/skill/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          extractTypes: 'entities,relations,claims,events',
        }),
      });

      if (!extractRes.ok) throw new Error('启动抽取失败');
      const { executionId: extractId } = await extractRes.json();

      await new Promise<void>((resolve, reject) => {
        const poll = async () => {
          try {
            const res = await fetch(`/api/skill/${extractId}/status`);
            if (res.ok) {
              const status = await res.json();
              if (status.status === 'completed') { resolve(); return; }
              if (status.status === 'failed') { reject(new Error('抽取失败')); return; }
            }
          } catch { /* ignore */ }
          setTimeout(poll, 3000);
        };
        setTimeout(poll, 3000);
      });

      // Step 3: Auto-trigger sync-graph
      setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'syncing' }));
      const syncRes = await fetch('/api/skill/sync-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: topic.id }),
      });

      if (syncRes.ok) {
        const { executionId: syncId } = await syncRes.json();
        await new Promise<void>((resolve) => {
          const poll = async () => {
            try {
              const res = await fetch(`/api/skill/${syncId}/status`);
              if (res.ok) {
                const status = await res.json();
                if (status.status === 'completed' || status.status === 'failed') { resolve(); return; }
              }
            } catch { /* ignore */ }
            setTimeout(poll, 3000);
          };
          setTimeout(poll, 3000);
        });
      }

      setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'completed' }));
      await fetchTopics();
      if (expandedTopicId === topic.id) await fetchTopicDocs(topic.id);
      setTimeout(() => {
        setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'idle' }));
      }, 3000);
    } catch (error) {
      setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'failed' }));
      setTimeout(() => {
        setTopicSkillStatus(prev => ({ ...prev, [topic.id]: 'idle' }));
      }, 3000);
    }
  }, [expandedTopicId]);

  // File upload logic (from DataSources)
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const supported = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown'];
    if (!supported.includes(file.type)) { setUploadError('不支持的文件类型'); setUploadedFile(null); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('文件大小不能超过 10MB'); setUploadedFile(null); return; }
    setUploadError('');
    setUploadedFile({ name: file.name, title: file.name.replace(/\.[^/.]+$/, ''), size: file.size });
  };

  const handleFileUpload = async (analyze: boolean) => {
    if (!uploadedFile || !fileInputRef.current?.files?.[0] || !uploadTopicId) return;
    const file = fileInputRef.current.files[0];
    setUploadingFile(uploadedFile.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('topicId', uploadTopicId);
      const endpoint = analyze ? '/api/upload-and-analyze' : '/api/upload';
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json()).error || '上传失败');
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchTopics();
      if (expandedTopicId) await fetchTopicDocs(expandedTopicId);

      // If analyze, also trigger extract → sync-graph chain
      if (analyze && uploadTopicId) {
        setTopicSkillStatus(prev => ({ ...prev, [uploadTopicId]: 'extracting' }));
        const extractRes = await fetch('/api/skill/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: uploadTopicId, extractTypes: 'entities,relations,claims,events' }),
        });
        if (extractRes.ok) {
          const { executionId } = await extractRes.json();
          await new Promise<void>(resolve => {
            const poll = async () => {
              const s = await fetch(`/api/skill/${executionId}/status`);
              if (s.ok) { const d = await s.json(); if (d.status === 'completed' || d.status === 'failed') { resolve(); return; } }
              setTimeout(poll, 3000);
            };
            setTimeout(poll, 3000);
          });
        }

        // Auto sync-graph
        const syncRes = await fetch('/api/skill/sync-graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: uploadTopicId }),
        });
        if (syncRes.ok) {
          const { executionId } = await syncRes.json();
          await new Promise<void>(resolve => {
            const poll = async () => {
              const s = await fetch(`/api/skill/${executionId}/status`);
              if (s.ok) { const d = await s.json(); if (d.status === 'completed' || d.status === 'failed') { resolve(); return; } }
              setTimeout(poll, 3000);
            };
            setTimeout(poll, 3000);
          });
        }

        setTopicSkillStatus(prev => ({ ...prev, [uploadTopicId]: 'completed' }));
        setTimeout(() => setTopicSkillStatus(prev => ({ ...prev, [uploadTopicId]: 'idle' })), 3000);
      }
    } catch (error: any) {
      setUploadError(`上传失败: ${error.message}`);
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
    high: 'bg-[#ff3b30]/10 text-[#ff3b30]',
    medium: 'bg-[#ff9f0a]/10 text-[#ff9f0a]',
    low: 'bg-[#34c759]/10 text-[#34c759]',
  };

  const getSkillButtonStatus = (topicId: string): 'idle' | 'running' | 'completed' | 'failed' => {
    const s = topicSkillStatus[topicId];
    if (s === 'researching' || s === 'extracting' || s === 'syncing') return 'running';
    if (s === 'completed') return 'completed';
    if (s === 'failed') return 'failed';
    return 'idle';
  };

  const getSkillButtonLabel = (topicId: string): string => {
    const s = topicSkillStatus[topicId];
    if (s === 'researching') return '采集中...';
    if (s === 'extracting') return '抽取中...';
    if (s === 'syncing') return '同步图谱...';
    if (s === 'completed') return '已完成';
    if (s === 'failed') return '重试';
    return '采集';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="主题追踪" description="管理技术主题、采集文档、自动提取知识并同步图谱">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb5]" />
          <input
            type="text"
            placeholder="搜索主题..."
            className="pl-9 pr-4 py-2 bg-[#f5f5f7] rounded-full text-sm w-56 focus:bg-white transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={openCreateModal}
          className={`flex items-center gap-2 ${BTN_PRIMARY}`}
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
          description="创建一个技术追踪主题，开始自动化情报采集"
          action={
            <button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-2 bg-[#0071e3] text-white rounded-full text-sm font-medium hover:bg-[#0062cc] transition-all">
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
              <div key={topic.id} className={`${CARD} overflow-hidden hover:shadow-md transition-all group ${isExpanded ? 'md:col-span-2 lg:col-span-3' : ''}`}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-[#1d1d1f] truncate">{topic.name}</h3>
                      <p className="text-xs text-[#86868b] mt-1 line-clamp-2">{topic.description}</p>
                    </div>
                    <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[topic.priority]}`}>
                      {topic.priority === 'high' ? '高' : topic.priority === 'medium' ? '中' : '低'}
                    </span>
                  </div>

                  {/* Keywords */}
                  {topic.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {topic.keywords.slice(0, 3).map(kw => (
                        <span key={kw} className="px-2 py-0.5 bg-[#f5f5f7] rounded-full text-[10px] text-[#86868b]">{kw}</span>
                      ))}
                      {topic.keywords.length > 3 && (
                        <span className="px-2 py-0.5 bg-[#f5f5f7] rounded-full text-[10px] text-[#aeaeb5]">+{topic.keywords.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Organizations */}
                  {topic.organizations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {topic.organizations.slice(0, 2).map(org => (
                        <span key={org} className="px-2 py-0.5 bg-[#0071e3]/5 rounded-full text-[10px] text-[#0071e3]">{org}</span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#d2d2d7]">
                    <div className="flex items-center gap-2">
                      <SkillButton
                        onClick={() => handleCollect(topic)}
                        status={getSkillButtonStatus(topic.id)}
                        variant="secondary"
                      >
                        {getSkillButtonLabel(topic.id)}
                      </SkillButton>
                      <button
                        onClick={() => toggleExpand(topic.id)}
                        className="flex items-center gap-1 px-3 py-2 text-xs text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {docCount} 篇
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(topic)} className="p-2 text-[#aeaeb5] hover:text-[#0071e3] rounded-full hover:bg-[#0071e3]/5 transition-all" title="编辑">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(topic.id)} className="p-2 text-[#aeaeb5] hover:text-[#ff3b30] rounded-full hover:bg-[#ff3b30]/5 transition-all" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Document list + Upload */}
                {isExpanded && (
                  <div className="border-t border-[#d2d2d7] px-5 pb-5 pt-4 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Document list */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-medium text-[#86868b]">已采集文档</h4>
                          <span className="text-xs text-[#aeaeb5]">{topicDocs.length} 篇</span>
                        </div>
                        {topicDocs.length === 0 ? (
                          <p className="text-xs text-[#aeaeb5] py-4 text-center">暂无文档，点击「采集」或上传文件</p>
                        ) : (
                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {topicDocs.map((doc: any) => (
                              <div key={doc.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-[#f5f5f7] transition-colors">
                                <FileText className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-[#1d1d1f] truncate">{doc.title}</p>
                                  <span className="text-[10px] text-[#aeaeb5]">{doc.published_date || doc.source || ''}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {doc.source_url && (
                                    <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="p-1 text-[#aeaeb5] hover:text-[#0071e3] transition-colors">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                  <button onClick={() => handleDeleteDocument(doc.id)} className="p-1 text-[#aeaeb5] hover:text-[#ff3b30] transition-colors">
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
                        <h4 className="text-xs font-medium text-[#86868b] mb-3">上传文档</h4>
                        <div
                          className="border-2 border-dashed border-[#d2d2d7] rounded-xl p-5 text-center hover:border-[#0071e3]/30 transition-colors cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={handleFileSelect} className="hidden" />
                          <Upload className="w-6 h-6 text-[#aeaeb5] mx-auto mb-2" />
                          <p className="text-xs text-[#86868b]">PDF、Word、TXT、Markdown</p>
                        </div>

                        {uploadedFile && (
                          <div className="mt-3 bg-[#f5f5f7] rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[#1d1d1f] truncate">{uploadedFile.name}</p>
                                <p className="text-[10px] text-[#86868b]">{formatSize(uploadedFile.size)}</p>
                              </div>
                              <button onClick={() => { setUploadedFile(null); setUploadError(''); }} className="text-[#aeaeb5] hover:text-[#86868b]">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => handleFileUpload(false)} disabled={uploadingFile !== null} className="flex-1 py-1.5 text-xs font-medium bg-white rounded-lg hover:bg-[#e8e8ed] transition-all disabled:opacity-40">
                                上传
                              </button>
                              <button onClick={() => handleFileUpload(true)} disabled={uploadingFile !== null} className="flex-1 py-1.5 text-xs font-medium bg-[#0071e3] text-white rounded-lg hover:bg-[#0062cc] transition-all disabled:opacity-40">
                                上传并分析
                              </button>
                            </div>
                          </div>
                        )}

                        {uploadError && <p className="mt-2 text-[10px] text-[#ff3b30]">{uploadError}</p>}
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
