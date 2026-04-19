import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { CARD } from '../lib/design';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  icon?: ReactNode;
}

export default function StatCard({ label, value, trend, icon }: StatCardProps) {
  return (
    <div className={`${CARD} p-6 animate-fade-in`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#86868b]">{label}</p>
          <p className="mt-2 text-[40px] font-semibold tracking-tight text-[#1d1d1f] leading-none">{value}</p>
        </div>
        {icon && (
          <div className="p-2.5 bg-[#f5f5f7] rounded-xl text-[#86868b]">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-sm">
          {trend.positive ? (
            <TrendingUp className="w-3.5 h-3.5 text-[#34c759]" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-[#ff3b30]" />
          )}
          <span className={trend.positive ? 'text-[#34c759]' : 'text-[#ff3b30]'}>
            {trend.value}
          </span>
        </div>
      )}
    </div>
  );
}
