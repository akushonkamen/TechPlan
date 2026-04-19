import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 flex items-center justify-center mb-4 text-[#888]">
          {icon}
        </div>
      )}
      <h3 className="text-[17px] font-semibold text-[#1d1d1f]">{title}</h3>
      {description && (
        <p className="mt-1 text-[15px] text-[#888] max-w-sm text-center">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
