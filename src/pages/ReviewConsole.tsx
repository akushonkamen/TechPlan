import { useState, useEffect } from 'react';
import { Check, X, AlertCircle, MessageSquareWarning, ExternalLink, RefreshCw } from 'lucide-react';

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
      }
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setProcessingId(null);
    }
  }

  function getTypeStyle(type: string) {
    switch (type) {
      case 'conflict_resolve':
        return 'bg-[#ff3b30]/5 text-[#ff3b30] border border-[#ff3b30]/10';
      case 'entity_disambig':
        return 'bg-[#0071e3]/5 text-[#0071e3] border border-[#0071e3]/10';
      default:
        return 'bg-[#ff9f0a]/5 text-[#ff9f0a] border border-[#ff9f0a]/10';
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">审核台</h2>
          <p className="mt-1 text-sm text-[#86868b]">人工复核低置信度抽取结果、实体消歧与矛盾证据。</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#86868b] border border-[#d2d2d7] rounded-lg hover:bg-[#f5f5f7] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#86868b]">待处理任务:</span>
            <span className="bg-[#ff3b30]/10 text-[#ff3b30] font-bold px-2 py-0.5 rounded-full">
              {stats?.total || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-[#f5f5f7] flex justify-between items-center bg-[#f5f5f7]/50">
          <div className="flex gap-4">
            {[
              { key: null, label: '全部待办' },
              { key: 'entity_disambig', label: `实体消歧 (${stats?.entityDisambig || 0})` },
              { key: 'claim_review', label: `主张审核 (${stats?.claimReview || 0})` },
              { key: 'conflict_resolve', label: `矛盾处理 (${stats?.conflictResolve || 0})` },
            ].map(({ key, label }) => (
              <button
                key={key ?? 'all'}
                className={`text-sm font-medium pb-4 -mb-4 transition-colors ${activeFilter === key ? 'text-[#0071e3] border-b-2 border-[#0071e3]' : 'text-[#86868b] hover:text-[#1d1d1f]'}`}
                onClick={() => setActiveFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#aeaeb5]">
            加载中...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-[#aeaeb5]">
            <Check className="w-12 h-12 mx-auto mb-4 text-[#34c759]" />
            <p>暂无待审核任务</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f7]">
            {reviews.map((review) => (
              <div key={review.id} className="p-6 hover:bg-[#f5f5f7]/50 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getTypeStyle(review.type)}`}>
                      {typeLabels[review.type] || review.type}
                    </span>
                    <span className="text-sm font-medium text-[#1d1d1f]">{review.topic_name || '未分类'}</span>
                    <span className="text-xs text-[#86868b]">{review.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject(review.id)}
                      disabled={processingId === review.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#d2d2d7] text-[#1d1d1f] rounded-lg hover:bg-[#ff3b30]/5 hover:text-[#ff3b30] hover:border-[#ff3b30]/20 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> 拒绝/修正
                    </button>
                    <button
                      onClick={() => handleApprove(review.id)}
                      disabled={processingId === review.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0071e3] text-white rounded-lg hover:bg-[#0062cc] transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> 通过并入库
                    </button>
                  </div>
                </div>

                <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl p-4 mb-3">
                  <p className="text-sm text-[#1d1d1f] font-medium">{review.content}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="text-[#86868b] flex items-center gap-1">
                      来源:
                      {review.source_url ? (
                        <a
                          href={review.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0071e3] hover:text-[#0062cc] hover:underline flex items-center gap-0.5"
                        >
                          {review.source} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#1d1d1f]">{review.source || '未知'}</span>
                      )}
                    </span>
                    <span className="text-[#86868b]">
                      模型置信度:{' '}
                      <span className={review.confidence < 0.7 ? 'text-[#ff9f0a] font-medium' : 'text-[#34c759] font-medium'}>
                        {(review.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </div>

                {review.reason && (
                  <div className="flex items-start gap-2 text-sm text-[#ff9f0a] bg-[#ff9f0a]/5 p-3 rounded-xl border border-[#ff9f0a]/10">
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
    </div>
  );
}
