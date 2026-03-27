import { Check, X, AlertCircle, MessageSquareWarning, ExternalLink } from 'lucide-react';

const pendingReviews = [
  {
    id: 1,
    type: 'Claim 抽取',
    topic: '端侧大模型',
    source: 'arXiv:2310.11453',
    sourceUrl: 'https://arxiv.org/abs/2310.11453',
    content: '提取到主张: "该量化方法在保持精度的同时，将端侧推理延迟降低了 40%"',
    confidence: 0.65,
    reason: '置信度低于阈值 (0.8)，可能存在指标提取偏差。',
    time: '10分钟前'
  },
  {
    id: 2,
    type: '实体对齐',
    topic: '固态电池',
    source: 'TechCrunch 报道',
    sourceUrl: 'https://techcrunch.com/',
    content: '尝试将新实体 "QuantumScape Corp" 对齐到已有实体 "QuantumScape"',
    confidence: 0.72,
    reason: '存在多个相似实体，需人工确认归并。',
    time: '1小时前'
  },
  {
    id: 3,
    type: '矛盾检测',
    topic: '硅光芯片',
    source: '多源对比',
    sourceUrl: '#',
    content: '发现矛盾主张: 来源A称"CPO技术将于2026年大规模商用"，来源B称"CPO商用至少推迟至2028年"',
    confidence: 0.95,
    reason: '高影响矛盾点，需人工介入判定或保留双向证据。',
    time: '2小时前'
  }
];

export default function ReviewConsole() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">审核台</h2>
          <p className="mt-1 text-sm text-gray-500">人工复核低置信度抽取结果、实体消歧与矛盾证据。</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">待处理任务:</span>
          <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">45</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div className="flex gap-4">
            <button className="text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 pb-4 -mb-4">全部待办</button>
            <button className="text-sm font-medium text-gray-500 hover:text-gray-700 pb-4 -mb-4">实体消歧 (12)</button>
            <button className="text-sm font-medium text-gray-500 hover:text-gray-700 pb-4 -mb-4">主张审核 (28)</button>
            <button className="text-sm font-medium text-gray-500 hover:text-gray-700 pb-4 -mb-4">矛盾处理 (5)</button>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {pendingReviews.map((review) => (
            <div key={review.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    review.type === '矛盾检测' ? 'bg-red-50 text-red-700 border border-red-100' :
                    review.type === '实体对齐' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                    'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    {review.type}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{review.topic}</span>
                  <span className="text-xs text-gray-500">{review.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-sm font-medium">
                    <X className="w-4 h-4" /> 拒绝/修正
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium">
                    <Check className="w-4 h-4" /> 通过并入库
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                <p className="text-sm text-gray-800 font-medium">{review.content}</p>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    来源: 
                    {review.sourceUrl !== '#' ? (
                      <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5">
                        {review.source} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-700">{review.source}</span>
                    )}
                  </span>
                  <span className="text-gray-500">模型置信度: <span className={review.confidence < 0.7 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>{(review.confidence * 100).toFixed(0)}%</span></span>
                </div>
              </div>
              
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
                {review.type === '矛盾检测' ? <MessageSquareWarning className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                <p>{review.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
