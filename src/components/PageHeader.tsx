import type { ReactNode } from 'react';

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
      {/* Badge */}
      {badge && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#1d1d1f] text-[10px] font-bold uppercase tracking-wider text-[#1d1d1f]">
            {badge}
          </span>
        </div>
      )}

      {/* Title section */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1d1d1f] leading-[1.1] uppercase">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-[#888] leading-relaxed max-w-2xl font-mono">
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
        <div className="mt-8 flex items-center gap-8 px-6 py-4 bg-[#F7F7F7] rounded-2xl border border-[#1d1d1f]/60">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={index !== stats.length - 1 ? 'pr-8 border-r border-[#1d1d1f]/20' : ''}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-[#1d1d1f] leading-none tracking-tight">
                  {stat.value}
                </span>
                {stat.trend && (
                  <span className={`text-xs font-bold ${stat.trend.positive ? 'text-[#5B7553]' : 'text-[#A0453A]'}`}>
                    {stat.trend.value}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#888] mt-1 uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
