import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { SECTION_OVERLINE, SECTION_SUBTITLE } from '../lib/design';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  stats?: Array<{ label: string; value: string | number; trend?: { value: string; positive: boolean } }>;
  badge?: string;
}

export default function PageHeader({ title, description, children, stats, badge }: PageHeaderProps) {
  return (
    <div className="mb-8 animate-fade-in">
      {/* Breadcrumb/Overline area */}
      {badge && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#0071e3]/10 text-[#0071e3] text-xs font-semibold">
            {badge}
          </span>
        </div>
      )}

      {/* Title section */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-[40px] font-semibold tracking-tight text-[#1d1d1f] leading-[1.1]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[15px] text-[#86868b] leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-3 shrink-0">
            {children}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {stats && stats.length > 0 && (
        <div className="mt-8 flex items-center gap-8 px-6 py-4 bg-white rounded-2xl border border-[#f5f5f7]/80">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={index !== stats.length - 1 ? 'pr-8 border-r border-[#e5e5ea]' : ''}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-semibold text-[#1d1d1f] leading-none tracking-tight">
                  {stat.value}
                </span>
                {stat.trend && (
                  <span className={`text-xs font-semibold ${stat.trend.positive ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                    {stat.trend.value}
                  </span>
                )}
              </div>
              <span className="text-xs text-[#86868b] mt-1">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
