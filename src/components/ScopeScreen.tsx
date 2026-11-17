import { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  HelpCircle,
  Mic,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  X,
} from 'lucide-react';
import {
  GRID_DIVISIONS_X,
  SHELF_MAX_ITEMS,
  TIMEBASE_OPTIONS_MS,
  VERTICAL_ZOOM_OPTIONS,
} from '../constants';
import type { TimebaseMs, VerticalZoom } from '../constants';
import type {
  AnalysisResult,
  AnswerCheckFeedback,
  MicStatus,
  PausedSnapshot,
  ShelfItem,
} from '../types';
import { AnswerCheckCard, evaluateFrequencyAnswer } from './AnswerCheckCard';
import { LoudnessBar } from './LoudnessBar';
import { OscilloscopeCanvas } from './OscilloscopeCanvas';

interface ScopeScreenProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micStatus: MicStatus;
  isPaused: boolean;
  pausedSnapshot: PausedSnapshot | null;
  liveLoudness: number;
  liveAnalysis: AnalysisResult;
  msPerDiv: TimebaseMs;
  zoom: VerticalZoom;
  alwaysShowFreq: boolean;
  shelfItems: ShelfItem[];
  onTogglePause: () => void;
  onToggleMic: () => void;
  onChangeTimebase: (next: TimebaseMs) => void;
  onChangeZoom: (next: VerticalZoom) => void;
  onToggleAlwaysShowFreq: (next: boolean) => void;
  onSaveToShelf: (name: string, replaceId?: string) => void;
}

