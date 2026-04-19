/**
 * MNEMOSYNE Editorial Chart Theme for Recharts
 */

// ── Axis Styling ───────────────────────────────────────────
export const axisStyle = {
  axisLine: false,
  tickLine: false,
  tick: { fill: '#888', fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  label: { fill: '#888', fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
};

// ── Custom Tooltip ───────────────────────────────────────────
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="px-3 py-2 bg-[#F7F7F7] backdrop-blur-xl rounded-3xl border border-[#1d1d1f]/30 shadow-sm">
      {label && <p className="text-[11px] text-[#888] mb-1">{label}</p>}
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

// ── Chart Title Style ───────────────────────────────────────
export const CHART_TITLE = 'text-[15px] font-semibold text-[#1d1d1f] mb-4';

// ── Empty Chart State ───────────────────────────────────────
export function EmptyChart({ message = '暂无数据' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
      <p className="text-sm text-[#888]">{message}</p>
    </div>
  );
}
