import type { SkillConfig } from '../hooks/useSkillApi';
import { CARD } from '../lib/design';

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  research: '#4A6670',
  extraction: '#9C7B3C',
  reporting: '#5B7553',
  sync: '#1d1d1f',
  optimization: '#7A5C6B',
  general: '#888',
};

interface SkillCardProps {
  skill: SkillConfig;
  onClick: () => void;
  isExpanded: boolean;
}

export default function SkillCard({ skill, onClick, isExpanded }: SkillCardProps) {
  const categoryColor = CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general;

  return (
    <div
      onClick={onClick}
      className={`${CARD} p-5 cursor-pointer transition-all ${
        isExpanded ? 'ring-2 ring-[#1d1d1f]' : 'hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[#1d1d1f] truncate">{skill.displayName || skill.name}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: categoryColor }}
            >
              {skill.category}
            </span>
            <span className="text-xs text-[#888]">{skill.version ? `v${skill.version}` : ''}</span>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full transition-all ${isExpanded ? 'bg-[#1d1d1f]' : 'bg-[#1d1d1f]/20'}`} />
      </div>
      <p className="text-sm text-[#888] mt-3 line-clamp-2">{skill.description}</p>
    </div>
  );
}
