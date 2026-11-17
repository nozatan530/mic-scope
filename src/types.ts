import type { TimebaseMs, VerticalZoom } from './constants';

export type ScreenId = 'start' | 'scope' | 'shelf' | 'challenge';

export type MicStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'stopped'
  | 'denied'
  | 'unsupported';

export interface NoteInfo {
  jaName: string;
  enName: string;
  octave: number;
  cents: number;
  midi: number;
  label: string;
}

export interface AnalysisResult {
  rms: number;
  loudness: number;
  frequency: number | null;
  tau: number | null;
  rMax: number;
  rChosen: number;
  note: NoteInfo | null;
  smoothness: number | null;
}

export interface TriggerResult {
  startIndex: number;
  triggered: boolean;
  maxAbs: number;
  hysteresis: number;
}

export interface ShelfItem {
  id: string;
  name: string;
  samples: number[];
  fs: number;
  msPerDiv: TimebaseMs;
  frequency: number | null;
  noteLabel: string | null;
  loudness: number;
  createdAt: number;
}

export interface AppSettings {
  alwaysShowFreq: boolean;
}

export type ChallengeId =
  | 'keep-a'
  | 'doremi-scale'
  | 'octave-up'
  | 'loudness-only'
  | 'smooth-wave';

export type ChallengeClearedMap = Record<ChallengeId, boolean>;

export interface LiveDebugInfo {
  fs: number;
  echoCancellation: boolean | string | undefined;
  noiseSuppression: boolean | string | undefined;
  autoGainControl: boolean | string | undefined;
  frequency: number | null;
  tau: number | null;
  rChosen: number;
  rms: number;
  triggered: boolean;
  smoothness: number | null;
}

export interface AnswerCheckFeedback {
  userFreq: number;
  appFreq: number | null;
  appNoteLabel: string | null;
  diffPercent: number | null;
  status: 'perfect' | 'close' | 'harmonic-sub' | 'unit-error' | 'retry' | 'unmeasurable';
  headline: string;
  message: string;
}

export interface PausedSnapshot {
  displaySamples: Float32Array;
  analysisSamples: Float32Array;
  fullBuffer: Float32Array;
  startIndex: number;
  triggered: boolean;
  msPerDiv: TimebaseMs;
  fs: number;
  analysis: AnalysisResult;
  zoom: VerticalZoom;
}
