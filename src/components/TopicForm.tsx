import type { FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Topic } from '../types';

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
    schedule: 'daily' | 'weekly' | 'monthly';
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

  const inputClass = 'w-full px-4 py-2.5 bg-[#f5f5f7] rounded-xl text-sm text-[#1d1d1f] placeholder:text-[#aeaeb5] focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,113,227,0.15)] transition-all outline-none';
  const labelClass = 'block text-sm font-medium text-[#1d1d1f] mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-fade-in">
        <div className="px-8 py-5 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">
            {mode === 'create' ? '新建技术主题' : '编辑技术主题'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#aeaeb5] hover:text-[#86868b] transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-8 pb-8 space-y-5">
          <div>
            <label className={labelClass}>
              主题名称 <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              required
              type="text"
              className={inputClass}
              placeholder="例如：端侧大模型"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className={labelClass}>主题描述</label>
            <textarea
              className={`${inputClass} resize-none h-20`}
              placeholder="描述该主题需要追踪的核心技术方向..."
              value={formData.description}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>优先级</label>
              <select
                className={inputClass}
                value={formData.priority}
                onChange={(e) => onFormDataChange({ ...formData, priority: e.target.value as any })}
                disabled={isSubmitting}
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>采集频率</label>
              <select
                className={inputClass}
                value={formData.schedule}
                onChange={(e) => onFormDataChange({ ...formData, schedule: e.target.value as any })}
                disabled={isSubmitting}
              >
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              核心关键词 (逗号分隔) <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              required
              type="text"
              className={inputClass}
              placeholder="例如：模型压缩, 量化, NPU"
              value={formData.keywords}
              onChange={(e) => onFormDataChange({ ...formData, keywords: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className={labelClass}>关注机构 (逗号分隔)</label>
            <input
              type="text"
              className={inputClass}
              placeholder="例如：Apple, Qualcomm, 华为"
              value={formData.organizations}
              onChange={(e) => onFormDataChange({ ...formData, organizations: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="pt-5 flex justify-end gap-3 border-t border-[#d2d2d7]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-[#1d1d1f] bg-[#f5f5f7] rounded-full text-sm font-medium hover:bg-[#e8e8ed] transition-all disabled:opacity-50"
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-white bg-[#0071e3] rounded-full text-sm font-medium hover:bg-[#0062cc] transition-all disabled:opacity-50 active:scale-[0.97] flex items-center gap-2"
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