export function ScopeScreen({
  canvasRef,
  micStatus,
  isPaused,
  pausedSnapshot,
  liveLoudness,
  liveAnalysis,
  msPerDiv,
  zoom,
  alwaysShowFreq,
  shelfItems,
  onTogglePause,
  onToggleMic,
  onChangeTimebase,
  onChangeZoom,
  onToggleAlwaysShowFreq,
  onSaveToShelf,
}: ScopeScreenProps) {
  const [cursorAFrac, setCursorAFrac] = useState(0.2);
  const [cursorBFrac, setCursorBFrac] = useState(0.5);
  const [freqInput, setFreqInput] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<AnswerCheckFeedback | null>(null);
  const [revealedForCurrentPause, setRevealedForCurrentPause] = useState(false);

  // Save-to-shelf modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [shelfName, setShelfName] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState<string>('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [showUnitGuide, setShowUnitGuide] = useState(false);

  // Reset answer check state whenever pause resumes or a new snapshot is captured
  useEffect(() => {
    if (!isPaused) {
      setAnswerFeedback(null);
      setRevealedForCurrentPause(false);
      setFreqInput('');
    }
  }, [isPaused]);

  const timebaseIdx = TIMEBASE_OPTIONS_MS.indexOf(msPerDiv);
  const canStepTimeDown = timebaseIdx > 0;
  const canStepTimeUp = timebaseIdx < TIMEBASE_OPTIONS_MS.length - 1;

  const activeLoudness =
    isPaused && pausedSnapshot ? pausedSnapshot.analysis.loudness : liveLoudness;
  const activeAnalysis =
    isPaused && pausedSnapshot ? pausedSnapshot.analysis : liveAnalysis;

  const shouldRevealFreq =
    alwaysShowFreq || (isPaused && revealedForCurrentPause);

  const effectiveMsPerDiv =
    isPaused && pausedSnapshot ? pausedSnapshot.msPerDiv : msPerDiv;
  const totalWindowMs = effectiveMsPerDiv * GRID_DIVISIONS_X;
  const cursorDeltaMs = Math.abs(cursorBFrac - cursorAFrac) * totalWindowMs;

  const handleCheckAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPaused || !pausedSnapshot) return;
    const parsed = Number.parseFloat(freqInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const feedback = evaluateFrequencyAnswer(
      parsed,
      pausedSnapshot.analysis.frequency,
      pausedSnapshot.analysis.note?.label ?? null
    );
    setAnswerFeedback(feedback);
    setRevealedForCurrentPause(true);
  };

  const handleOpenSaveModal = () => {
    if (!pausedSnapshot) return;
    setShelfName('');
    setReplaceTargetId(shelfItems[0]?.id ?? '');
    setShowSaveModal(true);
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = shelfName.trim() || `波形 ${shelfItems.length + 1}`;
    const needsReplace = shelfItems.length >= SHELF_MAX_ITEMS;
    onSaveToShelf(trimmed, needsReplace ? replaceTargetId : undefined);
    setShowSaveModal(false);
    setSaveToast(`「${trimmed}」を棚に置きました`);
    window.setTimeout(() => setSaveToast(null), 2600);
  };

  const isMicStopped = micStatus === 'stopped' || micStatus === 'idle';

  return (
    <div className="space-y-4">
      {/* Waveform + Loudness Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        <OscilloscopeCanvas
          canvasRef={canvasRef}
          isPaused={isPaused}
          frozenSamples={pausedSnapshot?.displaySamples ?? null}
          zoom={zoom}
          msPerDiv={effectiveMsPerDiv}
          cursorAFrac={cursorAFrac}
          cursorBFrac={cursorBFrac}
          onCursorAChange={setCursorAFrac}
          onCursorBChange={setCursorBFrac}
        />
        <LoudnessBar value={activeLoudness} />
      </div>

      {/* Frequency & Note Display Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">
              振動数 f（Hz：1秒間に振動する回数）と音名（セント：音の高さの細かなずれ）
            </div>
            <div className="mt-1 font-mono-tabular text-lg sm:text-xl font-bold text-slate-900">
              {shouldRevealFreq ? (
                activeAnalysis.frequency !== null ? (
                  <span>
                    {Math.round(activeAnalysis.frequency)} Hz ／{' '}
                    <span className="font-sans font-semibold">
                      {activeAnalysis.note?.label ?? '—'}
                    </span>
                  </span>
                ) : (
                  <span>— Hz</span>
                )
              ) : (
                <span>？？？ Hz</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alwaysShowFreq}
                onChange={(e) => onToggleAlwaysShowFreq(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                振動数をいつも表示する
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowUnitGuide((v) => !v)}
              aria-expanded={showUnitGuide}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>単位の意味</span>
            </button>
          </div>
        </div>

        {showUnitGuide && (
          <dl className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs leading-relaxed text-slate-700">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <dt className="font-bold text-slate-900">ms（ミリ秒）</dt>
              <dd className="mt-0.5">
                1秒の1000分の1の時間（1 ms ＝ 0.001秒、1000 ms ＝ 1秒）。波はとても速いので ms で表します。
              </dd>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <dt className="font-bold text-slate-900">Hz（ヘルツ）</dt>
              <dd className="mt-0.5">
                1秒間に波が何回くり返すか（振動数）。数字が大きいほど高い音になります（例：ラ＝440 Hz）。
              </dd>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <dt className="font-bold text-slate-900">セント</dt>
              <dd className="mt-0.5">
                ピアノのとなり合う鍵盤（半音）を100等分した単位。＋は少し高め、−は少し低めを表します。
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Primary Pause/Resume */}
          <button
            type="button"
            onClick={onTogglePause}
            disabled={isMicStopped && !isPaused}
            className={`flex-1 min-w-[160px] min-h-[48px] px-5 py-2.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isPaused
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white'
            }`}
          >
            {isPaused ? (
              <>
                <Play className="w-5 h-5 shrink-0" />
                <span>再開</span>
              </>
            ) : (
              <>
                <Pause className="w-5 h-5 shrink-0" />
                <span>一時停止</span>
              </>
            )}
          </button>

          {/* Stop/Restart Mic */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`min-h-[48px] px-4 py-2.5 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isMicStopped
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isMicStopped ? (
              <>
                <Mic className="w-4 h-4 shrink-0" />
                <span>マイクを再開</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4 shrink-0" />
                <span>マイクを止める</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          {/* Timebase Control */}
          <div className="flex items-center justify-between gap-2">
            <div className="leading-tight shrink-0">
              <div className="text-xs font-medium text-slate-600">時間軸</div>
              <div className="text-[10px] text-slate-500">ms＝1/1000秒</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  canStepTimeDown &&
                  onChangeTimebase(TIMEBASE_OPTIONS_MS[timebaseIdx - 1])
                }
                disabled={!canStepTimeDown || isPaused}
                aria-label="時間軸を細かくする"
                className="min-w-[42px] min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-mono-tabular text-xs sm:text-sm font-semibold text-slate-900 min-w-[98px] sm:min-w-[116px] text-center whitespace-nowrap">
                1目盛り＝{effectiveMsPerDiv} ms
              </span>
              <button
                type="button"
                onClick={() =>
                  canStepTimeUp &&
                  onChangeTimebase(TIMEBASE_OPTIONS_MS[timebaseIdx + 1])
                }
                disabled={!canStepTimeUp || isPaused}
                aria-label="時間軸を広くする"
                className="min-w-[42px] min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Vertical Zoom Control */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              縦の拡大
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {VERTICAL_ZOOM_OPTIONS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => onChangeZoom(z)}
                  className={`min-w-[44px] min-h-[38px] px-2.5 rounded-md text-sm font-mono-tabular font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    zoom === z
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ×{z}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Paused Tools: Cursors, f = 1/T Calculator, Save to Shelf */}
      {isPaused && pausedSnapshot && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500">
                青（A）と橙（B）の線を動かして測ろう · 周期 T（波が1回くり返すのにかかる時間）
              </p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">
                T = {cursorDeltaMs.toFixed(1)} ms
                <span className="ml-2 text-xs font-sans font-normal text-slate-500">
                  （{(cursorDeltaMs / 1000).toFixed(4)} 秒）
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenSaveModal}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>棚に置く</span>
            </button>
          </div>

          {saveToast && (
            <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{saveToast}</span>
            </div>
          )}

          {/* Frequency Calculation Input */}
          <form onSubmit={handleCheckAnswer} className="space-y-2.5">
            <div>
              <label
                htmlFor="freq-calc-input"
                className="block text-sm font-semibold text-slate-800"
              >
                振動数を計算しよう
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                f = 1/T。ms を s に直すのを忘れずに
              </p>
            </div>

            <div className="flex items-stretch gap-2">
              <div className="relative flex-1 max-w-[220px]">
                <input
                  id="freq-calc-input"
                  type="number"
                  step="any"
                  min="1"
                  inputMode="decimal"
                  placeholder="例: 440"
                  value={freqInput}
                  onChange={(e) => setFreqInput(e.target.value)}
                  className="w-full min-h-[46px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 bg-white font-mono-tabular text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-mono-tabular text-slate-500 pointer-events-none">
                  Hz
                </span>
              </div>
              <button
                type="submit"
                disabled={!freqInput.trim()}
                className="min-h-[46px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                答え合わせ
              </button>
            </div>
          </form>

          {answerFeedback && <AnswerCheckCard feedback={answerFeedback} />}
        </div>
      )}

      {/* Save to Shelf Modal */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-modal-title"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="save-modal-title" className="text-lg font-bold text-slate-900">
                波形を棚に置く
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleConfirmSave} className="space-y-4">
              <div>
                <label
                  htmlFor="shelf-name-input"
                  className="block text-sm font-semibold text-slate-800 mb-1"
                >
                  波形の名前
                </label>
                <input
                  id="shelf-name-input"
                  type="text"
                  maxLength={24}
                  placeholder="例：声のあ、リコーダーのド"
                  value={shelfName}
                  onChange={(e) => setShelfName(e.target.value)}
                  autoFocus
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1.5 text-xs text-amber-800 font-medium">
                  名前や連絡先は書かない
                </p>
              </div>

              {shelfItems.length >= SHELF_MAX_ITEMS && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">
                    棚がいっぱいです（最大4枚）。どれと入れ替えますか？
                  </p>
                  <div className="space-y-1.5">
                    {shelfItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                          replaceTargetId === item.id
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="replaceTarget"
                          value={item.id}
                          checked={replaceTargetId === item.id}
                          onChange={() => setReplaceTargetId(item.id)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-tabular">
                            {item.frequency !== null
                              ? `${Math.round(item.frequency)} Hz`
                              : '—'}{' '}
                            · 大きさ {Math.round(item.loudness)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white cursor-pointer"
                >
                  置く
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
