import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, ArrowRight, Play, Loader2, Trash2 } from 'lucide-react';
import { fetchReports, generateWeeklyReport, saveReport, type GeneratedReport } from '../services/reportService';
import { fetchTopics } from '../services/topicService';

export default function Reports() {
  const [reports, setReports] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reportsData, topicsData] = await Promise.all([
        fetchReports(),
        fetchTopics()
      ]);
      setReports(reportsData);
      setTopics(topicsData);
      if (topicsData.length > 0 && !selectedTopicId) {
        setSelectedTopicId(topicsData[0].id);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedTopicId || isGenerating) return;

    setIsGenerating(true);
    try {
      const topic = topics.find(t => t.id === selectedTopicId);
      if (!topic) return;

      // 获取该主题的文档
      const docsResponse = await fetch(`http://localhost:3000/api/documents?topic_id=${selectedTopicId}`);
      const documents = await docsResponse.json();

      if (documents.length === 0) {
        alert('该主题暂无采集文档，请先在"数据采集"页面进行采集');
        return;
      }

      // 生成报告
      const report = await generateWeeklyReport({
        topicId: selectedTopicId,
        topicName: topic.name,
        documents
      });

      // 保存报告
      await saveReport(report);

      // 刷新报告列表
      await loadData();
    } catch (error: any) {
      console.error("Failed to generate report:", error);
      alert(`生成报告失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('确定要删除此报告吗？')) return;
    try {
      await fetch(`http://localhost:3000/api/reports/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      console.error("Failed to delete report:", error);
    }
  };

  const handleViewReport = (report: any) => {
    setViewingReport(report);
  };

  const getReportTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'weekly': '周报',
      'special': '专题研判',
      'alert': '预警报告',
      'executive_summary': '管理摘要'
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Report Detail Modal */}
      {viewingReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">{viewingReport.title}</h3>
              <button
                onClick={() => setViewingReport(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">概要</h4>
                  <p className="text-gray-700">{viewingReport.summary || '暂无概要'}</p>
                </div>
                {viewingReport.content && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">关键发现</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                      {(viewingReport.content.keyFindings || []).map((finding: string, i: number) => (
                        <li key={i}>{finding}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {viewingReport.metadata?.documentSummary && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">数据统计</h4>
                    <div className="text-sm text-gray-600">
                      <p>文档总数: {viewingReport.metadata.documentSummary.total}</p>
                      <p>时间范围: {viewingReport.metadata.documentSummary.dateRange}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setViewingReport(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">分析与报告</h2>
          <p className="mt-1 text-sm text-gray-500">基于已采集文档生成技术情报周报</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">选择主题...</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={handleGenerateReport}
            disabled={!selectedTopicId || isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                生成周报
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-medium text-gray-900">
            已生成报告
            {!isLoading && <span className="ml-2 text-sm text-gray-500">({reports.length})</span>}
          </h3>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
            加载中...
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>暂无报告</p>
            <p className="text-sm mt-1">选择主题后点击"生成周报"按钮</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {reports.map((report) => (
              <div key={report.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-1">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{report.title}</h4>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                        {getReportTypeLabel(report.type)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {report.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : '-'}
                      </span>
                      <span>{report.topic_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewReport(report)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="查看详情"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteReport(report.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-medium text-gray-900 mb-4">使用说明</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>在 <span className="font-medium text-gray-900">数据采集</span> 页面选择主题并检索文档</li>
          <li>在此页面选择对应主题</li>
          <li>点击 <span className="font-medium text-indigo-600">生成周报</span> 按钮</li>
          <li>系统将基于采集的文档使用 AI 生成分析报告</li>
        </ol>
      </div>
    </div>
  );
}
