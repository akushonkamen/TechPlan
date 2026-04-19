import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Key, AlertCircle, Check, Zap, Database, Cpu, Layers, Clock, Timer } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import { useBilevelOptimization } from '../hooks/useSkills';
import { useSkillsList, useOptimizationConfig, useOptHistory, type SkillConfig } from '../hooks/useSkillApi';
import SkillCard from '../components/SkillCard';
import SkillDetailPanel from '../components/SkillDetailPanel';
import SkillVersionHistory from '../components/SkillVersionHistory';
import OptimizationConfigForm from '../components/OptimizationConfigForm';
import ExecutionHistory from '../components/ExecutionHistory';
import { INPUT, LABEL, BTN_PRIMARY, CARD, SEGMENT_TRACK, SEGMENT_ACTIVE, SEGMENT_INACTIVE } from '../lib/design';

const STORAGE_KEY = 'techplan_config';

interface Config {
  aiProvider: 'openai' | 'gemini' | 'custom';
  openaiApiKey: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  geminiApiKey: string;
  geminiBaseUrl?: string;
  geminiModel?: string;
  customApiKey: string;
  customBaseUrl: string;
  customModel: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
}

const MODEL_PRESETS = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (最新)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (快速)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Experimental' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
};

type TabKey = 'ai' | 'graph' | 'skills' | 'optimize' | 'history' | 'scheduler';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabKey>('ai');
  const [config, setConfig] = useState<Config>({
    aiProvider: 'openai',
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o',
    geminiApiKey: '',
    geminiBaseUrl: '',
    geminiModel: 'gemini-2.5-flash-preview',
    customApiKey: '',
    customBaseUrl: '',
    customModel: '',
    neo4jUri: '',
    neo4jUser: '',
    neo4jPassword: '',
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showNeo4jPassword, setShowNeo4jPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Skill optimization
  const optimizeSkill = useBilevelOptimization();
  const [selectedSkill, setSelectedSkill] = useState('research');

  // Skills management
  const { skills: allSkills, loading: skillsLoading, refetch: refetchSkills } = useSkillsList();
  const { config: optConfig, loading: optConfigLoading, save: saveOptConfig, saving: optConfigSaving } = useOptimizationConfig(selectedSkill);
  const { history: optHistory, loading: optHistoryLoading } = useOptHistory(selectedSkill);
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistorySkill, setVersionHistorySkill] = useState<{ name: string; displayName: string } | null>(null);
  const [optConfigSaveStatus, setOptConfigSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState<{
    running: boolean;
    checkIntervalMinutes: number;
    lastCheckAt: string | null;
    nextCheckAt: string | null;
    pendingTopics: Array<{
      topicId: string;
      topicName: string;
      schedule: string;
      lastReportAt: string | null;
      dueInMinutes: number;
    }>;
    recentTriggers: Array<{
      topicId: string;
      topicName: string;
      triggeredAt: string;
      executionId: string;
      status: string;
    }>;
  } | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerToggling, setSchedulerToggling] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState(30);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(prev => ({ ...prev, ...data }));
        } else {
          const local = localStorage.getItem(STORAGE_KEY);
          if (local) setConfig(JSON.parse(local));
        }
      } catch {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) setConfig(JSON.parse(local));
      }
    };
    loadConfig();
  }, []);

  // Fetch scheduler status
  const fetchSchedulerStatus = async () => {
    setSchedulerLoading(true);
    try {
      const res = await fetch('/api/scheduler/status');
      if (res.ok) {
        const data = await res.json();
        setSchedulerStatus(data);
        setSchedulerInterval(data.checkIntervalMinutes ?? 30);
      }
    } catch { /* ignore */ } finally {
      setSchedulerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'scheduler') fetchSchedulerStatus();
  }, [activeTab]);

  const handleSchedulerToggle = async (enabled: boolean) => {
    setSchedulerToggling(true);
    try {
      const res = await fetch('/api/scheduler/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, checkIntervalMinutes: schedulerInterval }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setSchedulerInterval(data.config.checkIntervalMinutes);
        await fetchSchedulerStatus();
      }
    } catch { /* ignore */ } finally {
      setSchedulerToggling(false);
    }
  };

  const handleSchedulerIntervalChange = async () => {
    const clamped = Math.max(5, Math.min(1440, schedulerInterval));
    setSchedulerInterval(clamped);
    await handleSchedulerToggle(schedulerStatus?.running ?? false);
  };

  const getCurrentApiKey = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiApiKey;
      case 'gemini': return config.geminiApiKey;
      case 'custom': return config.customApiKey;
      default: return '';
    }
  };

  const getCurrentBaseUrl = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiBaseUrl;
      case 'gemini': return config.geminiBaseUrl;
      case 'custom': return config.customBaseUrl;
      default: return '';
    }
  };

  const getCurrentModel = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiModel;
      case 'gemini': return config.geminiModel;
      case 'custom': return config.customModel;
      default: return '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaveStatus('success');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } else {
        throw new Error('保存失败');
      }
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaveStatus('success');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus('idle');
    setTestError('');
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.aiProvider,
          apiKey: getCurrentApiKey(),
          baseUrl: getCurrentBaseUrl(),
          model: getCurrentModel(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(result.error || '连接失败');
      }
    } catch (error: unknown) {
      setTestStatus('error');
      setTestError((error instanceof Error ? error.message : String(error)) || '网络错误');
    } finally {
      setTesting(false);
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  const handleOptimize = async () => {
    await optimizeSkill.optimize({
      skillName: selectedSkill,
      evaluationCriteria: optConfig?.evaluation_criteria ?? 'relevance,depth,accuracy',
      maxIterations: optConfig?.max_iterations ?? 10,
      convergenceThreshold: optConfig?.convergence_threshold ?? 8,
    });
  };

  const handleSaveOptConfig = async (nextConfig: Parameters<typeof saveOptConfig>[0]) => {
    try {
      await saveOptConfig(nextConfig);
      setOptConfigSaveStatus('success');
    } catch {
      setOptConfigSaveStatus('error');
    } finally {
      setTimeout(() => setOptConfigSaveStatus('idle'), 3000);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: 'ai', label: 'AI 配置', icon: Zap },
    { key: 'graph', label: '图数据库', icon: Database },
    { key: 'skills', label: '技能管理', icon: Layers },
    { key: 'optimize', label: '技能优化', icon: Cpu },
    { key: 'history', label: '执行历史', icon: Clock },
    { key: 'scheduler', label: '定时任务', icon: Timer },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="设置" description="配置 AI 模型、数据库连接和技能优化" />

      {/* Tab bar */}
      <div className={`flex items-center gap-1 ${SEGMENT_TRACK} w-fit`}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-[980px] text-sm font-medium transition-all ${
              activeTab === tab.key
                ? SEGMENT_ACTIVE
                : SEGMENT_INACTIVE
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Config Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-5 animate-fade-in">
          <div className={`${CARD} p-8 space-y-5`}>
            <div>
              <label className={LABEL}>模型提供商</label>
              <div className="flex gap-2">
                {[
                  { value: 'openai' as const, label: 'OpenAI' },
                  { value: 'gemini' as const, label: 'Google Gemini' },
                  { value: 'custom' as const, label: '自定义' },
                ].map(p => (
                  <button
                    key={p.value}
                    onClick={() => setConfig({ ...config, aiProvider: p.value })}
                    className={`px-4 py-2 rounded-[980px] text-sm font-medium transition-all ${
                      config.aiProvider === p.value
                        ? 'bg-[#1d1d1f] text-white'
                        : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {config.aiProvider === 'openai' && (
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={config.openaiApiKey}
                      onChange={e => setConfig({ ...config, openaiApiKey: e.target.value })}
                      placeholder="sk-..."
                      className={`${INPUT} pr-10 font-mono`}
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Base URL（可选）</label>
                  <input type="url" value={config.openaiBaseUrl} onChange={e => setConfig({ ...config, openaiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className={`${INPUT} font-mono`} />
                </div>
                <div>
                  <label className={LABEL}>模型</label>
                  <select value={config.openaiModel} onChange={e => setConfig({ ...config, openaiModel: e.target.value })} className={INPUT}>
                    {MODEL_PRESETS.openai.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {config.aiProvider === 'gemini' && (
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>API Key</label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={config.geminiApiKey} onChange={e => setConfig({ ...config, geminiApiKey: e.target.value })} placeholder="AIza..." className={`${INPUT} pr-10 font-mono`} />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Base URL（可选）</label>
                  <input type="url" value={config.geminiBaseUrl} onChange={e => setConfig({ ...config, geminiBaseUrl: e.target.value })} placeholder="默认使用 Google 端点" className={`${INPUT} font-mono`} />
                </div>
                <div>
                  <label className={LABEL}>模型</label>
                  <select value={config.geminiModel} onChange={e => setConfig({ ...config, geminiModel: e.target.value })} className={INPUT}>
                    {MODEL_PRESETS.gemini.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {config.aiProvider === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>API Key</label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={config.customApiKey} onChange={e => setConfig({ ...config, customApiKey: e.target.value })} placeholder="你的 API Key" className={`${INPUT} pr-10 font-mono`} />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Base URL</label>
                  <input type="url" value={config.customBaseUrl} onChange={e => setConfig({ ...config, customBaseUrl: e.target.value })} placeholder="https://your-api-endpoint.com/v1" className={`${INPUT} font-mono`} />
                </div>
                <div>
                  <label className={LABEL}>模型名称</label>
                  <input type="text" value={config.customModel} onChange={e => setConfig({ ...config, customModel: e.target.value })} placeholder="your-model-name" className={INPUT} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-[#f5f5f7]">
              <button
                onClick={handleTest}
                disabled={!getCurrentApiKey() || testing}
                className="px-4 py-2 rounded-[980px] text-sm font-medium bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] transition-all disabled:opacity-40"
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#d2d2d7] border-t-[#0071e3] rounded-full animate-spin" />
                    测试中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><Key className="w-4 h-4" />测试连接</span>
                )}
              </button>
              {testStatus === 'success' && (
                <span className="flex items-center gap-1 text-sm text-[#34c759]"><Check className="w-4 h-4" />连接成功</span>
              )}
              {testStatus === 'error' && (
                <span className="flex items-center gap-1 text-sm text-[#ff3b30]"><AlertCircle className="w-4 h-4" />{testError || '连接失败'}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Graph DB Tab */}
      {activeTab === 'graph' && (
        <div className={`${CARD} p-8 space-y-4 animate-fade-in`}>
          <p className="text-sm text-[#86868b]">配置 Neo4j 图数据库连接（可选）。不配置则使用本地存储。</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>连接 URI</label>
              <input type="text" value={config.neo4jUri} onChange={e => setConfig({ ...config, neo4jUri: e.target.value })} placeholder="bolt://localhost:7687" className={`${INPUT} font-mono`} />
            </div>
            <div>
              <label className={LABEL}>用户名</label>
              <input type="text" value={config.neo4jUser} onChange={e => setConfig({ ...config, neo4jUser: e.target.value })} placeholder="neo4j" className={INPUT} />
            </div>
          </div>
          <div className="max-w-sm">
            <label className={LABEL}>密码</label>
            <div className="relative">
              <input type={showNeo4jPassword ? 'text' : 'password'} value={config.neo4jPassword} onChange={e => setConfig({ ...config, neo4jPassword: e.target.value })} placeholder="密码" className={`${INPUT} pr-10 font-mono`} />
              <button type="button" onClick={() => setShowNeo4jPassword(!showNeo4jPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                {showNeo4jPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <div className="space-y-6 animate-fade-in">
          {skillsLoading ? (
            <div className={`${CARD} p-12 text-center text-sm text-[#86868b]`}>
              加载中...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {allSkills.map((skill) => (
                  <div key={skill.name}>
                    <SkillCard
                      skill={skill}
                      onClick={() => setSelectedSkillDetail(selectedSkillDetail === skill.name ? null : skill.name)}
                      isExpanded={selectedSkillDetail === skill.name}
                    />
                    {selectedSkillDetail === skill.name && (
                      <div className="mt-4">
                        <SkillDetailPanel
                          skill={skill}
                          onShowVersionHistory={() => {
                            setVersionHistorySkill({ name: skill.name, displayName: skill.displayName });
                            setShowVersionHistory(true);
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {versionHistorySkill && (
            <SkillVersionHistory
              skillName={versionHistorySkill.name}
              displayName={versionHistorySkill.displayName}
              isOpen={showVersionHistory}
              onClose={() => setShowVersionHistory(false)}
              onRestored={refetchSkills}
            />
          )}
        </div>
      )}

      {/* Execution History Tab */}
      {activeTab === 'history' && (
        <div className="animate-fade-in">
          <ExecutionHistory />
        </div>
      )}

      {/* Optimize Tab */}
      {activeTab === 'optimize' && (
        <div className="space-y-5 animate-fade-in">
          <div className={`${CARD} p-8 space-y-5`}>
            <div>
              <h3 className="text-base font-medium text-[#1d1d1f]">技能优化</h3>
              <p className="text-sm text-[#86868b] mt-1">通过双层优化循环自动提升技能质量</p>
            </div>
            <div>
              <label className={LABEL}>选择技能</label>
              {skillsLoading ? (
                <div className="text-sm text-[#86868b]">加载中...</div>
              ) : (
                <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)} className={INPUT}>
                  {allSkills.map(s => (
                    <option key={s.name} value={s.name}>{s.displayName || s.name} {s.version ? `v${s.version}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <SkillButton
                onClick={handleOptimize}
                status={optimizeSkill.status === 'idle' ? 'idle' : optimizeSkill.status === 'running' ? 'running' : optimizeSkill.status === 'completed' ? 'completed' : 'failed'}
              >
                开始优化
              </SkillButton>
            </div>
            {optimizeSkill.status === 'completed' && optimizeSkill.result && (
              <div className="bg-[#34c759]/5 rounded-xl p-4 text-sm text-[#34c759]">
                优化完成！技能质量已提升。
              </div>
            )}
            {optimizeSkill.error && (
              <div className="bg-[#ff3b30]/5 rounded-xl p-4 text-sm text-[#ff3b30]">
                优化失败：{optimizeSkill.error}
              </div>
            )}
          </div>

          {/* Optimization Config Form */}
          <OptimizationConfigForm
            config={optConfig}
            onSave={handleSaveOptConfig}
            saving={optConfigSaving}
          />
          {optConfigSaveStatus === 'success' && (
            <div className="text-sm text-[#34c759]">优化配置已保存</div>
          )}
          {optConfigSaveStatus === 'error' && (
            <div className="text-sm text-[#ff3b30]">优化配置保存失败，请稍后重试</div>
          )}
          {optConfigLoading && (
            <div className="text-sm text-[#86868b]">正在加载优化配置...</div>
          )}

          {/* Optimization History */}
          {!optHistoryLoading && optHistory.length > 0 && (
            <div className={`${CARD} p-6`}>
              <h4 className="text-sm font-medium text-[#1d1d1f] mb-4">优化历史</h4>
              <div className="space-y-3">
                {optHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-3 border-b border-[#f5f5f7] last:border-0">
                    <div className="flex items-center gap-4">
                      <span className={entry.converged ? 'text-[#34c759]' : 'text-[#ff3b30]'}>
                        {entry.converged ? '✓' : '✗'}
                      </span>
                      <div>
                        <div className="text-sm text-[#1d1d1f]">
                          {entry.iterations_completed} 次迭代 · 峰值 {entry.peak_score} · 最终 {entry.final_score}
                        </div>
                        <div className="text-xs text-[#86868b]">
                          {new Date(entry.created_at).toLocaleString('zh-CN')} · 提取 {entry.lessons_extracted} 条经验
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduler Tab */}
      {activeTab === 'scheduler' && (
        <div className="space-y-5 animate-fade-in">
          <div className={`${CARD} p-8 space-y-5`}>
            <div>
              <h3 className="text-base font-medium text-[#1d1d1f]">定时任务调度器</h3>
              <p className="text-sm text-[#86868b] mt-1">按主题的采集频率自动触发周报生成</p>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-[#f5f5f7]">
              <div>
                <div className="text-sm font-medium text-[#1d1d1f]">启用调度器</div>
                <div className="text-xs text-[#86868b] mt-0.5">
                  {schedulerStatus?.running
                    ? `运行中 · 每 ${schedulerStatus.checkIntervalMinutes} 分钟检查`
                    : '未启用'}
                </div>
              </div>
              <button
                onClick={() => handleSchedulerToggle(!schedulerStatus?.running)}
                disabled={schedulerToggling}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  schedulerStatus?.running ? 'bg-[#34c759]' : 'bg-[#d2d2d7]'
                } ${schedulerToggling ? 'opacity-50' : ''}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    schedulerStatus?.running ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Check Interval */}
            <div>
              <label className={LABEL}>检查间隔（分钟）</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={schedulerInterval}
                  onChange={e => setSchedulerInterval(Number(e.target.value))}
                  onBlur={handleSchedulerIntervalChange}
                  className={`${INPUT} w-32`}
                  disabled={!schedulerStatus?.running}
                />
                <span className="text-xs text-[#86868b]">最小 5，最大 1440（24h）</span>
              </div>
            </div>

            {/* Status Info */}
            {schedulerStatus && (
              <div className="grid grid-cols-3 gap-4 py-3 border-t border-[#f5f5f7]">
                <div>
                  <div className="text-xs text-[#86868b]">运行状态</div>
                  <div className={`text-sm font-medium mt-1 ${schedulerStatus.running ? 'text-[#34c759]' : 'text-[#86868b]'}`}>
                    {schedulerStatus.running ? '运行中' : '已停止'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#86868b]">上次检查</div>
                  <div className="text-sm text-[#1d1d1f] mt-1">
                    {schedulerStatus.lastCheckAt
                      ? new Date(schedulerStatus.lastCheckAt).toLocaleString('zh-CN')
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#86868b]">下次检查</div>
                  <div className="text-sm text-[#1d1d1f] mt-1">
                    {schedulerStatus.nextCheckAt
                      ? new Date(schedulerStatus.nextCheckAt).toLocaleString('zh-CN')
                      : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pending Topics */}
          <div className={`${CARD} p-6`}>
            <h4 className="text-sm font-medium text-[#1d1d1f] mb-4">待触发主题</h4>
            {schedulerLoading ? (
              <div className="text-sm text-[#86868b]">加载中...</div>
            ) : (schedulerStatus?.pendingTopics?.length ?? 0) === 0 ? (
              <div className="text-sm text-[#86868b]">暂无到期主题</div>
            ) : (
              <div className="space-y-3">
                {schedulerStatus?.pendingTopics.map(topic => (
                  <div key={topic.topicId} className="flex items-center justify-between py-3 border-b border-[#f5f5f7] last:border-0">
                    <div>
                      <div className="text-sm text-[#1d1d1f]">{topic.topicName}</div>
                      <div className="text-xs text-[#86868b] mt-0.5">
                        周期: {topic.schedule === 'daily' ? '每日' : topic.schedule === 'weekly' ? '每周' : '每月'}
                        {topic.lastReportAt && ` · 上次报告: ${new Date(topic.lastReportAt).toLocaleString('zh-CN')}`}
                      </div>
                    </div>
                    <span className="text-xs text-[#ff9500] bg-[#ff9500]/10 px-2 py-1 rounded-full">待触发</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Triggers */}
          {(schedulerStatus?.recentTriggers?.length ?? 0) > 0 && (
            <div className={`${CARD} p-6`}>
              <h4 className="text-sm font-medium text-[#1d1d1f] mb-4">最近触发记录</h4>
              <div className="space-y-3">
                {schedulerStatus?.recentTriggers.slice(0, 10).map((trigger, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b border-[#f5f5f7] last:border-0">
                    <div>
                      <div className="text-sm text-[#1d1d1f]">{trigger.topicName}</div>
                      <div className="text-xs text-[#86868b] mt-0.5">
                        {new Date(trigger.triggeredAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      trigger.status === 'completed' ? 'text-[#34c759] bg-[#34c759]/10' :
                      trigger.status === 'running' ? 'text-[#0071e3] bg-[#0071e3]/10' :
                      'text-[#ff3b30] bg-[#ff3b30]/10'
                    }`}>
                      {trigger.status === 'completed' ? '完成' :
                       trigger.status === 'running' ? '运行中' : '失败'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3">
        {saveStatus === 'success' && (
          <span className="flex items-center gap-1 text-sm text-[#34c759] animate-fade-in">
            <Check className="w-4 h-4" />已保存
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 ${BTN_PRIMARY} disabled:opacity-50`}
        >
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />保存中...</>
          ) : (
            <><Save className="w-4 h-4" />保存配置</>
          )}
        </button>
      </div>
    </div>
  );
}
