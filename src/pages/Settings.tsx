import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Key, AlertCircle, Check, Zap, Database, Cpu, Layers } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SkillButton from '../components/SkillButton';
import { useBilevelOptimization } from '../hooks/useSkills';
import { useSkillsList, useOptimizationConfig, useOptHistory, type SkillConfig } from '../hooks/useSkillApi';
import SkillCard from '../components/SkillCard';
import SkillDetailPanel from '../components/SkillDetailPanel';
import SkillVersionHistory from '../components/SkillVersionHistory';
import OptimizationConfigForm from '../components/OptimizationConfigForm';

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

const SKILL_OPTIONS = [
  { value: 'research', label: '情报采集' },
  { value: 'extract', label: '知识抽取' },
  { value: 'report', label: '报告生成' },
  { value: 'track-competitor', label: '友商追踪' },
  { value: 'sync-graph', label: '图谱同步' },
];

type TabKey = 'ai' | 'graph' | 'skills' | 'optimize';

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
  const { skills: allSkills, loading: skillsLoading } = useSkillsList();
  const { config: optConfig, loading: optConfigLoading, save: saveOptConfig, saving: optConfigSaving } = useOptimizationConfig(selectedSkill);
  const { history: optHistory, loading: optHistoryLoading } = useOptHistory(selectedSkill);
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistorySkill, setVersionHistorySkill] = useState<{ name: string; displayName: string } | null>(null);

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
    } catch (error: any) {
      setTestStatus('error');
      setTestError(error.message || '网络错误');
    } finally {
      setTesting(false);
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  const handleOptimize = async () => {
    await optimizeSkill.optimize({
      skillName: selectedSkill,
      evaluationCriteria: 'relevance,depth,accuracy',
      maxIterations: 10,
      convergenceThreshold: 8,
    });
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: 'ai', label: 'AI 配置', icon: Zap },
    { key: 'graph', label: '图数据库', icon: Database },
    { key: 'skills', label: '技能管理', icon: Layers },
    { key: 'optimize', label: '技能优化', icon: Cpu },
  ];

  const inputClass = 'w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all';
  const labelClass = 'block text-sm font-medium text-[#1d1d1f] mb-1.5';

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="设置" description="配置 AI 模型、数据库连接和技能优化" />

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-[#f5f5f7] rounded-xl p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : 'text-[#86868b] hover:text-[#1d1d1f]'
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
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 space-y-5">
            <div>
              <label className={labelClass}>模型提供商</label>
              <div className="flex gap-2">
                {[
                  { value: 'openai' as const, label: 'OpenAI' },
                  { value: 'gemini' as const, label: 'Google Gemini' },
                  { value: 'custom' as const, label: '自定义' },
                ].map(p => (
                  <button
                    key={p.value}
                    onClick={() => setConfig({ ...config, aiProvider: p.value })}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
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
                  <label className={labelClass}>API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={config.openaiApiKey}
                      onChange={e => setConfig({ ...config, openaiApiKey: e.target.value })}
                      placeholder="sk-..."
                      className={`${inputClass} pr-10 font-mono`}
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Base URL（可选）</label>
                  <input type="url" value={config.openaiBaseUrl} onChange={e => setConfig({ ...config, openaiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>模型</label>
                  <select value={config.openaiModel} onChange={e => setConfig({ ...config, openaiModel: e.target.value })} className={inputClass}>
                    {MODEL_PRESETS.openai.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {config.aiProvider === 'gemini' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>API Key</label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={config.geminiApiKey} onChange={e => setConfig({ ...config, geminiApiKey: e.target.value })} placeholder="AIza..." className={`${inputClass} pr-10 font-mono`} />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Base URL（可选）</label>
                  <input type="url" value={config.geminiBaseUrl} onChange={e => setConfig({ ...config, geminiBaseUrl: e.target.value })} placeholder="默认使用 Google 端点" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>模型</label>
                  <select value={config.geminiModel} onChange={e => setConfig({ ...config, geminiModel: e.target.value })} className={inputClass}>
                    {MODEL_PRESETS.gemini.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {config.aiProvider === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>API Key</label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={config.customApiKey} onChange={e => setConfig({ ...config, customApiKey: e.target.value })} placeholder="你的 API Key" className={`${inputClass} pr-10 font-mono`} />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb5] hover:text-[#86868b]">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Base URL</label>
                  <input type="url" value={config.customBaseUrl} onChange={e => setConfig({ ...config, customBaseUrl: e.target.value })} placeholder="https://your-api-endpoint.com/v1" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>模型名称</label>
                  <input type="text" value={config.customModel} onChange={e => setConfig({ ...config, customModel: e.target.value })} placeholder="your-model-name" className={inputClass} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-[#f5f5f7]">
              <button
                onClick={handleTest}
                disabled={!getCurrentApiKey() || testing}
                className="px-4 py-2 rounded-full text-sm font-medium bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] transition-all disabled:opacity-40"
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
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 space-y-4 animate-fade-in">
          <p className="text-sm text-[#86868b]">配置 Neo4j 图数据库连接（可选）。不配置则使用本地存储。</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>连接 URI</label>
              <input type="text" value={config.neo4jUri} onChange={e => setConfig({ ...config, neo4jUri: e.target.value })} placeholder="bolt://localhost:7687" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>用户名</label>
              <input type="text" value={config.neo4jUser} onChange={e => setConfig({ ...config, neo4jUser: e.target.value })} placeholder="neo4j" className={inputClass} />
            </div>
          </div>
          <div className="max-w-sm">
            <label className={labelClass}>密码</label>
            <div className="relative">
              <input type={showNeo4jPassword ? 'text' : 'password'} value={config.neo4jPassword} onChange={e => setConfig({ ...config, neo4jPassword: e.target.value })} placeholder="密码" className={`${inputClass} pr-10 font-mono`} />
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
            <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-12 text-center text-sm text-[#86868b]">
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
              onRestored={() => {
                // Refetch skills list after restore
                window.location.reload();
              }}
            />
          )}
        </div>
      )}

      {/* Optimize Tab */}
      {activeTab === 'optimize' && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 space-y-5">
            <div>
              <h3 className="text-base font-medium text-[#1d1d1f]">技能优化</h3>
              <p className="text-sm text-[#86868b] mt-1">通过双层优化循环自动提升技能质量</p>
            </div>
            <div>
              <label className={labelClass}>选择技能</label>
              {skillsLoading ? (
                <div className="text-sm text-[#86868b]">加载中...</div>
              ) : (
                <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)} className={inputClass}>
                  {allSkills.map(s => (
                    <option key={s.name} value={s.name}>{s.displayName} v{s.version}</option>
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
            onSave={saveOptConfig}
            saving={optConfigSaving}
          />

          {/* Optimization History */}
          {!optHistoryLoading && optHistory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
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
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0071e3] text-white rounded-full text-sm font-medium hover:bg-[#0062cc] transition-all disabled:opacity-50 active:scale-[0.97]"
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
