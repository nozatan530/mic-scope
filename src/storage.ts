import {
  SHELF_MAX_ITEMS,
  SHELF_MAX_SAMPLES,
  SHELF_SAMPLE_DECIMALS,
  STORAGE_KEYS,
} from './constants';
import type { AppSettings, ChallengeClearedMap, ShelfItem } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  alwaysShowFreq: false,
};

const DEFAULT_CHALLENGES: ChallengeClearedMap = {
  'keep-a': false,
  'doremi-scale': false,
  'octave-up': false,
  'loudness-only': false,
  'smooth-wave': false,
};

export function roundSamplesForStorage(samples: Float32Array | number[]): number[] {
  const limit = Math.min(samples.length, SHELF_MAX_SAMPLES);
  const factor = Math.pow(10, SHELF_SAMPLE_DECIMALS);
  const out = new Array<number>(limit);
  for (let i = 0; i < limit; i++) {
    out[i] = Math.round(samples[i] * factor) / factor;
  }
  return out;
}

export function loadShelf(): ShelfItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHELF);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, SHELF_MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveShelf(items: ShelfItem[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.SHELF,
      JSON.stringify(items.slice(0, SHELF_MAX_ITEMS))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      alwaysShowFreq: Boolean(parsed?.alwaysShowFreq),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function loadChallengesCleared(): ChallengeClearedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHALLENGES);
    if (!raw) return { ...DEFAULT_CHALLENGES };
    const parsed = JSON.parse(raw);
    return {
      'keep-a': Boolean(parsed?.['keep-a']),
      'doremi-scale': Boolean(parsed?.['doremi-scale']),
      'octave-up': Boolean(parsed?.['octave-up']),
      'loudness-only': Boolean(parsed?.['loudness-only']),
      'smooth-wave': Boolean(parsed?.['smooth-wave']),
    };
  } catch {
    return { ...DEFAULT_CHALLENGES };
  }
}

export function saveChallengesCleared(map: ChallengeClearedMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}
