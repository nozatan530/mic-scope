import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Edit3,
  Layers,
  Rows,
  Trash2,
  X,
} from 'lucide-react';
import {
  COMPARE_PROMPTS,
  GRID_DIVISIONS_X,
  GRID_DIVISIONS_Y,
  TIMEBASE_OPTIONS_MS,
} from '../constants';
import type { TimebaseMs } from '../constants';
import { findFirstRisingZeroCrossing } from '../dsp';
import type { ShelfItem } from '../types';

interface ShelfScreenProps {
  items: ShelfItem[];
  onRenameItem: (id: string, nextName: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onGoToScope: () => void;
}

function getAlignedSamples(item: ShelfItem, windowMs: number, normalize: boolean): number[] {
  const { samples, fs } = item;
  if (samples.length === 0) return [];

  const neededCount = Math.max(2, Math.round((windowMs / 1000) * fs));
  // 左端を「下から上へ 0 を横切る最初の点」にそろえる
  const crossing = findFirstRisingZeroCrossing(samples);
  const startIdx = crossing >= 0 ? crossing : 0;

  const available = samples.slice(startIdx, startIdx + neededCount);
  if (!normalize) return available;

  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs <= 1e-6) return available;
  const gain = 0.85 / maxAbs;
  return available.map((v) => v * gain);
}

