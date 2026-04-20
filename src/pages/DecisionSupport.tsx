import { useState, useEffect, useRef } from 'react';
import { Target, CheckCircle2, TrendingUp, AlertTriangle, Users, Zap, Clock, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import EmptyState from '../components/EmptyState';
import { CARD, SPINNER, INPUT, TOAST_SUCCESS, TOAST_ERROR } from '../lib/design';
import { useSkillExecutor } from '../hooks/useSkillExecutor';
import type { Topic } from '../types';

interface ScoringCard {
  topicId: string;
  topicName: string;
  direction: string;
  scores: Record<string, number>;
  overallScore: number;
  recommendation: string;
  rationale: string;
  evidence: string[];
  confidence: number;
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
  { key: 'roiPotential', label: '投入产出', icon: TrendingUp },
  { key: 'timing', label: '进入时机', icon: Clock },
];

const recommendationLabels: Record<string, { label: string; color: string }> = {
  'continuous_tracking': { label: '持续跟踪', color: 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 text-[#1d1d1f]' },
  'small_pilot': { label: '小规模试点', color: 'bg-[#9C7B3C]/5 text-[#9C7B3C]' },
  'heavy_investment': { label: '重点投入', color: 'bg-[#5B7553]/5 text-[#5B7553]' },
  'joint_development': { label: '联合布局', color: 'bg-[#4A6670]/5 text-[#4A6670]' },
  'risk_avoidance': { label: '规避风险', color: 'bg-[#A0453A]/10 text-[#A0453A]' },
};

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-[#5B7553]';
  if (score >= 50) return 'text-[#9C7B3C]';
  return 'text-[#A0453A]';
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-[#5B7553]';
  if (score >= 50) return 'bg-[#9C7B3C]';
  return 'bg-[#A0453A]';
}

export default function DecisionSupport() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [scoringCard, setScoringCard] = useState<ScoringCard | null>(null);
  const [loading, setLoading] = useState(false);

  // Competitor tracking state
  const [competitorOrg, setCompetitorOrg] = useState('');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { execute: executeSkill, status: trackStatus } = useSkillExecutor();

  const resetStatusAfterDelay = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current.push(
      setTimeout(() => setToast(null), 3000)
    );
  };

  useEffect(() => { fetchTopics(); }, []);
  useEffect(() => { if (selectedTopic) fetchScoringCard(selectedTopic); }, [selectedTopic]);

  async function fetchTopics() {
    setLoading(true);
    try {
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
        if (data.length > 0 && !selectedTopic) setSelectedTopic(data[0].id);
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
      if (res.ok) setScoringCard(await res.json());
    } catch (error) {
      console.error('Failed to fetch scoring card:', error);
    }
  }

  async function handleCompetitorTrack() {
    if (!competitorOrg.trim() || trackStatus === 'running') return;

    const topic = topics.find(t => t.id === selectedTopic);
    try {
      // Execute track-competitor skill using the hook
      await executeSkill('track-competitor', {
        organization: competitorOrg,
        topicContext: topic?.name || '',
        focusAreas: 'roadmaps,repos,press_releases,technology,partnerships',
      }, { timeoutMs: 360000 }); // 6 minutes

      // Auto-trigger sync-graph after competitor tracking completes
      if (selectedTopic) {
        try {
          await fetch(`/api/graph/sync/${selectedTopic}`, { method: 'POST' });
        } catch (error) {
          console.error('Auto sync-graph failed after competitor tracking:', error);
        }
      }

      setToast({message: '友商追踪完成', type: 'success'});
      resetStatusAfterDelay();
    } catch {
      setToast({message: '友商追踪失败', type: 'error'});
      resetStatusAfterDelay();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={SPINNER} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <PageHeader title="决策分析" description="多维度技术评估、友商追踪与决策建议">
        <select
          value={selectedTopic || ''}
          onChange={e => setSelectedTopic(e.target.value)}
          className="w-full px-3.5 py-2 bg-[#F7F7F7] rounded-[980px] text-sm focus:bg-[#1d1d1f]/5 transition-all sm:w-auto"
        >
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </PageHeader>

      {scoringCard && (
        <>
          {/* Overall score */}
          <div className={`${CARD} p-5 sm:p-8`}>
            <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-medium text-[#1d1d1f]">综合评分</h3>
                <p className="text-sm text-[#888] mt-0.5">{scoringCard.direction}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className={`text-5xl font-semibold tracking-tight ${getScoreColor(scoringCard.overallScore)}`}>
                  {scoringCard.overallScore}
                </div>
                <div className="text-xs text-[#888]">/ 100</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${recommendationLabels[scoringCard.recommendation]?.color || 'bg-[#F7F7F7] text-[#888]'}`}>
                {recommendationLabels[scoringCard.recommendation]?.label || scoringCard.recommendation}
              </span>
              <span className="text-xs text-[#888]">
                置信度 {(scoringCard.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <p className="text-sm text-[#888] leading-relaxed">{scoringCard.rationale}</p>
          </div>

          {/* Dimension scores */}
          <div className={`${CARD} p-5 sm:p-8`}>
            <h3 className="text-base font-medium text-[#1d1d1f] mb-5">维度评分</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {scoreDimensions.map(({ key, label, icon: Icon }) => {
                const score = scoringCard.scores[key] ?? 0;
                return (
                  <div key={key} className="bg-[#F7F7F7] rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="w-3.5 h-3.5 text-[#888]" />
                      <span className="text-[10px] text-[#888]">{label}</span>
                    </div>
                    <span className={`text-2xl font-semibold ${getScoreColor(score)}`}>{score}</span>
                    <div className="mt-2 h-1.5 bg-[#1d1d1f]/30 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreBg(score)} rounded-full transition-all`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence with graph links */}
          {scoringCard.evidence.length > 0 && (
          <div className={`${CARD} p-5 sm:p-8`}>
              <h3 className="text-base font-medium text-[#1d1d1f] mb-4">支持证据</h3>
              <div className="space-y-2">
                {scoringCard.evidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-[#1d1d1f]">
                    <CheckCircle2 className="w-4 h-4 text-[#5B7553] mt-0.5 shrink-0" />
                    <span className="flex-1">{ev}</span>
                    {selectedTopic && (
                      <Link
                        to={`/graph?topicId=${selectedTopic}`}
                        className="shrink-0 p-1 text-[#aaa] hover:text-[#2A5A6B] transition-colors"
                        title="在图谱中查看"
                      >
                        <Network className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Competitor Tracking */}
      <div className={`${CARD} p-8`}>
        <h3 className="text-base font-medium text-[#1d1d1f] mb-1">友商追踪</h3>
        <p className="text-sm text-[#888] mb-4">追踪竞品组织的技术路线图、开源仓库和新闻动态，追踪完成后图谱自动同步</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={competitorOrg}
            onChange={e => setCompetitorOrg(e.target.value)}
            placeholder="输入组织名称，如 OpenAI, DeepMind..."
            className={`min-w-0 flex-1 ${INPUT}`}
            onKeyDown={e => e.key === 'Enter' && handleCompetitorTrack()}
          />
          <SkillButton onClick={handleCompetitorTrack} status={trackStatus} disabled={!competitorOrg.trim()}>
            开始追踪
          </SkillButton>
        </div>
      </div>

      {!scoringCard && (
        <EmptyState
          icon={<Target className="w-12 h-12" />}
          title="选择主题开始分析"
          description="选择一个技术主题，查看多维度评分和决策建议"
        />
      )}

      {toast && (
        <div className={`animate-fade-in ${toast.type === 'success' ? TOAST_SUCCESS : TOAST_ERROR}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
