export const FFT_SIZE = 8192;
export const ANALYSIS_SAMPLE_COUNT = 4096;
export const RMS_SAMPLE_COUNT = 2048;

export const GRID_DIVISIONS_X = 10;
export const GRID_DIVISIONS_Y = 8;

export const TIMEBASE_OPTIONS_MS = [0.5, 1, 2, 5, 10] as const;
export type TimebaseMs = (typeof TIMEBASE_OPTIONS_MS)[number];
export const DEFAULT_TIMEBASE_MS: TimebaseMs = 2;

export const VERTICAL_ZOOM_OPTIONS = [1, 2, 5, 10] as const;
export type VerticalZoom = (typeof VERTICAL_ZOOM_OPTIONS)[number];
export const DEFAULT_VERTICAL_ZOOM: VerticalZoom = 1;

export const TRIGGER_HYSTERESIS_RATIO = 0.1;
export const RMS_LOUDNESS_FULL_SCALE = 0.3;

export const FREQ_MIN_HZ = 80;
export const FREQ_MAX_HZ = 2000;
export const MIN_RMS_FOR_ESTIMATE = 0.01;
export const MIN_CORRELATION_FOR_ESTIMATE = 0.8;
export const PEAK_THRESHOLD_RATIO = 0.9;

export const FREQ_UPDATE_INTERVAL_MS = 100; // 10 Hz
export const FREQ_MEDIAN_WINDOW = 5;

export const NOTE_NAMES_JA = [
  'ド',
  'ド♯',
  'レ',
  'レ♯',
  'ミ',
  'ファ',
  'ファ♯',
  'ソ',
  'ソ♯',
  'ラ',
  'ラ♯',
  'シ',
] as const;

export const NOTE_NAMES_EN = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const;

export const SHELF_MAX_ITEMS = 4;
export const SHELF_MAX_SAMPLES = 4800;
export const SHELF_SAMPLE_DECIMALS = 3;

export const STORAGE_KEYS = {
  SHELF: 'mic_oscillo_shelf_v1',
  SETTINGS: 'mic_oscillo_settings_v1',
  CHALLENGES: 'mic_oscillo_challenges_v1',
} as const;

export const COMPARE_PROMPTS = [
  '「あ」と「い」を同じ高さで出すと、何が違って何が同じ？',
  '同じ音を小さく出したときと大きく出したとき、波形のどこが変わった？',
  '1オクターブ上の音は、周期が何倍になった？',
  'リコーダーと声で同じ音名を出すと、何が同じで何が違う？',
] as const;

export const CHALLENGE_CONFIG = {
  A_HOLD_SECONDS: 2.0,
  A_CENTS_TOLERANCE: 30,
  DOREMI_HOLD_SECONDS: 1.0,
  DOREMI_CENTS_TOLERANCE: 35,
  OCTAVE_HOLD_SECONDS: 1.5,
  OCTAVE_CENTS_TOLERANCE: 40,
  LOUDNESS_HOLD_SECONDS: 1.5,
  LOUDNESS_PITCH_TOLERANCE_CENTS: 50,
  LOUDNESS_HIGH_RATIO: 2.0,
  LOUDNESS_LOW_RATIO: 0.5,
  SMOOTHNESS_HOLD_SECONDS: 2.0,
  SMOOTHNESS_THRESHOLD_PCT: 90,
  BASELINE_WINDOW_MS: 500,
} as const;