function WaveformThumbnail({
  samples,
  accentColor,
}: {
  samples: number[];
  accentColor?: string;
}) {
  const pathData = useMemo(() => {
    if (samples.length < 2) return '';
    const w = 160;
    const h = 64;
    const midY = h / 2;
    const step = Math.max(1, Math.floor(samples.length / 120));
    const pts: string[] = [];
    for (let i = 0; i < samples.length; i += step) {
      const x = ((i / (samples.length - 1)) * w).toFixed(1);
      const y = (midY - Math.max(-1, Math.min(1, samples[i])) * (h * 0.44)).toFixed(1);
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${x},${y}`);
    }
    return pts.join(' ');
  }, [samples]);

  return (
    <div className="w-full h-16 rounded-lg bg-[#07130d] border border-emerald-950 overflow-hidden">
      <svg viewBox="0 0 160 64" className="w-full h-full" preserveAspectRatio="none">
        <line x1="0" y1="32" x2="160" y2="32" stroke="#184d30" strokeWidth="1" />
        <line x1="80" y1="0" x2="80" y2="64" stroke="#103822" strokeWidth="1" />
        {pathData && (
          <path
            d={pathData}
            fill="none"
            stroke={accentColor ?? '#39ff7a'}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}

function CompareCanvas({
  item1,
  item2,
  mode,
  commonMsPerDiv,
  normalize,
}: {
  item1: ShelfItem;
  item2: ShelfItem;
  mode: 'overlay' | 'stacked';
  commonMsPerDiv: TimebaseMs;
  normalize: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(100, Math.round(rect.width));
      const cssH = Math.max(180, Math.round(rect.height));

      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#07130d';
      ctx.fillRect(0, 0, cssW, cssH);

      const windowMs = commonMsPerDiv * GRID_DIVISIONS_X;
      const s1 = getAlignedSamples(item1, windowMs, normalize);
      const s2 = getAlignedSamples(item2, windowMs, normalize);

      const drawGrid = (top: number, height: number) => {
        const divW = cssW / GRID_DIVISIONS_X;
        const divH = height / (mode === 'overlay' ? GRID_DIVISIONS_Y : 4);
        ctx.lineWidth = 1;
        for (let i = 1; i < GRID_DIVISIONS_X; i++) {
          const x = Math.round(i * divW) + 0.5;
          ctx.strokeStyle = '#103b24';
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
        }
        const rows = mode === 'overlay' ? GRID_DIVISIONS_Y : 4;
        for (let j = 1; j < rows; j++) {
          const y = Math.round(top + j * divH) + 0.5;
          const isZero = j === rows / 2;
          ctx.strokeStyle = isZero ? '#257a4c' : '#103b24';
          ctx.lineWidth = isZero ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cssW, y);
          ctx.stroke();
        }
      };

      const drawTrace = (
        samples: number[],
        fs: number,
        color: string,
        top: number,
        height: number
      ) => {
        if (samples.length < 2) return;
        const midY = top + height / 2;
        const halfH = height * 0.45;
        const fullWindowSamples = (windowMs / 1000) * fs;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        for (let i = 0; i < samples.length; i++) {
          const x = Math.min(cssW, (i / Math.max(1, fullWindowSamples - 1)) * cssW);
          const y = midY - Math.max(-1, Math.min(1, samples[i])) * halfH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      if (mode === 'overlay') {
        drawGrid(0, cssH);
        drawTrace(s1, item1.fs, '#60a5fa', 0, cssH); // Blue
        drawTrace(s2, item2.fs, '#fb923c', 0, cssH); // Orange
      } else {
        const half = cssH / 2;
        drawGrid(0, half);
        drawGrid(half, half);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, half);
        ctx.lineTo(cssW, half);
        ctx.stroke();

        drawTrace(s1, item1.fs, '#60a5fa', 0, half);
        drawTrace(s2, item2.fs, '#fb923c', half, half);
      }

      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`0〜${windowMs} ms（共通時間軸）`, cssW - 8, cssH - 6);

      ctx.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [item1, item2, mode, commonMsPerDiv, normalize]);

  return (
    <div className="rounded-xl overflow-hidden border border-emerald-950 bg-[#07130d]">
      <canvas
        ref={canvasRef}
        className="w-full h-[240px] sm:h-[290px] block"
        aria-label="2つの波形を比べる画面"
      />
    </div>
  );
}

export function ShelfScreen({
  items,
  onRenameItem,
  onDeleteItem,
  onClearAll,
  onGoToScope,
}: ShelfScreenProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Compare state
  const [compareMode, setCompareMode] = useState<'overlay' | 'stacked'>('overlay');
  const [normalizeAmplitude, setNormalizeAmplitude] = useState(false);
  const [commonMsPerDiv, setCommonMsPerDiv] = useState<TimebaseMs>(2);
  const [promptIdx, setPromptIdx] = useState(0);

  // Keep selectedIds valid when items change
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((it) => it.id === id)));
  }, [items]);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => items.find((it) => it.id === id))
        .filter((it): it is ShelfItem => Boolean(it)),
    [selectedIds, items]
  );

  // Update default common timebase when 2 items become selected
  useEffect(() => {
    if (selectedItems.length === 2) {
      const minMs = Math.min(selectedItems[0].msPerDiv, selectedItems[1].msPerDiv);
      const valid =
        TIMEBASE_OPTIONS_MS.find((m) => m === minMs) ?? TIMEBASE_OPTIONS_MS[2];
      setCommonMsPerDiv(valid);
    }
  }, [selectedItems]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const startEditing = (item: ShelfItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const commitEditing = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRenameItem(id, trimmed);
    }
    setEditingId(null);
  };

  const formatPeriodMs = (freq: number | null) => {
    if (freq === null || freq <= 0) return '—';
    return `${(1000 / freq).toFixed(2)} ms`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">棚・比べる</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            保存した波形（最大4枚）から2枚を選ぶと、重ねたり並べたりして比べられます。
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-sm font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>棚を空にする</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-base font-semibold text-slate-800">
            棚にはまだ波形がありません
          </p>
          <p className="text-sm text-slate-600">
            スコープで一時停止して「棚に置く」を押すと、ここに波形を保存できます。
          </p>
          <button
            type="button"
            onClick={onGoToScope}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
          >
            スコープに戻る
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {items.map((item) => {
            const selIdx = selectedIds.indexOf(item.id);
            const isFirst = selIdx === 0;
            const isSecond = selIdx === 1;
            const isSelected = selIdx !== -1;

            const cardBorder = isFirst
              ? 'border-blue-600 ring-2 ring-blue-100'
              : isSecond
                ? 'border-orange-500 ring-2 ring-orange-100'
                : 'border-slate-200';

            const thumbColor = isFirst
              ? '#60a5fa'
              : isSecond
                ? '#fb923c'
                : '#39ff7a';

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl p-4 space-y-3 transition-colors ${cardBorder}`}
              >
                <WaveformThumbnail samples={item.samples} accentColor={thumbColor} />

                <div className="flex items-start justify-between gap-2">
                  {editingId === item.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitEditing(item.id);
                      }}
                      className="flex-1 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        maxLength={24}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        className="flex-1 min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-300 text-sm text-slate-900"
                      />
                      <button
                        type="submit"
                        aria-label="名前を確定"
                        className="min-w-[38px] min-h-[38px] rounded-lg bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 truncate">
                          {item.name}
                        </h3>
                        {isFirst && (
                          <span className="text-xs font-bold text-blue-700 whitespace-nowrap">
                            1枚目（青）
                          </span>
                        )}
                        {isSecond && (
                          <span className="text-xs font-bold text-orange-700 whitespace-nowrap">
                            2枚目（橙）
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 font-mono-tabular flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>
                          {item.frequency !== null
                            ? `${Math.round(item.frequency)} Hz`
                            : '— Hz'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{item.noteLabel ?? '—'}</span>
                        <span aria-hidden="true">·</span>
                        <span>大きさ {Math.round(item.loudness)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditing(item)}
                      aria-label={`${item.name}の名前を変える`}
                      className="w-10 h-10 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      aria-label={`${item.name}を削除`}
                      className="w-10 h-10 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-700 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleSelect(item.id)}
                  className={`w-full min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                    isFirst
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : isSecond
                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {isSelected ? '選択中（外す）' : '比べるために選ぶ'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare Section */}
      {selectedItems.length === 1 && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          もう1枚選ぶと「比べる」画面が表示されます。
        </div>
      )}

      {selectedItems.length === 2 && (
        <section
          aria-label="波形の比較"
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
              <span className="text-blue-700">
                1枚目（青）：{selectedItems[0].name}
              </span>
              <span className="text-slate-400">vs</span>
              <span className="text-orange-600">
                2枚目（橙）：{selectedItems[1].name}
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setCompareMode('overlay')}
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  compareMode === 'overlay'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>重ねる</span>
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('stacked')}
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  compareMode === 'stacked'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Rows className="w-4 h-4 shrink-0" />
                <span>上下に並べる</span>
              </button>
            </div>
          </div>

          <CompareCanvas
            item1={selectedItems[0]}
            item2={selectedItems[1]}
            mode={compareMode}
            commonMsPerDiv={commonMsPerDiv}
            normalize={normalizeAmplitude}
          />

          {/* Compare Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={normalizeAmplitude}
                onChange={(e) => setNormalizeAmplitude(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
              <span className="text-sm font-semibold text-slate-800">
                大きさをそろえる（形だけ比べる）
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">共通の時間軸：</span>
              <div className="flex items-center gap-1">
                {TIMEBASE_OPTIONS_MS.map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setCommonMsPerDiv(ms)}
                    className={`min-w-[40px] min-h-[36px] px-2 rounded-lg text-xs font-mono-tabular font-semibold border cursor-pointer ${
                      commonMsPerDiv === ms
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {ms}ms
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">項目</th>
                  <th className="py-2.5 px-3 font-semibold text-blue-700">
                    1枚目（青）{selectedItems[0].name}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-orange-600">
                    2枚目（橙）{selectedItems[1].name}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-tabular">
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">振動数 f</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {selectedItems[0].frequency !== null
                      ? `${Math.round(selectedItems[0].frequency)} Hz`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {selectedItems[1].frequency !== null
                      ? `${Math.round(selectedItems[1].frequency)} Hz`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">音名</td>
                  <td className="py-2.5 px-3 font-sans text-slate-900">
                    {selectedItems[0].noteLabel ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-900">
                    {selectedItems[1].noteLabel ?? '—'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">周期 T（ms）</td>
                  <td className="py-2.5 px-3 text-slate-900">
                    {formatPeriodMs(selectedItems[0].frequency)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-900">
                    {formatPeriodMs(selectedItems[1].frequency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">大きさ</td>
                  <td className="py-2.5 px-3 text-slate-900">
                    {Math.round(selectedItems[0].loudness)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-900">
                    {Math.round(selectedItems[1].loudness)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Guiding Inquiry Prompt */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-emerald-700">
                比べるヒント（問い {promptIdx + 1} / {COMPARE_PROMPTS.length}）
              </div>
              <p className="mt-1 text-sm sm:text-base font-semibold text-slate-900">
                {COMPARE_PROMPTS[promptIdx]}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setPromptIdx((i) => (i + 1) % COMPARE_PROMPTS.length)
              }
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>次の問い</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </section>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-confirm-title"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="clear-confirm-title" className="text-lg font-bold text-slate-900">
                棚を空にしますか？
              </h3>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              保存してある {items.length} 枚の波形をすべて削除します。もとには戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-semibold text-white cursor-pointer"
              >
                すべて削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
