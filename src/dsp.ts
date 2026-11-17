import {
  ANALYSIS_SAMPLE_COUNT,
  FREQ_MAX_HZ,
  FREQ_MIN_HZ,
  MIN_CORRELATION_FOR_ESTIMATE,
  MIN_RMS_FOR_ESTIMATE,
  NOTE_NAMES_EN,
  NOTE_NAMES_JA,
  PEAK_THRESHOLD_RATIO,
  RMS_LOUDNESS_FULL_SCALE,
  RMS_SAMPLE_COUNT,
  TRIGGER_HYSTERESIS_RATIO,
} from './constants';
import type { AnalysisResult, NoteInfo, TriggerResult } from './types';

export function calculateRms(samples: Float32Array | number[]): number {
  const len = samples.length;
  if (len === 0) return 0;
  const count = Math.min(len, RMS_SAMPLE_COUNT);
  const start = len - count;
  let sumSq = 0;
  for (let i = start; i < len; i++) {
    const v = samples[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / count);
}

export function calculateLoudness(rms: number): number {
  return Math.min(100, (rms / RMS_LOUDNESS_FULL_SCALE) * 100);
}

export function estimateFrequency(
  rawSamples: Float32Array | number[],
  fs: number,
  precomputedRms?: number
): { frequency: number | null; tau: number | null; rMax: number; rChosen: number } {
  if (rawSamples.length < ANALYSIS_SAMPLE_COUNT || fs <= 0) {
    return { frequency: null, tau: null, rMax: 0, rChosen: 0 };
  }

  const startOffset = rawSamples.length - ANALYSIS_SAMPLE_COUNT;
  const x =
    startOffset === 0
      ? rawSamples
      : rawSamples instanceof Float32Array
        ? rawSamples.subarray(startOffset)
        : rawSamples.slice(startOffset);

  const rms = precomputedRms ?? calculateRms(x);
  if (rms < MIN_RMS_FOR_ESTIMATE) {
    return { frequency: null, tau: null, rMax: 0, rChosen: 0 };
  }

  const tauMin = Math.max(2, Math.floor(fs / FREQ_MAX_HZ));
  const tauMax = Math.min(ANALYSIS_SAMPLE_COUNT - 2, Math.ceil(fs / FREQ_MIN_HZ));
  if (tauMax <= tauMin) {
    return { frequency: null, tau: null, rMax: 0, rChosen: 0 };
  }

  const commonLen = ANALYSIS_SAMPLE_COUNT - tauMax;
  if (commonLen <= 0) {
    return { frequency: null, tau: null, rMax: 0, rChosen: 0 };
  }

  let energy0 = 0;
  for (let i = 0; i < commonLen; i++) {
    const v = x[i];
    energy0 += v * v;
  }
  if (energy0 <= 0) {
    return { frequency: null, tau: null, rMax: 0, rChosen: 0 };
  }

  const searchMin = Math.max(1, tauMin - 1);
  const searchMax = Math.min(ANALYSIS_SAMPLE_COUNT - commonLen, tauMax + 1);
  const rValues = new Float64Array(searchMax + 1);

  for (let tau = searchMin; tau <= searchMax; tau++) {
    let dot = 0;
    let energyTau = 0;
    for (let i = 0; i < commonLen; i++) {
      const a = x[i];
      const b = x[i + tau];
      dot += a * b;
      energyTau += b * b;
    }
    if (energyTau > 0) {
      rValues[tau] = dot / Math.sqrt(energy0 * energyTau);
    } else {
      rValues[tau] = 0;
    }
  }

  const peaks: number[] = [];
  let rMax = -Infinity;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    const curr = rValues[tau];
    const prev = rValues[tau - 1];
    const next = rValues[tau + 1];
    if (curr > prev && curr >= next) {
      peaks.push(tau);
      if (curr > rMax) {
        rMax = curr;
      }
    }
  }

  if (peaks.length === 0 || rMax < MIN_CORRELATION_FOR_ESTIMATE) {
    return {
      frequency: null,
      tau: null,
      rMax: peaks.length > 0 ? rMax : 0,
      rChosen: peaks.length > 0 ? rMax : 0,
    };
  }

  const threshold = PEAK_THRESHOLD_RATIO * rMax;
  let chosenTau = peaks[0];
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    if (rValues[p] > threshold) {
      chosenTau = p;
      break;
    }
  }

  const rChosen = rValues[chosenTau];
  if (rChosen < MIN_CORRELATION_FOR_ESTIMATE) {
    return { frequency: null, tau: chosenTau, rMax, rChosen };
  }

  // Parabolic interpolation around chosenTau
  const y1 = rValues[chosenTau - 1];
  const y2 = rValues[chosenTau];
  const y3 = rValues[chosenTau + 1];
  const denom = 2 * (y1 - 2 * y2 + y3);
  let delta = 0;
  if (Math.abs(denom) > 1e-12) {
    delta = (y1 - y3) / denom;
    if (delta > 1) delta = 1;
    if (delta < -1) delta = -1;
  }

  const tauStar = chosenTau + delta;
  if (tauStar <= 0) {
    return { frequency: null, tau: chosenTau, rMax, rChosen };
  }

  return {
    frequency: fs / tauStar,
    tau: tauStar,
    rMax,
    rChosen,
  };
}

