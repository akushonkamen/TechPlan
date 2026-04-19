import type { ReactNode } from 'react';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';

type SkillStatus = 'idle' | 'running' | 'completed' | 'failed';

interface SkillButtonProps {
  onClick: () => void;
  status?: SkillStatus;
  children: ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export default function SkillButton({
  onClick,
  status = 'idle',
  children,
  disabled = false,
  variant = 'primary',
}: SkillButtonProps) {
  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const baseClasses = 'inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-200';

  const variantClasses = variant === 'primary'
    ? isRunning
      ? 'bg-[#0071e3] text-white cursor-wait'
      : isCompleted
        ? 'bg-[#34c759] text-white'
        : isFailed
          ? 'bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20'
          : 'bg-[#0071e3] text-white hover:bg-[#0062cc] active:scale-[0.97]'
    : isRunning
      ? 'bg-[#f5f5f7] text-[#86868b] cursor-wait'
      : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] active:scale-[0.97]';

  return (
    <button
      onClick={onClick}
      disabled={disabled || isRunning}
      className={`${baseClasses} ${variantClasses} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
      {isCompleted && <CheckCircle2 className="w-4 h-4" />}
      {isFailed && <RefreshCw className="w-4 h-4" />}
      {!isRunning && !isCompleted && !isFailed && children}
      {isRunning && children}
      {isCompleted && '已完成'}
      {isFailed && '重试'}
    </button>
  );
}
