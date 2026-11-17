import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Mic, RotateCcw, Trophy } from 'lucide-react';
import { CHALLENGE_CONFIG } from '../constants';
import {
  centsDifference,
  centsFromNearestA,
  centsFromNearestPitchClass,
  frequencyToNote,
  median,
} from '../dsp';
import type {
  AnalysisResult,
  ChallengeClearedMap,
  ChallengeId,
  MicStatus,
} from '../types';

export interface HistorySample {
  time: number;
  frequency: number | null;
  rms: number;
  smoothness: number | null;
}

interface ChallengeScreenProps {
  clearedMap: ChallengeClearedMap;
  micStatus: MicStatus;
  liveAnalysisRef: React.MutableRefObject<AnalysisResult>;
  historyRef: React.MutableRefObject<HistorySample[]>;
  onMarkCleared: (id: ChallengeId) => void;
  onStartMic: () => void;
}

interface ChallengeMeta {
  id: ChallengeId;
  title: string;
  summary: string;
  durationLabel: string;
}

interface DoremiStep {
  label: string;
  en: string;
  pitchClass: number;
}

const DOREMI_STEPS: DoremiStep[] = [
  { label: 'ド', en: 'C', pitchClass: 0 },
  { label: 'レ', en: 'D', pitchClass: 2 },
  { label: 'ミ', en: 'E', pitchClass: 4 },
  { label: 'ファ', en: 'F', pitchClass: 5 },
  { label: 'ソ', en: 'G', pitchClass: 7 },
  { label: 'ラ', en: 'A', pitchClass: 9 },
  { label: 'シ', en: 'B', pitchClass: 11 },
  { label: 'ド', en: 'C', pitchClass: 0 },
];

const CHALLENGES: ChallengeMeta[] = [
  {
    id: 'keep-a',
    title: '1. ラを2秒キープ',
    summary: 'どのオクターブの「ラ」でもOK。±30セント以内を2秒続けよう。',
    durationLabel: '2.0秒',
  },
  {
    id: 'doremi-scale',
    title: '2. ドレミチャレンジ',
    summary: 'ド・レ・ミ・ファ・ソ・ラ・シ・ドの8音を、それぞれ1秒ずつキープしよう。',
    durationLabel: '各1.0秒',
  },
  {
    id: 'octave-up',
    title: '3. 1オクターブ上を出そう',
    summary: '基準にした音の2倍の振動数を1.5秒キープしよう。',
    durationLabel: '1.5秒',
  },
  {
    id: 'loudness-only',
    title: '4. 高さはそのまま、大きさだけ変えよう',
    summary: '基準と同じ高さのまま、大きさを2倍以上と0.5倍以下で各1.5秒キープ。',
    durationLabel: '各1.5秒',
  },
  {
    id: 'smooth-wave',
    title: '5. なめらかな波を出そう',
    summary: '口笛や「うー」の声で、なめらか度90%以上を2秒続けよう。',
    durationLabel: '2.0秒',
  },
];

