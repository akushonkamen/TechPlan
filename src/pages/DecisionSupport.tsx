import { useState, useEffect } from 'react';
import { Play, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Target, Users, Zap, Clock } from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  description: string;
  priority: string;
}

interface ScoringCard {
  topicId: string;
  topicName: string;
  direction: string;
  scores: {
    maturity: number;
    academicInterest: number;
    industryAdoption: number;
    competition: number;
    ecosystemDependency: number;
    capabilityMatch: number;
    standardizationWindow: number;
    policyRisk: number;
    roiPotential: number;
    timing: number;
  };
  overallScore: number;
  recommendation: string;
  rationale: string;
  evidence: string[];
  confidence: number;
}

interface AnalysisResult {
  id: string;
  topicId: string;
  type: string;
  status: string;
  summary: string;
  findings: Array<{
    title: string;
    description: string;
    confidence: number;
    evidence: string[];
  }>;
  recommendations: Array<{
    id: string;
    direction: string;
    actionType: string;
    rationale: string;
    confidence: number;
  }>;
}

const scoreDimensions = [
  { key: 'maturity', label: '技术成熟度', icon: Target },
  { key: 'academicInterest', label: '学术热度', icon: TrendingUp },
  { key: 'industryAdoption', label: '产业化速度', icon: Zap },
  { key: 'competition', label: '竞争拥挤度', icon: Users },
  { key: 'ecosystemDependency', label: '生态依赖度', icon: AlertTriangle },
  { key: 'capabilityMatch', label: '能力匹配度', icon: CheckCircle2 },
  { key: 'standardizationWindow', label: '标准化窗口', icon: Clock },
  { key: 'policyRisk', label: '政策风险', icon: AlertTriangle },
  { key: 'roiPotential', label: '投入产出潜力', icon: TrendingUp },
  { key: 'timing', label: '进入时机', icon: Clock },
];

const recommendationLabels: Record<string, { label: string; color: string }> = {
  'continuous_tracking': { label: '持续跟踪', color: 'bg-blue-100 text-blue-700' },
  'small_pilot': { label: '小规模试点', color: 'bg-yellow-100 text-yellow-700' },
  'heavy_investment': { label: '重点投入', color: 'bg-green-100 text-green-700' },
  'joint_development': { label: '联合布局', color: 'bg-purple-100 text-purple-700' },
  'risk_avoidance': { label: '规避风险', color: 'bg-red-100 text-red-700' },
};

export default function DecisionSupport() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [scoringCard, setScoringCard] = useState<ScoringCard | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    if (selectedTopic) {
      fetchScoringCard(selectedTopic);
    }
  }, [selectedTopic]);

  async function fetchTopics() {
    setLoading(true);
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        if (data.length > 0 && !selectedTopic) {
          setSelectedTopic(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchScoringCard(topicId: string) {
    try {
      const res = await fetch(`/api/topics/${topicId}/scoring`);
      if (res.ok) {
        setScoringCard(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch scoring card:', error);
    }
  }

  async function runAnalysis() {
    if (!selectedTopic) return;

    setAnalyzing(true);
    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopic,
          type: 'special_analysis',
          depth: 2,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setAnalysisResult(result);
        await fetchScoringCard(selectedTopic);
      }
    } catch (error) {
      console.error('Failed to run analysis:', error);
    } finally {
      setAnalyzing(false);
    }
  }

  function getScoreColor(score: number): string {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getScoreBg(score: number): string {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">决策支持</h2>
          <p className="mt-1 text-sm text-gray-500">技术规划决策支持与多维度评估分析。</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedTopic || ''}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
          <button
            onClick={runAnalysis}
            disabled={analyzing || !selectedTopic}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                执行分析
              </>
            )}
          </button>
        </div>
      </div>

      {scoringCard && (
        <>
          {/* Overall Score Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">综合评分</h3>
                <p className="text-sm text-gray-500">{scoringCard.direction}</p>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-bold ${getScoreColor(scoringCard.overallScore)}`}>
                  {scoringCard.overallScore}
                </div>
                <div className="text-sm text-gray-500">/ 100</div>
              </div>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                recommendationLabels[scoringCard.recommendation]?.color || 'bg-gray-100 text-gray-700'
              }`}>
                {recommendationLabels[scoringCard.recommendation]?.label || scoringCard.recommendation}
              </span>
              <span className="text-sm text-gray-500">
                置信度: <span className="font-medium">{(scoringCard.confidence * 100).toFixed(0)}%</span>
              </span>
            </div>

            <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
              {scoringCard.rationale}
            </p>
          </div>

          {/* Dimension Scores */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-6">维度评分</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {scoreDimensions.map(({ key, label, icon: Icon }) => {
                const score = scoringCard.scores[key as keyof typeof scoringCard.scores];
                return (
                  <div key={key} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                        {score}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getScoreBg(score)} transition-all`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence */}
          {scoringCard.evidence.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-medium text-gray-900 mb-4">支持证据</h3>
              <ul className="space-y-2">
                {scoringCard.evidence.map((evidence, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Analysis Result */}
      {analysisResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">分析结果</h3>
          <p className="text-sm text-gray-600 mb-6">{analysisResult.summary}</p>

          {analysisResult.findings.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">关键发现</h4>
              <div className="space-y-3">
                {analysisResult.findings.map((finding, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{finding.title}</span>
                      <span className="text-xs text-gray-500">
                        置信度: {(finding.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{finding.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysisResult.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">决策建议</h4>
              <div className="space-y-3">
                {analysisResult.recommendations.map((rec) => (
                  <div key={rec.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{rec.direction}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        recommendationLabels[rec.actionType]?.color || 'bg-gray-100 text-gray-700'
                      }`}>
                        {recommendationLabels[rec.actionType]?.label || rec.actionType}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{rec.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!scoringCard && !analysisResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Target className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">选择主题并执行分析以获取决策支持</p>
        </div>
      )}
    </div>
  );
}
