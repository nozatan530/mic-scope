import { useMemo, useState } from 'react';
import { runDspSelfTests } from '../dsp';
import type { LiveDebugInfo } from '../types';

interface DebugPanelProps {
  liveInfo: LiveDebugInfo;
}

export function DebugPanel({ liveInfo }: DebugPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const selfTest = useMemo(() => runDspSelfTests(), []);

  return (
    <aside
      aria-label="デバッグ情報"
      className="fixed bottom-16 md:bottom-3 right-3 z-50 w-[320px] max-w-[calc(100vw-24px)] bg-slate-900/95 text-slate-100 border border-slate-700 rounded-xl shadow-lg text-xs font-mono-tabular"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-left border-b border-slate-800 cursor-pointer"
      >
        <span className="font-semibold">
          DEBUG · 自動チェック:{' '}
          <span className={selfTest.allPassed ? 'text-emerald-400' : 'text-rose-400'}>
            {selfTest.allPassed ? 'PASS' : 'FAIL'}
          </span>
        </span>
        <span className="text-slate-400">{expanded ? '閉じる' : '開く'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <div className="text-slate-400 mb-1">マイク実測</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <div>fs: {liveInfo.fs || '—'} Hz</div>
              <div>trigger: {liveInfo.triggered ? 'OK' : 'FREE'}</div>
              <div>
                f: {liveInfo.frequency !== null ? `${liveInfo.frequency.toFixed(2)} Hz` : '—'}
              </div>
              <div>τ*: {liveInfo.tau !== null ? liveInfo.tau.toFixed(2) : '—'}</div>
              <div>r: {liveInfo.rChosen.toFixed(3)}</div>
              <div>RMS: {liveInfo.rms.toFixed(4)}</div>
              <div>
                なめらか:{' '}
                {liveInfo.smoothness !== null ? `${liveInfo.smoothness.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="mt-1.5 text-[11px] space-y-0.5 text-slate-300">
              <div>echoCancellation: {String(liveInfo.echoCancellation)}</div>
              <div>noiseSuppression: {String(liveInfo.noiseSuppression)}</div>
              <div>autoGainControl: {String(liveInfo.autoGainControl)}</div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2">
            <div className="text-slate-400 mb-1">dsp.ts 自動テスト (fs=48000)</div>
            <ul className="space-y-1 text-[11px]">
              {selfTest.items.map((item) => (
                <li key={item.name} className="flex items-start gap-1.5">
                  <span className={item.passed ? 'text-emerald-400' : 'text-rose-400'}>
                    {item.passed ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-slate-200">{item.name}</div>
                    <div className="text-slate-400 truncate">{item.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}
