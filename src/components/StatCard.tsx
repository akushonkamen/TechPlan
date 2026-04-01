import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { CARD_INTERACTIVE } from '../lib/design';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
}

const colorStyles = {
  blue: {
    bg: 'bg-[#0071e3]/10',
    text: 'text-[#0071e3]',
    gradient: 'from-[#0071e3]/20 to-[#0071e3]/5',
  },
  green: {
    bg: 'bg-[#34c759]/10',
    text: 'text-[#34c759]',
    gradient: 'from-[#34c759]/20 to-[#34c759]/5',
  },
  orange: {
    bg: 'bg-[#ff9f0a]/10',
    text: 'text-[#ff9f0a]',
    gradient: 'from-[#ff9f0a]/20 to-[#ff9f0a]/5',
  },
  red: {
    bg: 'bg-[#ff3b30]/10',
    text: 'text-[#ff3b30]',
    gradient: 'from-[#ff3b30]/20 to-[#ff3b30]/5',
  },
  purple: {
    bg: 'bg-[#af52de]/10',
    text: 'text-[#af52de]',
    gradient: 'from-[#af52de]/20 to-[#af52de]/5',
  },
};

const defaultColor = colorStyles.blue;

export default function StatCard({ label, value, trend, icon, color = 'blue' }: StatCardProps) {
  const colors = colorStyles[color] ?? defaultColor;

  return (
    <div className={`${CARD_INTERACTIVE} p-6 group`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl ${colors.bg} flex items-center justify-center transition-all duration-300 group-hover:scale-110`}>
          <span className={colors.text}>
            {icon}
          </span>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
            trend.positive ? 'bg-[#34c759]/10' : 'bg-[#ff3b30]/10'
          }`}>
            {trend.positive ? (
              <TrendingUp className="w-3 h-3 text-[#34c759]" />
            ) : (
              <TrendingDown className="w-3 h-3 text-[#ff3b30]" />
            )}
            <span className={`text-xs font-semibold ${trend.positive ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
              {trend.value}
            </span>
          </div>
        )}
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#86868b] mb-1">{label}</p>
        <p className="text-[32px] font-semibold tracking-tight text-[#1d1d1f] leading-none">
          {value}
        </p>
      </div>

      {/* Subtle bottom accent */}
      <div className={`mt-4 h-0.5 rounded-full bg-gradient-to-r ${colors.gradient} w-16 group-hover:w-full transition-all duration-500 ease-out`} />
    </div>
  );
}
