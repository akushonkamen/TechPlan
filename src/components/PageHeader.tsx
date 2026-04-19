import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  stats?: Array<{ label: string; value: string | number }>;
}

export default function PageHeader({ title, description, children, stats }: PageHeaderProps) {
  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1d1d1f] leading-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-base text-[#86868b]">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-3 shrink-0">
            {children}
          </div>
        )}
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-4 flex items-center gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold text-[#1d1d1f]">{stat.value}</span>
              <span className="text-sm text-[#86868b]">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
