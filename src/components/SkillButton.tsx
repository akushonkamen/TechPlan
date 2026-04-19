import type { ReactNode } from 'react';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';

type SkillStatus = 'idle' | 'running' | 'completed' | 'failed' | 'timeout';

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
  const isTimeout = status === 'timeout';

  const baseClasses = 'inline-flex items-center gap-2 px-5 py-2 rounded-[980px] text-sm font-medium transition-all duration-200';

  const variantClasses = variant === 'primary'
    ? isRunning
      ? 'bg-[#1d1d1f] text-white cursor-wait'
      : isCompleted
        ? 'bg-[#5B7553] text-white'
        : (isFailed || isTimeout)
          ? 'bg-[#A0453A]/5 border border-[#A0453A]/20 text-[#A0453A] hover:bg-[#A0453A]/10'
          : 'bg-[#1d1d1f] text-white hover:bg-[#1a1a1a] active:bg-[#2a2a2a] active:scale-[0.97]'
    : isRunning
      ? 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 text-[#888] cursor-wait'
      : 'bg-[#1d1d1f]/5 border border-[#1d1d1f]/20 text-[#1d1d1f] hover:bg-[#1d1d1f]/10 active:scale-[0.97]';

  return (
    <button
      onClick={onClick}
      disabled={disabled || isRunning}
      className={`${baseClasses} ${variantClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
      {isCompleted && <CheckCircle2 className="w-4 h-4" />}
      {(isFailed || isTimeout) && <RefreshCw className="w-4 h-4" />}
      {!isRunning && !isCompleted && !isFailed && !isTimeout && children}
      {isRunning && children}
      {isCompleted && '已完成'}
      {isFailed && '重试'}
      {isTimeout && '超时重试'}
    </button>
  );
}
