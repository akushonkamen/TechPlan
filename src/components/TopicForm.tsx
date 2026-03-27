import { X, Loader2 } from 'lucide-react';
import type { Topic } from '../types';

interface TopicFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? '新建技术主题' : '编辑技术主题'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              主题名称 <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="例如：端侧大模型"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">主题描述</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-20"
              placeholder="描述该主题需要追踪的核心技术方向..."
              value={formData.description}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">采集频率</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              核心关键词 (逗号分隔) <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="例如：模型压缩, 量化, NPU"
              value={formData.keywords}
              onChange={(e) => onFormDataChange({ ...formData, keywords: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关注机构 (逗号分隔)</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="例如：Apple, Qualcomm, 华为"
              value={formData.organizations}
              onChange={(e) => onFormDataChange({ ...formData, organizations: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
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
