import { useState, useEffect } from 'react';
import { FileText, Calendar, Trash2, ChevronDown, ChevronUp, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import EmptyState from '../components/EmptyState';
import { fetchTopics } from '../services/topicService';
import { CARD, SPINNER } from '../lib/design';

interface Report {
  id: string;
  title: string;
  type: string;
  summary?: string;
  content?: { keyFindings?: string[] };
  generated_at?: string;
  topic_name?: string;
  topic_id?: string;
  metadata?: { documentSummary?: { total: number; dateRange: string } };
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skillStatus, setSkillStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportsRes, topicsData] = await Promise.all([fetch('/api/reports'), fetchTopics()]);
      setReports(reportsRes.ok ? await reportsRes.json() : []);
      setTopics(topicsData);
      if (topicsData.length > 0 && !selectedTopicId) setSelectedTopicId(topicsData[0].id);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedTopicId || skillStatus === 'running') return;
    const topic = topics.find(t => t.id === selectedTopicId);
    if (!topic) return;

    setSkillStatus('running');
    try {
      const res = await fetch('/api/skill/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopicId,
          topicName: topic.name,
          reportType: 'weekly',
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || '启动失败');

      const { executionId } = await res.json();

      const poll = async () => {
        try {
          const statusRes = await fetch(`/api/skill/${executionId}/status`);
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.status === 'completed') {
              setSkillStatus('completed');
              await loadData();
              setTimeout(() => setSkillStatus('idle'), 3000);
              return;
            } else if (status.status === 'failed') {
              setSkillStatus('failed');
              return;
            }
          }
        } catch { /* ignore */ }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 2000);
    } catch (error: any) {
      setSkillStatus('failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此报告？')) return;
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      await loadData();
    } catch {
      alert('删除报告失败');
    }
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = { weekly: '周报', special: '专题', alert: '预警', executive_summary: '摘要' };
    return map[type] || type;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="分析报告" description="基于采集文档自动生成技术情报分析报告">
        <select
          value={selectedTopicId}
          onChange={e => setSelectedTopicId(e.target.value)}
          className="px-3.5 py-2 bg-[#f5f5f7] rounded-xl text-sm focus:bg-white transition-all"
        >
          <option value="">选择主题...</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <SkillButton onClick={handleGenerateReport} status={skillStatus} disabled={!selectedTopicId}>
          生成周报
        </SkillButton>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className={SPINNER} />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="暂无报告"
          description="选择主题后点击生成周报按钮，系统将基于采集文档自动生成分析报告"
        />
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const isExpanded = expandedId === report.id;
            return (
              <div key={report.id} className={`${CARD} overflow-hidden transition-all duration-200`}>
                <div
                  className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-[#f5f5f7]/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-[#0071e3]/10 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-[#0071e3]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-[#1d1d1f] truncate">{report.title}</h4>
                      <div className="mt-1 flex items-center gap-3 text-xs text-[#86868b]">
                        <span className="px-2 py-0.5 bg-[#f5f5f7] rounded-full">{getTypeLabel(report.type)}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {report.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : '-'}
                        </span>
                        {report.topic_name && <span>{report.topic_name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                      className="p-2 text-[#aeaeb5] hover:text-[#ff3b30] rounded-full hover:bg-[#ff3b30]/5 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#aeaeb5]" /> : <ChevronDown className="w-4 h-4 text-[#aeaeb5]" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-[#f5f5f7] animate-fade-in">
                    {report.summary && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-[#86868b] mb-1.5">概要</h5>
                        <p className="text-sm text-[#1d1d1f] leading-relaxed">{report.summary}</p>
                      </div>
                    )}
                    {report.content?.keyFindings?.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-[#86868b] mb-1.5">关键发现</h5>
                        <ul className="space-y-1.5">
                          {report.content.keyFindings.map((f: string, i: number) => (
                            <li key={i} className="text-sm text-[#1d1d1f] flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3] mt-1.5 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      {report.metadata?.documentSummary && (
                        <div className="bg-[#f5f5f7] rounded-xl px-4 py-3 text-sm text-[#86868b]">
                          文档总数: {report.metadata.documentSummary.total} · 时间范围: {report.metadata.documentSummary.dateRange}
                        </div>
                      )}
                      {report.topic_id && (
                        <Link
                          to={`/graph?topicId=${report.topic_id}`}
                          className="flex items-center gap-1.5 text-sm text-[#0071e3] hover:text-[#0062cc] transition-colors"
                        >
                          <Network className="w-4 h-4" />
                          查看图谱
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
