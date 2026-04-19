import type { FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import { INPUT, LABEL, MODAL_BACKDROP, MODAL_CONTAINER } from '../lib/design';

interface TopicFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => Promise<void>;
  formData: {
    name: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    keywords: string;
    organizations: string;
    schedule: 'daily' | 'weekly' | 'disabled';
    collectionTime: string;
    dailyReportEnabled: boolean;
    weeklyReportEnabled: boolean;
    monthlyReportEnabled: boolean;
    quarterlyReportEnabled: boolean;
  };
  onFormDataChange: (data: TopicFormProps['formData']) => void;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
}

export default function TopicForm({
  isOpen,
  onClose,
  onSubmit,
  formData,
  onFormDataChange,
  isSubmitting = false,
  mode,
}: TopicFormProps) {
  if (!isOpen) return null;

  const reportTypes = [
    { key: 'dailyReportEnabled' as const, label: '日报' },
    { key: 'weeklyReportEnabled' as const, label: '周报' },
    { key: 'monthlyReportEnabled' as const, label: '月报' },
    { key: 'quarterlyReportEnabled' as const, label: '季报' },
  ];

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center ${MODAL_BACKDROP}`}>
      <div className={`${MODAL_CONTAINER} w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto animate-scale-in`}>
        <div className="px-5 py-5 sm:px-8 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">
            {mode === 'create' ? '新建技术主题' : '编辑技术主题'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-[#888] hover:text-[#1d1d1f] hover:bg-[#1d1d1f]/5 rounded-full transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-6 sm:px-8 sm:pb-8 space-y-5">
          <div>
            <label className={LABEL}>
              主题名称 <span className="text-[#A0453A]">*</span>
            </label>
            <input
              required
              type="text"
              className={INPUT}
              placeholder="例如：端侧大模型"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className={LABEL}>主题描述</label>
            <textarea
              className={`${INPUT} resize-none h-20`}
              placeholder="描述该主题需要追踪的核心技术方向..."
              value={formData.description}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>优先级</label>
              <select
                className={INPUT}
                value={formData.priority}
                onChange={(e) => onFormDataChange({ ...formData, priority: e.target.value as 'high' | 'medium' | 'low' })}
                disabled={isSubmitting}
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>采集频率</label>
              <select
                className={INPUT}
                value={formData.schedule}
                onChange={(e) => onFormDataChange({ ...formData, schedule: e.target.value as 'daily' | 'weekly' | 'disabled' })}
                disabled={isSubmitting}
              >
                <option value="daily">每天采集</option>
                <option value="weekly">每周采集</option>
                <option value="disabled">禁用自动采集</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>采集时间</label>
              <input
                type="time"
                className={INPUT}
                value={formData.collectionTime}
                onChange={(e) => onFormDataChange({ ...formData, collectionTime: e.target.value })}
                disabled={isSubmitting || formData.schedule === 'disabled'}
              />
              <p className="text-[10px] text-[#888] mt-1">在该时间点前后自动采集</p>
            </div>
          </div>

          <div>
            <label className={LABEL}>自动报告</label>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {reportTypes.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData[key]}
                    onChange={(e) => onFormDataChange({ ...formData, [key]: e.target.checked })}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border-[#1d1d1f]/30 text-[#1d1d1f] focus:ring-[#1d1d1f] accent-[#1d1d1f]"
                  />
                  <span className="text-sm text-[#1d1d1f]">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-[#888] mt-1.5">报告基于时间范围内的已采集文档自动生成</p>
          </div>

          <div>
            <label className={LABEL}>
              核心关键词 (逗号分隔) <span className="text-[#A0453A]">*</span>
            </label>
            <input
              required
              type="text"
              className={INPUT}
              placeholder="例如：模型压缩, 量化, NPU"
              value={formData.keywords}
              onChange={(e) => onFormDataChange({ ...formData, keywords: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className={LABEL}>关注机构 (逗号分隔)</label>
            <input
              type="text"
              className={INPUT}
              placeholder="例如：Apple, Qualcomm, 华为"
              value={formData.organizations}
              onChange={(e) => onFormDataChange({ ...formData, organizations: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="pt-5 flex flex-col-reverse gap-3 border-t border-[#1d1d1f]/20 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-[#1d1d1f] bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 rounded-[980px] text-sm font-medium hover:bg-[#1d1d1f]/10 transition-all disabled:opacity-50 active:scale-[0.97]"
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-white bg-[#1d1d1f] rounded-[980px] text-sm font-semibold hover:bg-[#1a1a1a] transition-all disabled:opacity-50 active:scale-[0.97] flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? '保存主题' : '更新主题'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
