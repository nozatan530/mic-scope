interface LoudnessBarProps {
  value: number; // 0 to 100
}

export function LoudnessBar({ value }: LoudnessBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = Math.round(clamped);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-4 flex md:flex-col items-center justify-between gap-3 md:w-24 shrink-0">
      <div className="flex md:flex-col items-baseline md:items-center gap-1.5 md:gap-0.5 shrink-0">
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
          大きさ
        </span>
        <span className="text-[11px] text-slate-500 hidden md:inline whitespace-nowrap">
          （振幅）
        </span>
      </div>

      {/* Horizontal bar on mobile */}
      <div
        className="flex-1 md:hidden h-5 bg-slate-100 border border-slate-200 rounded-md overflow-hidden relative"
        role="progressbar"
        aria-label="音の大きさ"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-emerald-500 transition-[width] duration-75"
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* Vertical bar on md+ */}
      <div
        className="hidden md:flex flex-col justify-end w-7 flex-1 min-h-[160px] bg-slate-100 border border-slate-200 rounded-md overflow-hidden relative"
        role="progressbar"
        aria-label="音の大きさ"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="w-full bg-emerald-500 transition-[height] duration-75"
          style={{ height: `${clamped}%` }}
        />
      </div>

      <div className="font-mono-tabular text-base md:text-lg font-bold text-slate-900 w-10 text-right md:text-center shrink-0">
        {rounded}
      </div>
    </div>
  );
}
