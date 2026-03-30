import type { FormEvent } from 'react';
import type { OptimizationConfig } from '../hooks/useSkillApi';
import { CARD, CARD_FLAT, INPUT, LABEL, BTN_PRIMARY } from '../lib/design';

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
      <div className={`${CARD_FLAT} p-6 text-center text-sm text-[#86868b]`}>
        请选择一个技能以配置优化参数
      </div>
    );
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    onSave({
      evaluation_criteria: formData.get('evaluation_criteria') as string || '',
      max_iterations: Number(formData.get('max_iterations')) || 10,
      convergence_threshold: Number(formData.get('convergence_threshold')) || 8,
      focus_area: formData.get('focus_area') as string || 'general',
    });
  };

  return (
    <form onSubmit={handleSubmit} className={`${CARD} p-6 space-y-4`}>
      <div>
        <label className={LABEL}>评估标准</label>
        <input
          type="text"
          name="evaluation_criteria"
          defaultValue={config.evaluation_criteria}
          placeholder="relevance,depth,accuracy"
          className={INPUT}
        />
        <p className="text-xs text-[#86868b] mt-1">用逗号分隔多个评估维度</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>最大迭代次数</label>
          <input
            type="number"
            name="max_iterations"
            defaultValue={config.max_iterations}
            min={1}
            max={50}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>收敛阈值</label>
          <input
            type="number"
            name="convergence_threshold"
            defaultValue={config.convergence_threshold}
            min={0}
            max={10}
            step={0.1}
            className={INPUT}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>关注领域</label>
        <select
          name="focus_area"
          defaultValue={config.focus_area}
          className={INPUT}
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
        className={`w-full ${BTN_PRIMARY} disabled:opacity-50`}
      >
        {saving ? '保存中...' : '保存配置'}
      </button>
    </form>
  );
}
