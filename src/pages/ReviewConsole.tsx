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
        return 'bg-red-50 text-red-700 border border-red-100';
      case 'entity_disambig':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      default:
        return 'bg-amber-50 text-amber-700 border border-amber-100';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">审核台</h2>
          <p className="mt-1 text-sm text-gray-500">人工复核低置信度抽取结果、实体消歧与矛盾证据。</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">待处理任务:</span>
            <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
              {stats?.total || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="flex gap-4">
            <button
              className={`text-sm font-medium pb-4 -mb-4 ${activeFilter === null ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveFilter(null)}
            >
              全部待办
            </button>
            <button
              className={`text-sm font-medium pb-4 -mb-4 ${activeFilter === 'entity_disambig' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveFilter('entity_disambig')}
            >
              实体消歧 ({stats?.entityDisambig || 0})
            </button>
            <button
              className={`text-sm font-medium pb-4 -mb-4 ${activeFilter === 'claim_review' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveFilter('claim_review')}
            >
              主张审核 ({stats?.claimReview || 0})
            </button>
            <button
              className={`text-sm font-medium pb-4 -mb-4 ${activeFilter === 'conflict_resolve' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveFilter('conflict_resolve')}
            >
              矛盾处理 ({stats?.conflictResolve || 0})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            加载中...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Check className="w-12 h-12 mx-auto mb-4 text-green-300" />
            <p>暂无待审核任务</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {reviews.map((review) => (
              <div key={review.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getTypeStyle(review.type)}`}>
                      {typeLabels[review.type] || review.type}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{review.topic_name || '未分类'}</span>
                    <span className="text-xs text-gray-500">{review.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject(review.id)}
                      disabled={processingId === review.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> 拒绝/修正
                    </button>
                    <button
                      onClick={() => handleApprove(review.id)}
                      disabled={processingId === review.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> 通过并入库
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                  <p className="text-sm text-gray-800 font-medium">{review.content}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="text-gray-500 flex items-center gap-1">
                      来源:
                      {review.source_url ? (
                        <a
                          href={review.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5"
                        >
                          {review.source} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-700">{review.source || '未知'}</span>
                      )}
                    </span>
                    <span className="text-gray-500">
                      模型置信度:{' '}
                      <span className={review.confidence < 0.7 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                        {(review.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </div>

                {review.reason && (
                  <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
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