function ProgressRing({
  progress,
  label,
  isCleared,
}: {
  progress: number; // 0..1
  label: string;
  isCleared: boolean;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={isCleared ? '#059669' : '#10b981'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono-tabular text-xl font-bold text-slate-900">
          {label}
        </span>
      </div>
    </div>
  );
}

function CentsNeedleMeter({
  cents,
  tolerance,
}: {
  cents: number | null;
  tolerance: number;
}) {
  const clamped = cents !== null ? Math.max(-50, Math.min(50, cents)) : 0;
  // Map -50..+50 to -60deg..+60deg
  const angleDeg = (clamped / 50) * 60;
  const inZone = cents !== null && Math.abs(cents) <= tolerance;

  return (
    <div className="w-full max-w-xs mx-auto space-y-2">
      <svg viewBox="0 0 240 128" className="w-full h-32">
        {/* Background arc */}
        <path
          d="M 28 108 A 92 92 0 0 1 212 108"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Target green zone (-30..+30) */}
        <path
          d="M 65 36 A 92 92 0 0 1 175 36"
          fill="none"
          stroke="#a7f3d0"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Center tick */}
        <line x1="120" y1="10" x2="120" y2="26" stroke="#059669" strokeWidth="3" />

        {/* Needle */}
        <g
          transform={`translate(120, 108) rotate(${angleDeg})`}
          style={{ transition: 'transform 80ms linear' }}
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="-82"
            stroke={cents === null ? '#94a3b8' : inZone ? '#059669' : '#0f172a'}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="0" cy="0" r="7" fill="#0f172a" />
        </g>

        <text x="18" y="124" fontSize="11" fill="#64748b" fontFamily="monospace">
          -50
        </text>
        <text
          x="120"
          y="124"
          fontSize="11"
          fill="#059669"
          textAnchor="middle"
          fontFamily="monospace"
        >
          0
        </text>
        <text
          x="222"
          y="124"
          fontSize="11"
          fill="#64748b"
          textAnchor="end"
          fontFamily="monospace"
        >
          +50
        </text>
      </svg>

      <div className="text-center font-mono-tabular text-lg font-bold text-slate-900">
        {cents === null
          ? '音を出してください'
          : (() => {
              // 丸めてから符号を決める（−0.3 を「−0」と出さない）
              const r = Math.round(cents);
              return `${r > 0 ? '＋' : r < 0 ? '−' : ''}${Math.abs(r)} セント`;
            })()}
      </div>
      <p className="text-center text-xs text-slate-500">
        100セント ＝ 半音1つぶん（＋は高め、−は低め）
      </p>
    </div>
  );
}