export function formatCentsLabel(cents: number): string {
  if (cents > 0) return `＋${cents}セント`;
  if (cents < 0) return `−${Math.abs(cents)}セント`;
  return '0セント';
}

export function frequencyToNote(f: number): NoteInfo {
  const n = Math.round(12 * Math.log2(f / 440));
  const midi = 69 + n;
  const noteIdx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const refFreq = 440 * Math.pow(2, n / 12);
  const cents = Math.round(1200 * Math.log2(f / refFreq));
  const jaName = NOTE_NAMES_JA[noteIdx];
  const enName = NOTE_NAMES_EN[noteIdx];
  const label = `${jaName}（${enName}${octave}）${formatCentsLabel(cents)}`;

  return {
    jaName,
    enName,
    octave,
    cents,
    midi,
    label,
  };
}

function solve3x3(A: number[][], b: number[]): [number, number, number] | null {
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];

  for (let col = 0; col < 3; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < 3; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-12) return null;

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let row = col + 1; row < 3; row++) {
      const factor = M[row][col] / pivot;
      for (let k = col; k < 4; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  const x2 = M[2][3] / M[2][2];
  const x1 = (M[1][3] - M[1][2] * x2) / M[1][1];
  const x0 = (M[0][3] - M[0][1] * x1 - M[0][2] * x2) / M[0][0];
  return [x0, x1, x2];
}

export function calculateSmoothness(
  rawSamples: Float32Array | number[],
  f: number,
  fs: number
): number {
  if (rawSamples.length === 0 || f <= 0 || fs <= 0) return 0;

  const count = Math.min(rawSamples.length, ANALYSIS_SAMPLE_COUNT);
  const startOffset = rawSamples.length - count;
  const omega = (2 * Math.PI * f) / fs;

  let ss = 0;
  let cc = 0;
  let sc = 0;
  let s1 = 0;
  let c1 = 0;
  let sy = 0;
  let cy = 0;
  let ySum = 0;

  for (let t = 0; t < count; t++) {
    const s = Math.sin(omega * t);
    const c = Math.cos(omega * t);
    const y = rawSamples[startOffset + t];

    ss += s * s;
    cc += c * c;
    sc += s * c;
    s1 += s;
    c1 += c;
    sy += s * y;
    cy += c * y;
    ySum += y;
  }

  const coeffs = solve3x3(
    [
      [ss, sc, s1],
      [sc, cc, c1],
      [s1, c1, count],
    ],
    [sy, cy, ySum]
  );
  if (!coeffs) return 0;

  const [a, b, dc] = coeffs;
  let sineEnergy = 0;
  let acEnergy = 0;

  for (let t = 0; t < count; t++) {
    const s = Math.sin(omega * t);
    const c = Math.cos(omega * t);
    const fitAc = a * s + b * c;
    const diffAc = rawSamples[startOffset + t] - dc;
    sineEnergy += fitAc * fitAc;
    acEnergy += diffAc * diffAc;
  }

  if (acEnergy <= 1e-12) return 0;
  const pct = (sineEnergy / acEnergy) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function analyzeSignal(
  samples: Float32Array | number[],
  fs: number
): AnalysisResult {
  const rms = calculateRms(samples);
  const loudness = calculateLoudness(rms);
  const { frequency, tau, rMax, rChosen } = estimateFrequency(samples, fs, rms);

  if (frequency === null) {
    return {
      rms,
      loudness,
      frequency: null,
      tau,
      rMax,
      rChosen,
      note: null,
      smoothness: null,
    };
  }

  const note = frequencyToNote(frequency);
  const smoothness = calculateSmoothness(samples, frequency, fs);

  return {
    rms,
    loudness,
    frequency,
    tau,
    rMax,
    rChosen,
    note,
    smoothness,
  };
}

export function findTriggerIndex(
  samples: Float32Array | number[],
  displaySampleCount: number,
  allowLastResortSearch = false
): TriggerResult {
  const len = samples.length;
  const count = Math.min(len, displaySampleCount);
  if (len < 2 || count <= 0) {
    return { startIndex: 0, triggered: false, maxAbs: 0, hysteresis: 0 };
  }

  let maxAbs = 0;
  for (let i = 0; i < len; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }

  const hysteresis = TRIGGER_HYSTERESIS_RATIO * maxAbs;
  if (maxAbs === 0) {
    return {
      startIndex: Math.max(0, len - count),
      triggered: false,
      maxAbs: 0,
      hysteresis: 0,
    };
  }

  const maxValidStart = allowLastResortSearch ? len - 2 : len - count;
  let armed = false;
  let bestIndex = -1;

  for (let i = 0; i <= maxValidStart; i++) {
    const curr = samples[i];
    if (curr <= -hysteresis) {
      armed = true;
    }
    if (i > 0 && armed) {
      const prev = samples[i - 1];
      if (prev <= 0 && curr > 0) {
        bestIndex = i;
        armed = false;
      }
    }
  }

  if (bestIndex >= 0) {
    return {
      startIndex: bestIndex,
      triggered: true,
      maxAbs,
      hysteresis,
    };
  }

  return {
    startIndex: Math.max(0, len - count),
    triggered: false,
    maxAbs,
    hysteresis,
  };
}

export function extractDisplaySamples(
  samples: Float32Array,
  displaySampleCount: number
): { displaySamples: Float32Array; startIndex: number; triggered: boolean } {
  const count = Math.min(samples.length, Math.max(1, displaySampleCount));
  const trig = findTriggerIndex(samples, count, false);
  const displaySamples = samples.slice(trig.startIndex, trig.startIndex + count);
  return {
    displaySamples,
    startIndex: trig.startIndex,
    triggered: trig.triggered,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function centsDifference(f1: number, f2: number): number {
  if (f1 <= 0 || f2 <= 0) return 0;
  return 1200 * Math.log2(f1 / f2);
}

export function centsFromNearestPitchClass(
  f: number,
  targetPitchClass: number
): {
  cents: number;
  nearestFreq: number;
  octave: number;
  label: string;
} {
  const pc = ((targetPitchClass % 12) + 12) % 12;
  const midiExact = 69 + 12 * Math.log2(f / 440);
  const nearestMidi = pc + 12 * Math.round((midiExact - pc) / 12);
  const nearestFreq = 440 * Math.pow(2, (nearestMidi - 69) / 12);
  const cents = 100 * (midiExact - nearestMidi);
  const octave = Math.floor(nearestMidi / 12) - 1;
  return {
    cents,
    nearestFreq,
    octave,
    label: `${NOTE_NAMES_JA[pc]}（${NOTE_NAMES_EN[pc]}${octave}）`,
  };
}

export function centsFromNearestA(f: number): {
  cents: number;
  nearestAFreq: number;
  label: string;
} {
  const res = centsFromNearestPitchClass(f, 9);
  return {
    cents: res.cents,
    nearestAFreq: res.nearestFreq,
    label: res.label,
  };
}

export interface SelfTestItem {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SelfTestReport {
  allPassed: boolean;
  items: SelfTestItem[];
}

function generateSine(freq: number, fs: number, length: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / fs);
  }
  return out;
}

function generateSquare(freq: number, fs: number, length: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / fs);
    out[i] = s >= 0 ? amplitude : -amplitude;
  }
  return out;
}

function generateWhiteNoise(length: number, amplitude = 0.3): Float32Array {
  const out = new Float32Array(length);
  let seed = 123456789;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u = (seed / 0xffffffff) * 2 - 1;
    out[i] = amplitude * u;
  }
  return out;
}

