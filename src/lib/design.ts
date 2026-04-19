/**
 * MNEMOSYNE Design Tokens
 * macOS cool-gray style: #F7F7F7 bg, pure black borders, clean minimal palette.
 */

// ── Reusable Tailwind class constants ───────────────────

export const CARD = 'bg-[#F7F7F7] border border-[#1d1d1f]/60 rounded-3xl transition-all duration-200 ease-out';
export const CARD_FLAT = 'bg-[#F7F7F7] rounded-3xl border border-[#1d1d1f]/20';
export const CARD_INTERACTIVE = 'bg-[#F7F7F7] rounded-3xl border border-[#1d1d1f]/40 hover:border-[#1d1d1f] hover:-translate-y-0.5 transition-all duration-200 ease-out';

export const INPUT =
  'w-full px-4 py-2.5 bg-[#F7F7F7] border border-[#1d1d1f] rounded-full text-sm font-medium focus:ring-2 focus:ring-[#1d1d1f]/15 transition-all duration-200 outline-none placeholder:text-[#aaa]';

export const BTN_PRIMARY =
  'px-5 py-2 bg-[#1d1d1f] text-[#F7F7F7] border border-[#1d1d1f] rounded-full text-sm font-bold hover:bg-[#1a1a1a] active:bg-[#2a2a2a] active:scale-[0.97] transition-all duration-150 ease-out';

export const LABEL = 'block text-xs font-bold uppercase tracking-wider text-[#1d1d1f] mb-2';

export const SECTION_TITLE = 'text-[9px] font-extrabold uppercase tracking-widest text-[#888]';

export const SPINNER =
  'w-5 h-5 border-2 border-[#1d1d1f]/20 border-t-[#1d1d1f] rounded-full animate-spin';

export const TOAST_SUCCESS = 'bg-[#5B7553]/10 text-[#5B7553] border border-[#5B7553]/30 rounded-2xl px-4 py-3 text-sm font-medium';
export const TOAST_ERROR = 'bg-[#A0453A]/10 text-[#A0453A] border border-[#A0453A]/30 rounded-2xl px-4 py-3 text-sm font-medium';

export const MODAL_BACKDROP = 'bg-black/20 backdrop-blur-sm animate-fade-in';
export const MODAL_CONTAINER = 'bg-[#F7F7F7] rounded-3xl border border-[#1d1d1f] animate-scale-in';

export const SEGMENT_TRACK = 'bg-[#E8E8E8] rounded-full p-1.5 border border-[#1d1d1f]/10';
export const SEGMENT_ACTIVE = 'bg-[#1d1d1f] text-[#F7F7F7] rounded-full text-sm font-bold';
export const SEGMENT_INACTIVE = 'text-[#888] hover:text-[#1d1d1f] rounded-full text-sm font-medium transition-colors duration-150';
