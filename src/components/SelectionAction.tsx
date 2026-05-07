import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';

interface SelectionActionProps {
  position: { x: number; y: number };
  onExpand: () => void;
  visible: boolean;
}

const SelectionAction: FC<SelectionActionProps> = ({ position, onExpand, visible }) => {
  if (!visible) return null;

  return createPortal(
    <>
      {/* Test: big obvious button always at top-center */}
      <div
        style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, background: 'red', color: 'white', padding: '10px 20px', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', borderRadius: 8 }}
        onClick={onExpand}
        data-selection-action
      >
        展开讨论 (TEST) — pos: {Math.round(position.x)},{Math.round(position.y)}
      </div>
      {/* Original floating pill */}
      <button
        data-selection-action
        onClick={onExpand}
        className="fixed z-[10000] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1d1d1f] text-white text-xs font-medium shadow-lg hover:opacity-80 transition-opacity select-none cursor-pointer"
        style={{
          left: `${position.x}px`,
          top: `${position.y - 40}px`,
          transform: 'translateX(-50%)',
        }}
      >
        <MessageSquare size={14} />
        <span>展开讨论</span>
      </button>
    </>,
    document.body
  );
};

export default SelectionAction;
