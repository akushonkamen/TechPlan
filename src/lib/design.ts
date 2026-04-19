/**
 * Apple HIG Design Tokens
 * Single source of truth for colors, spacing, and component classes.
 * Aligned with apple.com.cn and macOS design language.
 */

// ── Spacing System (4px base) ──────────────────────────────
export const SPACING = {
  xs: '4px',   // 0.25rem
  sm: '8px',   // 0.5rem
  md: '16px',  // 1rem
  lg: '24px',  // 1.5rem
  xl: '32px',  // 2rem
  '2xl': '48px', // 3rem
  '3xl': '64px', // 4rem
} as const;

// ── Colors ──────────────────────────────────────────────
export const COLORS = {
  // Brand colors
  primary: '#0071e3',
  primaryHover: '#0062cc',
  primaryActive: '#0055b3',

  // Semantic colors
  success: '#34c759',
  successLight: '#30d158',
  warning: '#ff9f0a',
  warningLight: '#ffb340',
  danger: '#ff3b30',
  dangerLight: '#ff453a',
  info: '#5ac8fa',

  // Text colors
  text: {
    primary: '#1d1d1f',
    secondary: '#86868b',
    tertiary: '#aeaeb2',
    quaternary: '#c7c7cc',
  },

  // Background colors
  bg: {
    primary: '#ffffff',
    secondary: '#f5f5f7',
    tertiary: '#e8e8ed',
    elevated: '#fafafa',
  },

  // Border colors
  border: {
    default: '#d2d2d7',
    light: '#e5e5ea',
    medium: '#c7c7cc',
  },
} as const;

// ── Gradients (Apple style) ─────────────────────────────
export const GRADIENTS = {
  // Primary blue gradient
  primary: 'linear-gradient(135deg, #0071e3 0%, #0055b3 100%)',

  // Success gradient
  success: 'linear-gradient(135deg, #34c759 0%, #30d158 100%)',

  // Subtle glass gradient
  glass: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',

  // Card surface gradient
  card: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',

  // Blue chart gradient
  chart: 'linear-gradient(180deg, #0071e3 0%, rgba(0,113,227,0.3) 100%)',

  // Purple accent gradient
  accent: 'linear-gradient(135deg, #af52de 0%, #bf5af2 100%)',
} as const;

// ── Shadows (Multi-layer Apple style) ───────────────────
export const SHADOWS = {
  // Subtle shadow for cards
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.03)',

  // Default card shadow
  md: '0 2px 8px -1px rgba(0, 0, 0, 0.06), 0 1px 4px -1px rgba(0, 0, 0, 0.04)',

  // Elevated shadow (hover)
  lg: '0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04)',

  // Modal/dropdown shadow
  xl: '0 8px 32px -4px rgba(0, 0, 0, 0.12), 0 4px 16px -2px rgba(0, 0, 0, 0.06)',

  // Floating action shadow
  float: '0 12px 40px -4px rgba(0, 113, 227, 0.15), 0 4px 12px -2px rgba(0, 113, 227, 0.08)',

  // Inner shadow for inset elements
  inset: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
} as const;

// ── Animation Durations ─────────────────────────────────
export const DURATION = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const;

// ── Easing Functions ────────────────────────────────────
export const EASING = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const;

// ── Reusable Tailwind class constants ───────────────────

// Card variants with enhanced shadows
export const CARD = 'bg-white rounded-[20px] shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06),0_1px_4px_-1px_rgba(0,0,0,0.04)] transition-all duration-200 ease-out';
export const CARD_FLAT = 'bg-white rounded-[20px] shadow-none border border-[#f5f5f7]';
export const CARD_INTERACTIVE = 'bg-white rounded-[20px] shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.03)] border border-transparent hover:border-[#e5e5ea] hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06),0_1px_4px_-1px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all duration-200 ease-out';
export const CARD_GLASS = 'bg-white/80 backdrop-blur-xl rounded-[20px] shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06),0_1px_4px_-1px_rgba(0,0,0,0.04)] border border-white/50';

// Input with focus ring
export const INPUT =
  'w-full px-4 py-3 bg-[#f5f5f7] border-0 rounded-xl text-sm focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,113,227,0.12)] transition-all duration-200 outline-none placeholder:text-[#aeaeb2]';

// Buttons with enhanced styling
export const BTN_PRIMARY =
  'px-5 py-2.5 bg-[#0071e3] text-white rounded-[980px] text-sm font-semibold hover:bg-[#0062cc] active:bg-[#0055b3] active:scale-[0.96] transition-all duration-150ms ease-out shadow-sm hover:shadow-md';

