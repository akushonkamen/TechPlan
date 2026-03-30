/**
 * Apple HIG Design Tokens
 * Single source of truth for colors, spacing, and component classes.
 * Aligned with apple.com.cn design language.
 */

// ── Colors ──────────────────────────────────────────────
export const COLORS = {
  primary: '#0071e3',
  primaryHover: '#0062cc',
  success: '#34c759',
  warning: '#ff9f0a',
  danger: '#ff3b30',
  text: {
    primary: '#1d1d1f',
    secondary: '#86868b',
    tertiary: '#aeaeb5',
  },
  bg: {
    primary: '#ffffff',
    secondary: '#f5f5f7',
    hover: '#e8e8ed',
  },
  border: '#d2d2d7',
} as const;

// ── Reusable Tailwind class constants ───────────────────

// Card variants
export const CARD = 'bg-white rounded-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]';
export const CARD_FLAT = 'bg-white rounded-[18px] shadow-none border border-[#f5f5f7]';
export const CARD_INTERACTIVE = 'bg-white rounded-[18px] shadow-none border border-[#f5f5f7] hover:border-[#d2d2d7] hover:bg-[#f5f5f7]/50 transition-all duration-200';

// Input
export const INPUT =
  'w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,113,227,0.15)] transition-all outline-none';

// Buttons
export const BTN_PRIMARY =
  'px-4 py-2.5 bg-[#0071e3] text-white rounded-[980px] text-sm font-semibold hover:bg-[#0062cc] transition-all active:scale-[0.97]';

export const BTN_SECONDARY =
  'px-4 py-2.5 bg-[#f5f5f7] text-[#1d1d1f] rounded-[980px] text-sm font-medium hover:bg-[#e8e8ed] transition-all active:scale-[0.97]';

export const BTN_PILL = 'px-5 py-2.5 bg-[#0071e3] text-white rounded-[980px] text-sm font-semibold hover:bg-[#0062cc] active:scale-[0.97] transition-all';
export const BTN_GHOST = 'px-4 py-2 bg-transparent text-[#0071e3] rounded-[980px] text-sm font-medium hover:bg-[#0071e3]/5 transition-all';

// Labels
export const LABEL = 'block text-sm font-medium text-[#1d1d1f] mb-1.5';

// Spinner
export const SPINNER =
  'w-6 h-6 border-2 border-[#d2d2d7] border-t-[#0071e3] rounded-full animate-spin';

// Section titles
export const SECTION_TITLE = 'text-[15px] font-semibold text-[#1d1d1f] tracking-tight';
export const SECTION_SUBTITLE = 'text-sm text-[#86868b]';

// Toast
export const TOAST_SUCCESS = 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/10 rounded-xl px-4 py-3 text-sm';
export const TOAST_ERROR = 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/10 rounded-xl px-4 py-3 text-sm';

// Empty state
export const EMPTY_STATE_WRAPPER = 'flex flex-col items-center justify-center py-12 animate-fade-in';

// Modal
export const MODAL_BACKDROP = 'bg-black/30 backdrop-blur-md';
export const MODAL_CONTAINER = 'bg-white rounded-[20px] shadow-xl border border-[#d2d2d7]/50';

// Segmented Control (Apple style)
export const SEGMENT_TRACK = 'bg-[#e8e8ed] rounded-full p-1';
export const SEGMENT_ACTIVE = 'bg-white rounded-[980px] text-[#1d1d1f]';
export const SEGMENT_INACTIVE = 'text-[#86868b] hover:text-[#1d1d1f] rounded-[980px]';
