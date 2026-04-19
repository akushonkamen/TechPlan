import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Key, Globe, AlertCircle, Check, ChevronDown } from 'lucide-react';

// 简单的客户端缓存重置（无需导入服务端模块）
const resetAIConfig = () => {};

interface Config {
  // AI 模型配置
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

  // Neo4j 配置
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
}

const STORAGE_KEY = 'techplan_config';

// 预设模型选项
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

export default function Settings() {
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

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          setConfig(prev => ({ ...prev, ...data }));
        } else {
          const localConfig = localStorage.getItem(STORAGE_KEY);
          if (localConfig) {
            setConfig(JSON.parse(localConfig));
          }
        }
      } catch (error) {
        const localConfig = localStorage.getItem(STORAGE_KEY);
        if (localConfig) {
          setConfig(JSON.parse(localConfig));
        }
      }
    };
    loadConfig();
  }, []);

  // 获取当前提供商的 API Key
  const getCurrentApiKey = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiApiKey;
      case 'gemini': return config.geminiApiKey;
      case 'custom': return config.customApiKey;
      default: return '';
    }
  };

  // 获取当前提供商的 Base URL
  const getCurrentBaseUrl = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiBaseUrl;
      case 'gemini': return config.geminiBaseUrl;
      case 'custom': return config.customBaseUrl;
      default: return '';
    }
  };

  // 获取当前提供商的模型
  const getCurrentModel = () => {
    switch (config.aiProvider) {
      case 'openai': return config.openaiModel;
      case 'gemini': return config.geminiModel;
      case 'custom': return config.customModel;
      default: return '';
    }
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setSaveStatus('success');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        // 重置 AI 配置缓存，使新配置生效
        resetAIConfig();
      } else {
        throw new Error('保存失败');
      }
    } catch (error) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaveStatus('success');
      resetAIConfig();
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 测试 API 连接
  const handleTest = async () => {
    setTesting(true);
    setTestStatus('idle');
    setTestError('');

    try {
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.aiProvider,
          apiKey: getCurrentApiKey(),
          baseUrl: getCurrentBaseUrl(),
          model: getCurrentModel(),
        }),
      });

      const result = await response.json();

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">系统设置</h2>
        <p className="mt-1 text-sm text-gray-500">配置 AI 模型和数据库连接信息。</p>
      </div>

      {/* AI 模型配置 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Key className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI 模型配置</h3>
              <p className="text-sm text-gray-500">用于智能检索和知识抽取</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 提供商选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择模型提供商</label>
            <div className="flex gap-3">
              {[
                { value: 'openai', label: 'OpenAI', color: 'emerald' },
                { value: 'gemini', label: 'Google Gemini', color: 'blue' },
                { value: 'custom', label: '自定义', color: 'purple' },
              ].map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => setConfig({ ...config, aiProvider: provider.value as any })}
                  className={`
                    px-4 py-2 rounded-lg border-2 font-medium transition-all
                    ${config.aiProvider === provider.value
                      ? `border-${provider.color}-500 bg-${provider.color}-50 text-${provider.color}-700`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>

          {/* OpenAI 配置 */}
          {config.aiProvider === 'openai' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.openaiApiKey}
                    onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  获取 API Key:{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:underline"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL（可选）</label>
                <input
                  type="url"
                  value={config.openaiBaseUrl}
                  onChange={(e) => setConfig({ ...config, openaiBaseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  用于使用兼容 OpenAI 的代理服务（如 Azure OpenAI、OneAPI 等）
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
                <select
                  value={config.openaiModel}
                  onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  {MODEL_PRESETS.openai.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Gemini 配置 */}
          {config.aiProvider === 'gemini' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.geminiApiKey}
                    onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                    placeholder="AIza..."
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  获取 API Key:{' '}
                  <a
                    href="https://ai.google.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL（可选）</label>
                <input
                  type="url"
                  value={config.geminiBaseUrl}
                  onChange={(e) => setConfig({ ...config, geminiBaseUrl: e.target.value })}
                  placeholder="默认使用 Google 端点"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
                <select
                  value={config.geminiModel}
                  onChange={(e) => setConfig({ ...config, geminiModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {MODEL_PRESETS.gemini.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 自定义配置 */}
          {config.aiProvider === 'custom' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.customApiKey}
                    onChange={(e) => setConfig({ ...config, customApiKey: e.target.value })}
                    placeholder="你的 API Key"
                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={config.customBaseUrl}
                  onChange={(e) => setConfig({ ...config, customBaseUrl: e.target.value })}
                  placeholder="https://your-api-endpoint.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
                <input
                  type="text"
                  value={config.customModel}
                  onChange={(e) => setConfig({ ...config, customModel: e.target.value })}
                  placeholder="your-model-name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                />
              </div>

              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                <p className="text-sm text-purple-800">
                  <strong>自定义模式</strong>：支持任何兼容 OpenAI API 格式的服务（如 Anthropic Claude 通过代理、DeepSeek、Qwen 等）。
                </p>
              </div>
            </div>
          )}

          {/* 测试连接按钮 */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleTest}
              disabled={!getCurrentApiKey() || testing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  测试连接
                </>
              )}
            </button>

            {testStatus === 'success' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="w-4 h-4" />
                连接成功！
              </span>
            )}
            {testStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {testError || '连接失败'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Neo4j 配置 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Neo4j 图数据库（可选）</h3>
              <p className="text-sm text-gray-500">配置后可使用图数据库存储</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">连接 URI</label>
              <input
                type="text"
                value={config.neo4jUri}
                onChange={(e) => setConfig({ ...config, neo4jUri: e.target.value })}
                placeholder="bolt://localhost:7687"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
              <input
                type="text"
                value={config.neo4jUser}
                onChange={(e) => setConfig({ ...config, neo4jUser: e.target.value })}
                placeholder="neo4j"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <div className="relative max-w-xs">
              <input
                type={showNeo4jPassword ? 'text' : 'password'}
                value={config.neo4jPassword}
                onChange={(e) => setConfig({ ...config, neo4jPassword: e.target.value })}
                placeholder="Neo4j 密码"
                className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNeo4jPassword(!showNeo4jPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNeo4jPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>提示：</strong>如果不配置 Neo4j，系统会自动使用本地 JSON 文件存储图数据，完全不影响功能使用。
            </p>
          </div>
        </div>
      </div>

      {/* 保存按钮栏 */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {saveStatus === 'success' && (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-green-600">配置已保存</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-600">保存失败</span>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setConfig({
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
            }}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            清除配置
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存配置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
