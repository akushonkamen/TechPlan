import { useState, useEffect, useRef } from 'react';
import { Target, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle, Users, Zap, Clock, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import EmptyState from '../components/EmptyState';
import { CARD, SPINNER, INPUT, TOAST_SUCCESS, TOAST_ERROR } from '../lib/design';

interface Topic {
  id: string;
  name: string;
  description: string;
  priority: string;
  organizations?: string[];
}

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
  'continuous_tracking': { label: '持续跟踪', color: 'bg-[#0071e3]/5 text-[#0071e3]' },
  'small_pilot': { label: '小规模试点', color: 'bg-[#ff9f0a]/5 text-[#ff9f0a]' },
  'heavy_investment': { label: '重点投入', color: 'bg-[#34c759]/5 text-[#34c759]' },
  'joint_development': { label: '联合布局', color: 'bg-[#5856d6]/5 text-[#5856d6]' },
  'risk_avoidance': { label: '规避风险', color: 'bg-[#ff3b30]/10 text-[#ff3b30]' },
};

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-[#34c759]';
  if (score >= 50) return 'text-[#ff9f0a]';
  return 'text-[#ff3b30]';
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-[#34c759]';
  if (score >= 50) return 'bg-[#ff9f0a]';
  return 'bg-[#ff3b30]';
}

export default function DecisionSupport() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [scoringCard, setScoringCard] = useState<ScoringCard | null>(null);
  const [loading, setLoading] = useState(false);

  // Competitor tracking state
  const [competitorOrg, setCompetitorOrg] = useState('');
  const [competitorStatus, setCompetitorStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error'} | null>(null);
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const safeTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { if (mountedRef.current) fn(); }, ms);
    timeoutsRef.current.push(id);
  };

  const resetStatusAfterDelay = () => {
    safeTimeout(() => setCompetitorStatus('idle'), 3000);
    safeTimeout(() => setToast(null), 3000);
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
    if (!competitorOrg.trim()) return;
    setCompetitorStatus('running');
    try {
      const topic = topics.find(t => t.id === selectedTopic);
      const res = await fetch('/api/skill/track-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: competitorOrg,
          topicContext: topic?.name || '',
          focusAreas: 'roadmaps,repos,press_releases,technology,partnerships',
        }),
      });

      if (!res.ok) throw new Error('启动追踪失败');
      const { executionId } = await res.json();

      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const MAX_ATTEMPTS = 120; // ~6 min cap
        const poll = async () => {
          if (!mountedRef.current) { reject(new Error('unmounted')); return; }
          attempts++;
          if (attempts > MAX_ATTEMPTS) { reject(new Error('追踪超时')); return; }
          try {
            const statusRes = await fetch(`/api/skill/${executionId}/status`);
            if (statusRes.ok) {
              const status = await statusRes.json();
              if (status.status === 'completed') { resolve(); return; }
              if (status.status === 'failed') { reject(new Error('追踪失败')); return; }
            }
          } catch { /* ignore */ }
          setTimeout(poll, 3000);
        };
        setTimeout(poll, 2000);
      });

      // Auto-trigger sync-graph after competitor tracking
      if (selectedTopic) {
        try {
          await fetch('/api/skill/sync-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: selectedTopic }),
          });
        } catch (error) {
          console.error('Auto sync-graph failed after competitor tracking:', error);
        }
      }

      setCompetitorStatus('completed');
      setToast({message: '友商追踪完成', type: 'success'});
      resetStatusAfterDelay();
    } catch {
      setCompetitorStatus('failed');
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
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="决策分析" description="多维度技术评估、友商追踪与决策建议">
        <select
          value={selectedTopic || ''}
          onChange={e => setSelectedTopic(e.target.value)}
          className="px-3.5 py-2 bg-[#f5f5f7] rounded-[980px] text-sm focus:bg-white transition-all"
        >
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </PageHeader>

      {scoringCard && (
        <>
          {/* Overall score */}
          <div className={`${CARD} p-8`}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-medium text-[#1d1d1f]">综合评分</h3>
                <p className="text-sm text-[#86868b] mt-0.5">{scoringCard.direction}</p>
              </div>
              <div className="text-right">
                <div className={`text-5xl font-semibold tracking-tight ${getScoreColor(scoringCard.overallScore)}`}>
                  {scoringCard.overallScore}
                </div>
                <div className="text-xs text-[#86868b]">/ 100</div>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${recommendationLabels[scoringCard.recommendation]?.color || 'bg-[#f5f5f7] text-[#86868b]'}`}>
                {recommendationLabels[scoringCard.recommendation]?.label || scoringCard.recommendation}
              </span>
              <span className="text-xs text-[#86868b]">
                置信度 {(scoringCard.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <p className="text-sm text-[#86868b] leading-relaxed">{scoringCard.rationale}</p>
          </div>

          {/* Dimension scores */}
          <div className={`${CARD} p-8`}>
            <h3 className="text-base font-medium text-[#1d1d1f] mb-5">维度评分</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {scoreDimensions.map(({ key, label, icon: Icon }) => {
                const score = scoringCard.scores[key] ?? 0;
                return (
                  <div key={key} className="bg-[#f5f5f7] rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="w-3.5 h-3.5 text-[#86868b]" />
                      <span className="text-[10px] text-[#86868b]">{label}</span>
                    </div>
                    <span className={`text-2xl font-semibold ${getScoreColor(score)}`}>{score}</span>
                    <div className="mt-2 h-1.5 bg-[#d2d2d7] rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreBg(score)} rounded-full transition-all`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence with graph links */}
          {scoringCard.evidence.length > 0 && (
            <div className={`${CARD} p-8`}>
              <h3 className="text-base font-medium text-[#1d1d1f] mb-4">支持证据</h3>
              <div className="space-y-2">
                {scoringCard.evidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-[#1d1d1f]">
                    <CheckCircle2 className="w-4 h-4 text-[#34c759] mt-0.5 shrink-0" />
                    <span className="flex-1">{ev}</span>
                    {selectedTopic && (
                      <Link
                        to={`/graph?topicId=${selectedTopic}`}
                        className="shrink-0 p-1 text-[#aeaeb5] hover:text-[#0071e3] transition-colors"
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
        <p className="text-sm text-[#86868b] mb-4">追踪竞品组织的技术路线图、开源仓库和新闻动态，追踪完成后图谱自动同步</p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={competitorOrg}
            onChange={e => setCompetitorOrg(e.target.value)}
            placeholder="输入组织名称，如 OpenAI, Google DeepMind..."
            className={`flex-1 ${INPUT}`}
            onKeyDown={e => e.key === 'Enter' && handleCompetitorTrack()}
          />
          <SkillButton onClick={handleCompetitorTrack} status={competitorStatus} disabled={!competitorOrg.trim()}>
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
