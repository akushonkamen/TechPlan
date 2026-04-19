import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      {icon && (
        <div className="mb-4 text-[#aeaeb5]">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-[#1d1d1f]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#86868b] max-w-sm text-center">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}
