import { useState, useEffect, type FC } from 'react';
import { MessageSquare, Loader2, Pin, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useExpandDiscussion } from '../hooks/useExpandDiscussion';

interface PinnedDiscussion {
  id: string;
  section_id?: string;
  selected_text: string;
  user_input?: string;
  result: string;
}

interface ExpandDiscussionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  sectionTitle?: string;
  sectionThesis?: string;
  topicId?: string;
  reportType?: string;
  reportId?: string;
  onPin?: (discussion: PinnedDiscussion) => void;
}

const ExpandDiscussionPanel: FC<ExpandDiscussionPanelProps> = ({
  isOpen,
  onClose,
  selectedText,
  sectionTitle,
  sectionThesis,
  topicId,
  reportType,
  reportId,
  onPin,
}) => {
  const [userInput, setUserInput] = useState('');
  const [isPinning, setIsPinning] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);

  const { status, progress, result, error, expand, reset } = useExpandDiscussion();

  useEffect(() => {
    if (isOpen) {
      setUserInput('');
      setPinSuccess(false);
    } else {
      reset();
    }
  }, [isOpen, reset]);

  const handleExpand = async () => {
    if (!topicId) return;
    await expand({
      topicId,
      selectedText,
      sectionTitle,
      sectionThesis,
      userInput,
      reportType,
    });
  };

  const handlePin = async () => {
    if (!reportId || !result?.raw || !onPin) return;
    setIsPinning(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: sectionTitle,
          selectedText,
          userInput,
          result: result.raw,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        onPin(created);
        setPinSuccess(true);
        setTimeout(() => setPinSuccess(false), 2000);
      }
    } catch {
      // Error handling
    } finally {
      setIsPinning(false);
    }
  };

  const isRunning = status === 'running';
  const isCompleted = status === 'completed' && !!result?.raw;
  const isFailed = status === 'failed' || status === 'timeout';
  const resultText = typeof result?.raw === 'string' ? result.raw : '';

  if (!isOpen) return null;

  return (
    <div className="pt-4">
      {/* User input */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-[#888] mb-2">
          追加问题（可选）
        </label>
        <textarea
          rows={2}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={isRunning}
          placeholder="你想深入了解什么？"
          className="w-full rounded-xl border border-[#1d1d1f]/20 px-3.5 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aaa] focus:outline-none focus:border-[#2A5A6B]/50 focus:ring-1 focus:ring-[#2A5A6B]/20 resize-none disabled:opacity-50 transition-colors"
        />
      </div>

      {/* Execute button */}
      <button
        onClick={handleExpand}
        disabled={isRunning || !topicId}
        className="w-full flex items-center justify-center gap-2 bg-[#1d1d1f] text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#1d1d1f]/90 disabled:opacity-40 transition-all"
      >
        <MessageSquare className="w-4 h-4" />
        {isRunning ? '分析中...' : '展开讨论'}
      </button>

      {/* Progress */}
      {isRunning && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-[#888]">
            <Loader2 className="w-4 h-4 animate-spin text-[#2A5A6B]" />
            <span>正在分析...</span>
          </div>
          {progress.length > 0 && (
            <div className="space-y-1 pl-6">
              {progress.slice(-3).map((msg, i) => (
                <p key={i} className="text-xs text-[#aaa]">{msg}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {isFailed && (
        <div className="flex items-start gap-2.5 p-3.5 mt-4 bg-[#A0453A]/5 border border-[#A0453A]/15 rounded-xl">
          <AlertCircle className="w-4 h-4 text-[#A0453A] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-[#A0453A]">分析失败</p>
            {error && <p className="text-xs text-[#A0453A]/70 mt-0.5">{error}</p>}
          </div>
        </div>
      )}

      {/* Result */}
      {isCompleted && (
        <div className="mt-4">
          <p className="text-xs font-medium text-[#888] mb-2">分析结果</p>
          <div className="prose prose-sm max-w-none text-sm text-[#1d1d1f] bg-[#F7F7F7] rounded-xl p-4 border border-[#1d1d1f]/5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {resultText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Pin + Close footer */}
      {isCompleted && reportId && onPin && (
        <div className="flex items-center gap-3 pt-4 mt-4 border-t border-[#1d1d1f]/10">
          <button
            onClick={handlePin}
            disabled={isPinning || pinSuccess}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#2A5A6B]/10 text-[#2A5A6B] rounded-full hover:bg-[#2A5A6B]/20 disabled:opacity-50 transition-colors"
          >
            <Pin className="w-3.5 h-3.5" />
            {pinSuccess ? '已固定' : '固定到报告'}
          </button>
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-[#888] hover:text-[#1d1d1f] rounded-full hover:bg-[#1d1d1f]/5 transition-colors"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
};

export default ExpandDiscussionPanel;
