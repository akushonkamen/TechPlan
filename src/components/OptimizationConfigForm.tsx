import type { FormEvent } from 'react';
import type { OptimizationConfig } from '../hooks/useSkillApi';

interface OptimizationConfigFormProps {
  config: OptimizationConfig | null;
  onSave: (config: Partial<OptimizationConfig>) => void;
  saving?: boolean;
}

const FOCUS_AREA_OPTIONS = [
  { value: 'general', label: '通用' },
  { value: 'technical', label: '技术' },
  { value: 'market', label: '市场' },
  { value: 'competitive', label: '竞争' },
];

export default function OptimizationConfigForm({
  config,
  onSave,
  saving = false,
}: OptimizationConfigFormProps) {
  if (!config) {
    return (
      <div className="bg-[#f5f5f7] rounded-xl p-6 text-center text-sm text-[#86868b]">
        请选择一个技能以配置优化参数
      </div>
    );
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    onSave({
      evaluation_criteria: formData.get('evaluation_criteria') as string,
      max_iterations: Number(formData.get('max_iterations')),
      convergence_threshold: Number(formData.get('convergence_threshold')),
      focus_area: formData.get('focus_area') as string,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">评估标准</label>
        <input
          type="text"
          name="evaluation_criteria"
          defaultValue={config.evaluation_criteria}
          placeholder="relevance,depth,accuracy"
          className="w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all"
        />
        <p className="text-xs text-[#86868b] mt-1">用逗号分隔多个评估维度</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">最大迭代次数</label>
          <input
            type="number"
            name="max_iterations"
            defaultValue={config.max_iterations}
            min={1}
            max={50}
            className="w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">收敛阈值</label>
          <input
            type="number"
            name="convergence_threshold"
            defaultValue={config.convergence_threshold}
            min={0}
            max={10}
            step={0.1}
            className="w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">关注领域</label>
        <select
          name="focus_area"
          defaultValue={config.focus_area}
          className="w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all"
        >
          {FOCUS_AREA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full px-4 py-2.5 bg-[#0071e3] text-white rounded-full text-sm font-medium hover:bg-[#0062cc] transition-all disabled:opacity-50 active:scale-[0.97]"
      >
        {saving ? '保存中...' : '保存配置'}
      </button>
    </form>
  );
}
