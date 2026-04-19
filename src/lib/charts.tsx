/**
 * Apple-style Chart Theme for Recharts
 * Custom styling to match Apple's design language
 */

import type { TooltipProps } from 'recharts';

// ── Chart Colors (Apple palette) ─────────────────────────────
export const CHART_COLORS = {
  primary: '#0071e3',
  primaryLight: 'rgba(0, 113, 227, 0.2)',
  secondary: '#5ac8fa',
  secondaryLight: 'rgba(90, 200, 250, 0.2)',
  success: '#34c759',
  successLight: 'rgba(52, 199, 89, 0.2)',
  warning: '#ff9f0a',
  warningLight: 'rgba(255, 159, 10, 0.2)',
  danger: '#ff3b30',
  dangerLight: 'rgba(255, 59, 48, 0.2)',
  purple: '#af52de',
  purpleLight: 'rgba(175, 82, 222, 0.2)',
} as const;

// ── Gradients for Area Charts ─────────────────────────────
export const CHART_GRADIENTS = {
  primary: [
    { offset: 0, color: 'rgba(0, 113, 227, 0.4)' },
    { offset: 100, color: 'rgba(0, 113, 227, 0)' },
  ],
  success: [
    { offset: 0, color: 'rgba(52, 199, 89, 0.4)' },
    { offset: 100, color: 'rgba(52, 199, 89, 0)' },
  ],
  warning: [
    { offset: 0, color: 'rgba(255, 159, 10, 0.4)' },
    { offset: 100, color: 'rgba(255, 159, 10, 0)' },
  ],
} as const;

// ── Axis Styling ───────────────────────────────────────────
export const axisStyle = {
  axisLine: false,
  tickLine: false,
  tick: { fill: '#86868b', fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  label: { fill: '#86868b', fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
};

// ── Grid Styling ────────────────────────────────────────────
export const gridStyle = {
  stroke: '#e5e5ea',
  strokeDasharray: '4 4',
  strokeWidth: 1,
};

// ── Custom Tooltip ───────────────────────────────────────────
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="px-3 py-2 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg border border-[#f5f5f7]">
      {label && <p className="text-[11px] text-[#86868b] mb-1">{label}</p>}
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs font-medium text-[#1d1d1f]">
            {entry.name}: <span className="font-semibold">{entry.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Line Chart Props ────────────────────────────────────────
export const lineChartProps = {
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  strokeWidth: 2.5,
  dot: false,
  activeDot: { r: 5, strokeWidth: 2, stroke: '#ffffff' },
  connectNulls: false,
  animationDuration: 750,
  animationBegin: 0,
};

// ── Area Chart Props ────────────────────────────────────────
export const areaChartProps = {
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  strokeWidth: 2,
  animationDuration: 750,
};

// ── Bar Chart Props ────────────────────────────────────────
export const barChartProps = {
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  radius: [6, 6, 0, 0],
  animationDuration: 500,
};

// ── Pie Chart Props ────────────────────────────────────────
export const pieChartProps = {
  innerRadius: '60%',
  outerRadius: '80%',
  paddingAngle: 2,
  animationDuration: 750,
};

// ── Curve Generators ───────────────────────────────────────
export const curveTypes = {
  smooth: 'monotone',
  straight: 'linear',
  step: 'stepBefore',
} as const;

// ── Common Chart Container Class ──────────────────────────
export const CHART_CONTAINER = 'h-64 w-full';

// ── Chart Title Style ───────────────────────────────────────
export const CHART_TITLE = 'text-[15px] font-semibold text-[#1d1d1f] mb-4';

// ── Empty Chart State ───────────────────────────────────────
export function EmptyChart({ message = '暂无数据' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
      <p className="text-sm text-[#86868b]">{message}</p>
    </div>
  );
}

// ── Color Generator for Multi-series Charts ────────────────
export const CHART_PALETTE = [
  '#0071e3', // Blue
  '#5ac8fa', // Light Blue
  '#34c759', // Green
  '#ff9f0a', // Orange
  '#af52de', // Purple
  '#ff3b30', // Red
  '#ff2d55', // Pink
] as const;

export function getChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
