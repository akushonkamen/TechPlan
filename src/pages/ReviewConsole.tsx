import { useState, useEffect, useRef } from 'react';
import { Check, X, AlertCircle, MessageSquareWarning, ExternalLink, RefreshCw, CheckCheck } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { CARD, TOAST_SUCCESS, TOAST_ERROR, SEGMENT_TRACK, SEGMENT_ACTIVE, SEGMENT_INACTIVE } from '../lib/design';

interface Review {
  id: string;
  type: string;
  topic_id: string;
  topic_name: string;
  source: string;
  source_url: string;
  content: string;
  confidence: number;
  reason: string;
  status: string;
  time: string;
}

interface ReviewStats {
  total: number;
  entityDisambig: number;
  claimReview: number;
  conflictResolve: number;
}

const typeLabels: Record<string, string> = {
  'claim_review': 'Claim 抽取',
  'entity_disambig': '实体对齐',
  'conflict_resolve': '矛盾检测',
};

export default function ReviewConsole() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [archivedActions, setArchivedActions] = useState<Array<{ id: string; action: 'approve' | 'reject'; content: string; type: string; time: string }>>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchData();
  }, [activeFilter]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'pending' });
      if (activeFilter) {
        params.set('type', activeFilter);
      }

      const [reviewsRes, statsRes] = await Promise.all([
        fetch(`/api/reviews?${params}`),
        fetch('/api/reviews/stats'),
      ]);

      if (reviewsRes.ok) {
        setReviews(await reviewsRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/reviews/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });

      if (res.ok) {
        setReviews(reviews.filter(r => r.id !== id));
        if (stats) {
          setStats({ ...stats, total: stats.total - 1 });
        }
        const review = reviews.find(r => r.id === id);
        if (review) {
          setArchivedActions(prev => [{ id, action: 'approve' as const, content: review.content.slice(0, 50), type: typeLabels[review.type] || review.type, time: new Date().toLocaleTimeString('zh-CN') }, ...prev].slice(0, 10));
        }
        showToast('已通过', 'success');
      }
    } catch (error) {
      console.error('Failed to approve:', error);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/reviews/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });

      if (res.ok) {
        setReviews(reviews.filter(r => r.id !== id));
        if (stats) {
          setStats({ ...stats, total: stats.total - 1 });
        }
        const review = reviews.find(r => r.id === id);
        if (review) {
          setArchivedActions(prev => [{ id, action: 'reject' as const, content: review.content.slice(0, 50), type: typeLabels[review.type] || review.type, time: new Date().toLocaleTimeString('zh-CN') }, ...prev].slice(0, 10));
        }
        showToast('已拒绝', 'success');
      }
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleApproveAll() {
    if (!confirm(`确认通过全部 ${reviews.length} 条记录？`)) return;
    setProcessingId('batch');
    try {
      await Promise.all(reviews.map(r => fetch(`/api/reviews/${r.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: '' }) })));
      showToast(`已通过 ${reviews.length} 条记录`, 'success');
      setReviews([]);
      if (stats) setStats({ ...stats, total: 0 });
    } catch {
      showToast('批量操作部分失败', 'error');
    } finally {
      setProcessingId(null);
      fetchData();
    }
  }

  function getTypeStyle(type: string) {
    switch (type) {
      case 'conflict_resolve':
        return 'bg-[#A0453A]/5 text-[#A0453A] border border-[#A0453A]/10';
      case 'entity_disambig':
        return 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 text-[#1d1d1f]';
      default:
        return 'bg-[#9C7B3C]/5 text-[#9C7B3C] border border-[#9C7B3C]/10';
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="审核台" description="人工复核低置信度抽取结果、实体消歧与矛盾证据">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#888]">待处理 <span className="bg-[#A0453A]/10 text-[#A0453A] font-semibold px-2 py-0.5 rounded-full">{stats?.total || 0}</span></span>
          <button onClick={fetchData} className="flex items-center gap-1.5 px-4 py-2 bg-[#F7F7F7] rounded-[980px] text-sm font-medium hover:bg-[#1d1d1f]/5 transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
          {reviews.length > 0 && (
            <button onClick={handleApproveAll} disabled={processingId === 'batch'} className="flex items-center gap-1.5 px-4 py-2 bg-[#5B7553] text-white rounded-[980px] text-sm font-semibold hover:bg-[#5B7553] transition-all disabled:opacity-50">
              <CheckCheck className="w-3.5 h-3.5" /> 全部通过 ({reviews.length})
            </button>
          )}
        </div>
      </PageHeader>

      <div className={`${CARD} overflow-hidden`}>
        <div className="p-4 border-b border-[#1d1d1f]/20">
          <div className={`inline-flex items-center gap-1 ${SEGMENT_TRACK}`}>
            {[
              { key: null as string | null, label: '全部待办' },
              { key: 'entity_disambig', label: `实体消歧 (${stats?.entityDisambig || 0})` },
              { key: 'claim_review', label: `主张审核 (${stats?.claimReview || 0})` },
              { key: 'conflict_resolve', label: `矛盾处理 (${stats?.conflictResolve || 0})` },
            ].map(({ key, label }) => (
              <button
                key={key ?? 'all'}
                onClick={() => setActiveFilter(key)}
                className={`px-3 py-1.5 text-sm font-medium transition-all ${activeFilter === key ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#aaa]">
            加载中...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-[#aaa]">
            <Check className="w-12 h-12 mx-auto mb-4 text-[#5B7553]" />
            <p>暂无待审核任务</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1d1d1f]/20">
            {reviews.map((review) => (
              <div key={review.id} className="p-6 hover:bg-[#1d1d1f]/5 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getTypeStyle(review.type)}`}>
                      {typeLabels[review.type] || review.type}
                    </span>
                    <span className="text-sm font-medium text-[#1d1d1f]">{review.topic_name || '未分类'}</span>
                    <span className="text-xs text-[#888]">{review.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rejectingId === review.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#A0453A]">确认拒绝？</span>
                        <button
                          onClick={() => { handleReject(review.id); setRejectingId(null); }}
                          disabled={processingId === review.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#A0453A] text-white rounded-[980px] text-xs font-semibold hover:bg-[#A0453A] transition-all disabled:opacity-50"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          className="px-2.5 py-1.5 bg-[#F7F7F7] text-[#1d1d1f] rounded-[980px] text-xs font-medium hover:bg-[#1d1d1f]/5 transition-all"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRejectingId(review.id)}
                        disabled={processingId === review.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F7F7] border border-[#1d1d1f]/30 text-[#1d1d1f] rounded-full hover:bg-[#A0453A]/5 hover:text-[#A0453A] hover:border-[#A0453A]/20 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> 拒绝/修正
                      </button>
                    )}
                    <button
                      onClick={() => handleApprove(review.id)}
                      disabled={processingId === review.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d1d1f] text-white rounded-[980px] hover:bg-[#1a1a1a] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> 通过并入库
                    </button>
                  </div>
                </div>

                <div className="bg-[#F7F7F7] border border-[#1d1d1f]/30 rounded-xl p-4 mb-3">
                  <p className="text-sm text-[#1d1d1f] font-medium">{review.content}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="text-[#888] flex items-center gap-1">
                      来源:
                      {review.source_url ? (
                        <a
                          href={review.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2A5A6B] hover:text-[#1E4A58] hover:underline flex items-center gap-0.5"
                        >
                          {review.source} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#1d1d1f]">{review.source || '未知'}</span>
                      )}
                    </span>
                    <span className="text-[#888]">
                      模型置信度:{' '}
                      <span className={review.confidence < 0.7 ? 'text-[#9C7B3C] font-medium' : 'text-[#5B7553] font-medium'}>
                        {(review.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </div>

                {review.reason && (
                  <div className="flex items-start gap-2 text-sm text-[#9C7B3C] bg-[#9C7B3C]/5 p-3 rounded-xl border border-[#9C7B3C]/10">
                    {review.type === 'conflict_resolve' ? (
                      <MessageSquareWarning className="w-4 h-4 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5" />
                    )}
                    <p>{review.reason}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {archivedActions.length > 0 && (
        <div className={`${CARD} p-5`}>
          <h4 className="text-[13px] font-semibold text-[#888] mb-3">最近操作</h4>
          <div className="space-y-2">
            {archivedActions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {a.action === 'approve' ? <Check className="w-3.5 h-3.5 text-[#5B7553]" /> : <X className="w-3.5 h-3.5 text-[#A0453A]" />}
                <span className="text-[#888]">{a.time}</span>
                <span className="text-[#1d1d1f]">{a.action === 'approve' ? '通过' : '拒绝'}了</span>
                <span className="text-[#888] truncate">"{a.content}"</span>
                <span className="text-xs text-[#aaa]">{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className={`animate-fade-in ${toast.type === 'success' ? TOAST_SUCCESS : TOAST_ERROR}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
