/**
 * Apple HIG Design Tokens
 * Single source of truth for colors, spacing, and component classes.
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
export const CARD = 'bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]';

export const INPUT =
  'w-full px-3.5 py-2.5 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white transition-all';

export const BTN_PRIMARY =
  'px-4 py-2.5 bg-[#0071e3] text-white rounded-full text-sm font-medium hover:bg-[#0062cc] transition-all active:scale-[0.97]';

export const BTN_SECONDARY =
  'px-4 py-2.5 bg-[#f5f5f7] text-[#1d1d1f] rounded-full text-sm font-medium hover:bg-[#e8e8ed] transition-all';

export const LABEL = 'block text-sm font-medium text-[#1d1d1f] mb-1.5';

export const SPINNER =
  'w-6 h-6 border-2 border-[#d2d2d7] border-t-[#0071e3] rounded-full animate-spin';