export function runDspSelfTests(): SelfTestReport {
  const fs = 48000;
  const items: SelfTestItem[] = [];

  for (const targetFreq of [100, 220, 440, 880, 1500]) {
    const sig = generateSine(targetFreq, fs, ANALYSIS_SAMPLE_COUNT);
    const res = analyzeSignal(sig, fs);
    const errPct =
      res.frequency !== null
        ? (Math.abs(res.frequency - targetFreq) / targetFreq) * 100
        : Infinity;
    const passed = res.frequency !== null && errPct <= 0.5;
    items.push({
      name: `正弦波 ${targetFreq} Hz`,
      passed,
      detail:
        res.frequency !== null
          ? `${res.frequency.toFixed(2)} Hz（誤差 ${errPct.toFixed(3)}%）`
          : '—（推定失敗）',
    });
  }

  {
    const sq = generateSquare(200, fs, ANALYSIS_SAMPLE_COUNT);
    const res = analyzeSignal(sq, fs);
    const errPct =
      res.frequency !== null ? (Math.abs(res.frequency - 200) / 200) * 100 : Infinity;
    const smoothOk = res.smoothness !== null && Math.abs(res.smoothness - 81) <= 3;
    const passed = res.frequency !== null && errPct <= 0.5 && smoothOk;
    items.push({
      name: '方形波 200 Hz',
      passed,
      detail: `f=${res.frequency?.toFixed(2) ?? '—'} Hz / なめらか度=${res.smoothness?.toFixed(1) ?? '—'}%`,
    });
  }

  {
    const sig440 = generateSine(440, fs, ANALYSIS_SAMPLE_COUNT);
    const res = analyzeSignal(sig440, fs);
    const passed = res.smoothness !== null && res.smoothness >= 98;
    items.push({
      name: '正弦波 440 Hz なめらか度',
      passed,
      detail: `${res.smoothness?.toFixed(1) ?? '—'}%`,
    });
  }

  const noteTests: Array<[number, string]> = [
    [440, 'ラ（A4）0セント'],
    [261.63, 'ド（C4）0セント'],
    [466.16, 'ラ♯（A♯4）0セント'],
    [445, 'ラ（A4）＋20セント'],
  ];
  for (const [freq, expected] of noteTests) {
    const got = frequencyToNote(freq).label;
    items.push({
      name: `音名 ${freq} Hz`,
      passed: got === expected,
      detail: `${got}（期待: ${expected}）`,
    });
  }

  {
    const quiet = generateSine(440, fs, ANALYSIS_SAMPLE_COUNT, 0.005);
    const res = analyzeSignal(quiet, fs);
    const passed = res.frequency === null;
    items.push({
      name: '微小信号（振幅 0.005）',
      passed,
      detail: `RMS=${res.rms.toFixed(4)} / f=${res.frequency === null ? '—' : res.frequency}`,
    });
  }

  {
    const noise = generateWhiteNoise(ANALYSIS_SAMPLE_COUNT, 0.3);
    const res = analyzeSignal(noise, fs);
    const passed = res.frequency === null;
    items.push({
      name: '白色雑音',
      passed,
      detail: `f=${res.frequency === null ? '—' : res.frequency}（rMax=${res.rMax.toFixed(2)}）`,
    });
  }

  return {
    allPassed: items.every((item) => item.passed),
    items,
  };
}
