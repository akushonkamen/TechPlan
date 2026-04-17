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
    bg: 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20',
    text: 'text-[#1d1d1f]',
    gradient: 'from-[#1d1d1f]/20 to-[#1d1d1f]/5',
  },
  green: {
    bg: 'bg-[#5B7553]/10',
    text: 'text-[#5B7553]',
    gradient: 'from-[#5B7553]/20 to-[#5B7553]/5',
  },
  orange: {
    bg: 'bg-[#9C7B3C]/10',
    text: 'text-[#9C7B3C]',
    gradient: 'from-[#9C7B3C]/20 to-[#9C7B3C]/5',
  },
  red: {
    bg: 'bg-[#A0453A]/10',
    text: 'text-[#A0453A]',
    gradient: 'from-[#A0453A]/20 to-[#A0453A]/5',
  },
  purple: {
    bg: 'bg-[#7A5C6B]/10',
    text: 'text-[#7A5C6B]',
    gradient: 'from-[#7A5C6B]/20 to-[#7A5C6B]/5',
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
            trend.positive ? 'bg-[#5B7553]/10' : 'bg-[#A0453A]/10'
          }`}>
            {trend.positive ? (
              <TrendingUp className="w-3 h-3 text-[#5B7553]" />
            ) : (
              <TrendingDown className="w-3 h-3 text-[#A0453A]" />
            )}
            <span className={`text-xs font-semibold ${trend.positive ? 'text-[#5B7553]' : 'text-[#A0453A]'}`}>
              {trend.value}
            </span>
          </div>
        )}
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#888] mb-1">{label}</p>
        <p className="text-[32px] font-semibold tracking-tight text-[#1d1d1f] leading-none">
          {value}
        </p>
      </div>

      {/* Subtle bottom accent */}
      <div className={`mt-4 h-0.5 rounded-full bg-gradient-to-r ${colors.gradient} w-16 group-hover:w-full transition-all duration-500 ease-out`} />
    </div>
  );
}