export function ChallengeScreen({
  clearedMap,
  micStatus,
  liveAnalysisRef,
  historyRef,
  onMarkCleared,
  onStartMic,
}: ChallengeScreenProps) {
  const [activeId, setActiveId] = useState<ChallengeId | null>(null);

  // Baseline for challenges 2 & 3
  const [baselineFreq, setBaselineFreq] = useState<number | null>(null);
  const [baselineRms, setBaselineRms] = useState<number | null>(null);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // Challenge 3 phase: 1 = loud (>=2x), 2 = quiet (<=0.5x)
  const [loudnessPhase, setLoudnessPhase] = useState<1 | 2>(1);
  const [phase1Done, setPhase1Done] = useState(false);

  // Do-Re-Mi challenge state
  const [doremiStepIdx, setDoremiStepIdx] = useState(0);
  const [doremiCleared, setDoremiCleared] = useState<boolean[]>(() =>
    DOREMI_STEPS.map(() => false)
  );
  const doremiStepIdxRef = useRef(0);
  const doremiClearedRef = useRef<boolean[]>(DOREMI_STEPS.map(() => false));
  const [displayCentsDoremi, setDisplayCentsDoremi] = useState<number | null>(null);

  // Live UI metrics updated via rAF
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [justCleared, setJustCleared] = useState(false);
  const [displayFreq, setDisplayFreq] = useState<number | null>(null);
  const [displayCentsA, setDisplayCentsA] = useState<number | null>(null);
  const [displayNearestALabel, setDisplayNearestALabel] = useState<string>('ラ');
  const [displaySmoothness, setDisplaySmoothness] = useState<number | null>(null);
  const [displayRms, setDisplayRms] = useState<number>(0);

  const holdAccumRef = useRef(0);
  const clearedInSessionRef = useRef(false);
  const smoothedCentsRef = useRef<number | null>(null);

  const resetSession = () => {
    holdAccumRef.current = 0;
    clearedInSessionRef.current = false;
    smoothedCentsRef.current = null;
    doremiStepIdxRef.current = 0;
    const emptySteps = DOREMI_STEPS.map(() => false);
    doremiClearedRef.current = emptySteps;
    setDoremiStepIdx(0);
    setDoremiCleared(emptySteps);
    setDisplayCentsDoremi(null);
    setHoldSeconds(0);
    setJustCleared(false);
    setBaselineFreq(null);
    setBaselineRms(null);
    setBaselineError(null);
    setLoudnessPhase(1);
    setPhase1Done(false);
  };

  const selectDoremiStep = (idx: number) => {
    doremiStepIdxRef.current = idx;
    setDoremiStepIdx(idx);
    holdAccumRef.current = 0;
    smoothedCentsRef.current = null;
    setHoldSeconds(0);
  };

  const openChallenge = (id: ChallengeId) => {
    resetSession();
    setActiveId(id);
  };

  const captureBaseline = () => {
    const now = performance.now();
    const cutoff = now - CHALLENGE_CONFIG.BASELINE_WINDOW_MS;
    const recent = historyRef.current.filter((h) => h.time >= cutoff);
    const validFreqs = recent
      .map((h) => h.frequency)
      .filter((f): f is number => f !== null);
    const validRms = recent
      .filter((h) => h.frequency !== null && h.rms > 0)
      .map((h) => h.rms);

    const f0 = median(validFreqs);
    const r0 = median(validRms);

    if (f0 === null || r0 === null || validFreqs.length < 2) {
      setBaselineError(
        '音が小さいか途切れています。声を安定して出しながら押してみてください。'
      );
      return;
    }

    setBaselineError(null);
    setBaselineFreq(f0);
    setBaselineRms(r0);
    holdAccumRef.current = 0;
    setHoldSeconds(0);
    setLoudnessPhase(1);
    setPhase1Done(false);
    setJustCleared(false);
    clearedInSessionRef.current = false;
  };

  // Real-time challenge evaluation loop
  useEffect(() => {
    if (!activeId || micStatus !== 'active') return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const analysis = liveAnalysisRef.current;
      const f = analysis.frequency;
      setDisplayFreq(f);
      setDisplaySmoothness(analysis.smoothness);
      setDisplayRms(analysis.rms);

      if (clearedInSessionRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (activeId === 'keep-a') {
        if (f !== null) {
          const info = centsFromNearestA(f);
          setDisplayNearestALabel(info.label);
          // Smooth needle slightly while testing strict condition
          smoothedCentsRef.current =
            smoothedCentsRef.current === null
              ? info.cents
              : smoothedCentsRef.current * 0.65 + info.cents * 0.35;
          setDisplayCentsA(smoothedCentsRef.current);

          if (Math.abs(info.cents) <= CHALLENGE_CONFIG.A_CENTS_TOLERANCE) {
            holdAccumRef.current += dt;
          } else {
            holdAccumRef.current = 0;
          }
        } else {
          smoothedCentsRef.current = null;
          setDisplayCentsA(null);
          holdAccumRef.current = 0;
        }

        setHoldSeconds(holdAccumRef.current);
        if (holdAccumRef.current >= CHALLENGE_CONFIG.A_HOLD_SECONDS) {
          clearedInSessionRef.current = true;
          setJustCleared(true);
          onMarkCleared('keep-a');
        }
      } else if (activeId === 'doremi-scale') {
        const stepIdx = doremiStepIdxRef.current;
        const targetStep = DOREMI_STEPS[stepIdx];
        if (f !== null && targetStep) {
          const info = centsFromNearestPitchClass(f, targetStep.pitchClass);
          smoothedCentsRef.current =
            smoothedCentsRef.current === null
              ? info.cents
              : smoothedCentsRef.current * 0.65 + info.cents * 0.35;
          setDisplayCentsDoremi(smoothedCentsRef.current);

          if (Math.abs(info.cents) <= CHALLENGE_CONFIG.DOREMI_CENTS_TOLERANCE) {
            holdAccumRef.current += dt;
          } else {
            holdAccumRef.current = 0;
          }
        } else {
          smoothedCentsRef.current = null;
          setDisplayCentsDoremi(null);
          holdAccumRef.current = 0;
        }

        setHoldSeconds(holdAccumRef.current);
        if (
          !doremiClearedRef.current[stepIdx] &&
          holdAccumRef.current >= CHALLENGE_CONFIG.DOREMI_HOLD_SECONDS
        ) {
          const nextCleared = [...doremiClearedRef.current];
          nextCleared[stepIdx] = true;
          doremiClearedRef.current = nextCleared;
          setDoremiCleared(nextCleared);

          holdAccumRef.current = 0;
          smoothedCentsRef.current = null;
          setHoldSeconds(0);

          const nextIncomplete = nextCleared.findIndex(
            (done, i) => !done && i > stepIdx
          );
          const anyIncomplete =
            nextIncomplete !== -1
              ? nextIncomplete
              : nextCleared.findIndex((done) => !done);

          if (anyIncomplete === -1) {
            clearedInSessionRef.current = true;
            setJustCleared(true);
            onMarkCleared('doremi-scale');
          } else {
            doremiStepIdxRef.current = anyIncomplete;
            setDoremiStepIdx(anyIncomplete);
          }
        }
      } else if (activeId === 'octave-up') {
        if (baselineFreq !== null && f !== null) {
          const centsErr = Math.abs(centsDifference(f, baselineFreq * 2));
          if (centsErr <= CHALLENGE_CONFIG.OCTAVE_CENTS_TOLERANCE) {
            holdAccumRef.current += dt;
          } else {
            holdAccumRef.current = 0;
          }
        } else {
          holdAccumRef.current = 0;
        }

        setHoldSeconds(holdAccumRef.current);
        if (holdAccumRef.current >= CHALLENGE_CONFIG.OCTAVE_HOLD_SECONDS) {
          clearedInSessionRef.current = true;
          setJustCleared(true);
          onMarkCleared('octave-up');
        }
      } else if (activeId === 'loudness-only') {
        if (baselineFreq !== null && baselineRms !== null && f !== null) {
          const pitchOk =
            Math.abs(centsDifference(f, baselineFreq)) <=
            CHALLENGE_CONFIG.LOUDNESS_PITCH_TOLERANCE_CENTS;
          const ratio = analysis.rms / baselineRms;

          const condOk =
            loudnessPhase === 1
              ? pitchOk && ratio >= CHALLENGE_CONFIG.LOUDNESS_HIGH_RATIO
              : pitchOk && ratio <= CHALLENGE_CONFIG.LOUDNESS_LOW_RATIO;

          if (condOk) {
            holdAccumRef.current += dt;
          } else {
            holdAccumRef.current = 0;
          }
        } else {
          holdAccumRef.current = 0;
        }

        setHoldSeconds(holdAccumRef.current);
        if (holdAccumRef.current >= CHALLENGE_CONFIG.LOUDNESS_HOLD_SECONDS) {
          if (loudnessPhase === 1) {
            setPhase1Done(true);
            setLoudnessPhase(2);
            holdAccumRef.current = 0;
            setHoldSeconds(0);
          } else {
            clearedInSessionRef.current = true;
            setJustCleared(true);
            onMarkCleared('loudness-only');
          }
        }
      } else if (activeId === 'smooth-wave') {
        if (
          f !== null &&
          analysis.smoothness !== null &&
          analysis.smoothness >= CHALLENGE_CONFIG.SMOOTHNESS_THRESHOLD_PCT
        ) {
          holdAccumRef.current += dt;
        } else {
          holdAccumRef.current = 0;
        }

        setHoldSeconds(holdAccumRef.current);
        if (holdAccumRef.current >= CHALLENGE_CONFIG.SMOOTHNESS_HOLD_SECONDS) {
          clearedInSessionRef.current = true;
          setJustCleared(true);
          onMarkCleared('smooth-wave');
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeId,
    micStatus,
    baselineFreq,
    baselineRms,
    loudnessPhase,
    liveAnalysisRef,
    onMarkCleared,
  ]);

  if (!activeId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">チャレンジ</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            声や楽器の音で5つのお題に挑戦しよう。クリアすると ✓ がつきます。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {CHALLENGES.map((ch) => {
            const cleared = clearedMap[ch.id];
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => openChallenge(ch.id)}
                className={`text-left bg-white border rounded-xl p-4 sm:p-5 transition-colors cursor-pointer flex flex-col justify-between gap-3 hover:border-emerald-500 ${
                  cleared ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-base text-slate-900">{ch.title}</h3>
                    {cleared && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>クリア</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{ch.summary}</p>
                </div>
                <div className="text-xs font-semibold text-emerald-700">
                  挑戦する →
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const meta = CHALLENGES.find((c) => c.id === activeId)!;
  const targetSec =
    activeId === 'keep-a'
      ? CHALLENGE_CONFIG.A_HOLD_SECONDS
      : activeId === 'doremi-scale'
        ? CHALLENGE_CONFIG.DOREMI_HOLD_SECONDS
        : activeId === 'octave-up'
          ? CHALLENGE_CONFIG.OCTAVE_HOLD_SECONDS
          : activeId === 'loudness-only'
            ? CHALLENGE_CONFIG.LOUDNESS_HOLD_SECONDS
            : CHALLENGE_CONFIG.SMOOTHNESS_HOLD_SECONDS;

  const ringProgress = justCleared ? 1 : holdSeconds / targetSec;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>一覧にもどる</span>
        </button>

        <button
          type="button"
          onClick={resetSession}
          className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>やり直す</span>
        </button>
      </div>

      {micStatus !== 'active' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <h3 className="text-lg font-bold text-slate-900">{meta.title}</h3>
          <p className="text-sm text-slate-600">
            チャレンジを始めるにはマイクをオンにしてください。
          </p>
          <button
            type="button"
            onClick={onStartMic}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>マイクをオンにする</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-slate-900">{meta.title}</h3>
            <p className="text-sm text-slate-600">{meta.summary}</p>
          </div>

          {/* Challenge 1: Keep A */}
          {activeId === 'keep-a' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-xs text-slate-500">ねらう音</div>
                <div className="text-2xl font-bold text-slate-900 mt-0.5">
                  {displayFreq !== null ? displayNearestALabel : 'ラ（110 / 220 / 440 / 880 Hz）'}
                </div>
              </div>
              <CentsNeedleMeter
                cents={displayCentsA}
                tolerance={CHALLENGE_CONFIG.A_CENTS_TOLERANCE}
              />
            </div>
          )}

          {/* Challenge 2: Do-Re-Mi Scale */}
          {activeId === 'doremi-scale' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {DOREMI_STEPS.map((step, idx) => {
                  const done = doremiCleared[idx];
                  const isActive = idx === doremiStepIdx && !justCleared;
                  return (
                    <button
                      key={`${step.label}_${idx}`}
                      type="button"
                      onClick={() => selectDoremiStep(idx)}
                      className={`min-h-[48px] px-2 py-1.5 rounded-xl border text-center transition-colors cursor-pointer ${
                        done
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                          : isActive
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-bold leading-tight">
                        {step.label}
                      </div>
                      <div className="text-[11px] opacity-80 font-mono-tabular">
                        {done ? '✓' : step.en}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-center space-y-1">
                <div className="text-xs text-slate-500">
                  いまねらう音（{doremiCleared.filter(Boolean).length} / {DOREMI_STEPS.length}）
                </div>
                <div className="text-3xl font-bold text-slate-900">
                  {DOREMI_STEPS[doremiStepIdx]?.label}（{DOREMI_STEPS[doremiStepIdx]?.en}）
                </div>
                <div className="text-xs text-slate-600 font-mono-tabular">
                  聞こえている音：
                  {displayFreq !== null
                    ? `${frequencyToNote(displayFreq).label} · ${Math.round(displayFreq)} Hz`
                    : '—'}
                </div>
              </div>

              <CentsNeedleMeter
                cents={displayCentsDoremi}
                tolerance={CHALLENGE_CONFIG.DOREMI_CENTS_TOLERANCE}
              />
            </div>
          )}

          {/* Challenge 2: Octave Up */}
          {activeId === 'octave-up' && (
            <div className="space-y-4 text-center">
              {baselineFreq === null ? (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-slate-700">
                    まず好きな高さで声を出しながら、下のボタンを押してください。
                  </p>
                  <div className="font-mono-tabular text-2xl font-bold text-slate-900">
                    いま：{displayFreq !== null ? `${Math.round(displayFreq)} Hz` : '— Hz'}
                  </div>
                  {baselineError && (
                    <p className="text-sm text-amber-700 font-medium">{baselineError}</p>
                  )}
                  <button
                    type="button"
                    onClick={captureBaseline}
                    className="min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base cursor-pointer"
                  >
                    この音を基準にする
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-center gap-6 text-sm font-mono-tabular">
                    <div>
                      <span className="text-slate-500">基準：</span>
                      <span className="font-bold">{Math.round(baselineFreq)} Hz</span>
                    </div>
                    <div>
                      <span className="text-slate-500">目標（2倍）：</span>
                      <span className="font-bold text-emerald-700">
                        {Math.round(baselineFreq * 2)} Hz
                      </span>
                    </div>
                  </div>
                  <div className="font-mono-tabular text-4xl font-bold text-slate-900">
                    {displayFreq !== null
                      ? `いま ${(displayFreq / baselineFreq).toFixed(2)} 倍`
                      : 'いま — 倍'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Challenge 3: Pitch same, Loudness change */}
          {activeId === 'loudness-only' && (
            <div className="space-y-4 text-center">
              {baselineFreq === null || baselineRms === null ? (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-slate-700">
                    ふつうの大きさで声を出しながら、基準の音を決めてください。
                  </p>
                  <div className="font-mono-tabular text-2xl font-bold text-slate-900">
                    いま：{displayFreq !== null ? `${Math.round(displayFreq)} Hz` : '— Hz'}
                  </div>
                  {baselineError && (
                    <p className="text-sm text-amber-700 font-medium">{baselineError}</p>
                  )}
                  <button
                    type="button"
                    onClick={captureBaseline}
                    className="min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base cursor-pointer"
                  >
                    この音を基準にする
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 max-w-md mx-auto text-sm">
                    <div
                      className={`p-3 rounded-xl border ${
                        phase1Done
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : loudnessPhase === 1
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      段階1：大きさ 2倍以上 {phase1Done ? '✓' : ''}
                    </div>
                    <div
                      className={`p-3 rounded-xl border ${
                        justCleared
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : loudnessPhase === 2
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      段階2：大きさ 0.5倍以下 {justCleared ? '✓' : ''}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">高さのずれ（±50以内）</div>
                      <div className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                        {displayFreq !== null
                          ? `${Math.round(centsDifference(displayFreq, baselineFreq))} セント`
                          : '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">大きさの倍率</div>
                      <div className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                        {(displayRms / baselineRms).toFixed(2)} 倍
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Challenge 4: Smooth Wave */}
          {activeId === 'smooth-wave' && (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  なめらか度（目標 90%以上）
                </span>
                <span className="font-mono-tabular text-3xl font-bold text-slate-900">
                  {displaySmoothness !== null
                    ? `${Math.round(displaySmoothness)}%`
                    : '—%'}
                </span>
              </div>
              <div className="h-6 bg-slate-100 border border-slate-200 rounded-lg overflow-hidden relative">
                {/* 90% target marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
                  style={{ left: '90%' }}
                />
                <div
                  className={`h-full transition-[width] duration-75 ${
                    (displaySmoothness ?? 0) >= 90 ? 'bg-emerald-500' : 'bg-sky-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, displaySmoothness ?? 0))}%` }}
                />
              </div>
              <p className="text-xs text-slate-600 text-center">
                ヒント：口笛や、「うー」と小さく出す声を試してみよう
              </p>
            </div>
          )}

          {/* Ring Gauge */}
          {(activeId === 'keep-a' ||
            activeId === 'doremi-scale' ||
            activeId === 'smooth-wave' ||
            baselineFreq !== null) && (
            <div className="pt-2">
              <ProgressRing
                progress={ringProgress}
                label={
                  justCleared
                    ? 'クリア！'
                    : `${holdSeconds.toFixed(1)} / ${targetSec.toFixed(1)}秒`
                }
                isCleared={justCleared}
              />
            </div>
          )}

          {/* Celebration Banner */}
          {justCleared && (
            <div
              role="status"
              className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 sm:p-5 text-center space-y-2"
            >
              <div className="inline-flex items-center gap-2 text-emerald-800 font-bold text-lg">
                <Trophy className="w-6 h-6 text-emerald-600" />
                <span>おめでとう！クリアしました！</span>
              </div>
              {activeId === 'doremi-scale' && (
                <p className="text-sm font-semibold text-emerald-950">
                  ドレミファソラシドは、音が上がるごとに振動数も少しずつ高くなっています
                </p>
              )}
              {activeId === 'octave-up' && (
                <p className="text-sm font-semibold text-emerald-950">
                  振動数が2倍になると1オクターブ上がる
                </p>
              )}
              {activeId === 'loudness-only' && (
                <p className="text-sm font-semibold text-emerald-950">
                  高さ（振動数）と大きさ（振幅）は別々に変えられる
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
