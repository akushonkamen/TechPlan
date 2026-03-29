import { History } from 'lucide-react';
import type { SkillConfig } from '../hooks/useSkillApi';

interface SkillDetailPanelProps {
  skill: SkillConfig;
  onShowVersionHistory: () => void;
}

export default function SkillDetailPanel({ skill, onShowVersionHistory }: SkillDetailPanelProps) {
  const params = skill.params ?? [];
  const steps = skill.steps ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 animate-fade-in">
      <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">{skill.displayName}</h3>

      <p className="text-sm text-[#86868b] mb-6">{skill.description}</p>

      {params.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-[#1d1d1f] mb-3">参数</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f5f5f7]">
                  <th className="text-left py-2 px-3 font-medium text-[#86868b]">名称</th>
                  <th className="text-left py-2 px-3 font-medium text-[#86868b]">类型</th>
                  <th className="text-center py-2 px-3 font-medium text-[#86868b]">必填</th>
                  <th className="text-left py-2 px-3 font-medium text-[#86868b]">默认值</th>
                  <th className="text-left py-2 px-3 font-medium text-[#86868b]">描述</th>
                </tr>
              </thead>
              <tbody>
                {params.map((param) => (
                  <tr key={param.name} className="border-b border-[#f5f5f7]">
                    <td className="py-2 px-3 text-[#1d1d1f] font-mono text-xs">{param.name}</td>
                    <td className="py-2 px-3 text-[#86868b]">{param.type}</td>
                    <td className="py-2 px-3 text-center">
                      {param.required ? (
                        <span className="text-[#34c759]">✓</span>
                      ) : (
                        <span className="text-[#d2d2d7]">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[#86868b]">
                      {param.default !== undefined ? String(param.default) : '—'}
                    </td>
                    <td className="py-2 px-3 text-[#86868b]">{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-[#1d1d1f] mb-3">执行步骤</h4>
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-[#86868b]">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#f5f5f7] text-[#0071e3] text-xs font-medium flex items-center justify-center">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        onClick={onShowVersionHistory}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#0071e3] hover:bg-[#0071e3]/5 rounded-lg transition-all"
      >
        <History className="w-4 h-4" />
        版本历史
      </button>
    </div>
  );
}