export const BTN_SECONDARY =
  'px-5 py-2.5 bg-[#f5f5f7] text-[#1d1d1f] rounded-[980px] text-sm font-semibold hover:bg-[#e8e8ed] active:bg-[#d2d2d7] active:scale-[0.96] transition-all duration-150ms ease-out';

export const BTN_GHOST = 'px-5 py-2.5 bg-transparent text-[#0071e3] rounded-[980px] text-sm font-semibold hover:bg-[#0071e3]/8 active:bg-[#0071e3]/12 active:scale-[0.96] transition-all duration-150ms ease-out';

export const BTN_ICON = 'p-2.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-xl transition-all duration-150 active:scale-[0.94]';

// Labels
export const LABEL = 'block text-sm font-semibold text-[#1d1d1f] mb-2';

// Section titles with proper hierarchy
export const SECTION_TITLE = 'text-[17px] font-semibold text-[#1d1d1f] tracking-tight';
export const SECTION_SUBTITLE = 'text-sm text-[#86868b] font-normal';
export const SECTION_OVERLINE = 'text-xs font-semibold text-[#86868b] uppercase tracking-wider';

// Spinner
export const SPINNER =
  'w-6 h-6 border-2 border-[#e5e5ea] border-t-[#0071e3] rounded-full animate-spin';

// Toast
export const TOAST_SUCCESS = 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.03)]';
export const TOAST_ERROR = 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.03)]';
export const TOAST_WARNING = 'bg-[#ff9f0a]/10 text-[#ff9f0a] border border-[#ff9f0a]/20 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.03)]';
export const TOAST_INFO = 'bg-[#5ac8fa]/10 text-[#5ac8fa] border border-[#5ac8fa]/20 rounded-xl px-4 py-3 text-sm font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.03)]';

// Empty state
export const EMPTY_STATE_WRAPPER = 'flex flex-col items-center justify-center py-16 animate-fade-in';
export const EMPTY_STATE_ICON = 'w-16 h-16 text-[#c7c7cc] mb-4';
export const EMPTY_STATE_TITLE = 'text-[17px] font-semibold text-[#1d1d1f] mb-2';
export const EMPTY_STATE_DESC = 'text-sm text-[#86868b] max-w-xs text-center';

// Modal
export const MODAL_BACKDROP = 'bg-black/20 backdrop-blur-sm animate-fade-in';
export const MODAL_CONTAINER = 'bg-white rounded-[24px] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12),0_4px_16px_-2px_rgba(0,0,0,0.06)] border border-[#f5f5f7]/50 animate-scale-in';

// Segmented Control (Apple style)
export const SEGMENT_TRACK = 'bg-[#e8e8ed] rounded-full p-1.5 shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.05)]';
export const SEGMENT_ACTIVE = 'bg-white rounded-[980px] text-[#1d1d1f] shadow-sm';
export const SEGMENT_INACTIVE = 'text-[#86868b] hover:text-[#1d1d1f] rounded-[980px] transition-colors duration-150';

// Badge
export const BADGE = 'px-2 py-0.5 rounded-full text-xs font-semibold';
export const BADGE_PRIMARY = `${BADGE} bg-[#0071e3]/10 text-[#0071e3]`;
export const BADGE_SUCCESS = `${BADGE} bg-[#34c759]/10 text-[#34c759]`;
export const BADGE_WARNING = `${BADGE} bg-[#ff9f0a]/10 text-[#ff9f0a]`;
export const BADGE_DANGER = `${BADGE} bg-[#ff3b30]/10 text-[#ff3b30]`;
export const BADGE_NEUTRAL = `${BADGE} bg-[#e8e8ed] text-[#86868b]`;

// Divider
export const DIVIDER = 'h-px bg-[#e5e5ea]';
export const DIVIDER_VERTICAL = 'w-px bg-[#e5e5ea]';

// Skeleton loading
export const SKELETON = 'bg-[#e8e8ed] rounded-lg animate-pulse';
export const SKELETON_TEXT = 'h-4 bg-[#e8e8ed] rounded animate-pulse';
export const SKELETON_CIRCLE = 'w-10 h-10 bg-[#e8e8ed] rounded-full animate-pulse';

// Progress bar
export const PROGRESS_TRACK = 'h-1.5 bg-[#e8e8ed] rounded-full overflow-hidden';
export const PROGRESS_FILL = 'h-full bg-[#0071e3] rounded-full transition-all duration-300 ease-out';

// Toggle switch (Apple style)
export const TOGGLE_TRACK = 'w-11 h-7 bg-[#e8e8ed] rounded-full transition-colors duration-200 ease-out';
export const TOGGLE_THUMB = 'w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-out';
export const TOGGLE_ACTIVE = 'bg-[#34c759]';
