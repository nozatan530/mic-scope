import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Bookmark, Trophy } from 'lucide-react';
import { ChallengeScreen } from './components/ChallengeScreen';
import type { HistorySample } from './components/ChallengeScreen';
import { DebugPanel } from './components/DebugPanel';
import { renderOscilloscopeCanvas } from './components/OscilloscopeCanvas';
import { ScopeScreen } from './components/ScopeScreen';
import { ShelfScreen } from './components/ShelfScreen';
import { StartScreen } from './components/StartScreen';
import {
  ANALYSIS_SAMPLE_COUNT,
  DEFAULT_TIMEBASE_MS,
  DEFAULT_VERTICAL_ZOOM,
  FFT_SIZE,
  FREQ_MEDIAN_WINDOW,
  FREQ_UPDATE_INTERVAL_MS,
  GRID_DIVISIONS_X,
  SHELF_MAX_ITEMS,
} from './constants';
import type { TimebaseMs, VerticalZoom } from './constants';
import {
  analyzeSignal,
  calculateLoudness,
  calculateRms,
  extractDisplaySamples,
  frequencyToNote,
  median,
} from './dsp';
import {
  loadChallengesCleared,
  loadSettings,
  loadShelf,
  roundSamplesForStorage,
  saveChallengesCleared,
  saveSettings,
  saveShelf,
} from './storage';
import type {
  AnalysisResult,
  AppSettings,
  ChallengeClearedMap,
  ChallengeId,
  LiveDebugInfo,
  MicStatus,
  PausedSnapshot,
  ScreenId,
  ShelfItem,
} from './types';

const EMPTY_ANALYSIS: AnalysisResult = {
  rms: 0,
  loudness: 0,
  frequency: null,
  tau: null,
  rMax: 0,
  rChosen: 0,
  note: null,
  smoothness: null,
};

export default function App() {
  const isDebugMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1';

  const [screen, setScreen] = useState<ScreenId>('start');
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [micErrorReason, setMicErrorReason] = useState<string | null>(null);

  const [msPerDiv, setMsPerDiv] = useState<TimebaseMs>(DEFAULT_TIMEBASE_MS);
  const [zoom, setZoom] = useState<VerticalZoom>(DEFAULT_VERTICAL_ZOOM);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedSnapshot, setPausedSnapshot] = useState<PausedSnapshot | null>(null);

  const [liveLoudness, setLiveLoudness] = useState(0);
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisResult>(EMPTY_ANALYSIS);

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>(() => loadShelf());
  const [challengesCleared, setChallengesCleared] = useState<ChallengeClearedMap>(() =>
    loadChallengesCleared()
  );

  const [debugInfo, setDebugInfo] = useState<LiveDebugInfo>({
    fs: 0,
    echoCancellation: undefined,
    noiseSuppression: undefined,
    autoGainControl: undefined,
    frequency: null,
    tau: null,
    rChosen: 0,
    rms: 0,
    triggered: false,
    smoothness: null,
  });

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackSettingsRef = useRef<{
    echoCancellation?: boolean | string;
    noiseSuppression?: boolean | string;
    autoGainControl?: boolean | string;
  }>({});

  // Double-buffered time-domain arrays to guarantee exact freeze on pause
  const bufARef = useRef(new Float32Array(FFT_SIZE));
  const bufBRef = useRef(new Float32Array(FFT_SIZE));
  const useBufARef = useRef(true);

  const lastRenderedRef = useRef<{
    buffer: Float32Array;
    displaySamples: Float32Array;
    startIndex: number;
    triggered: boolean;
    msPerDiv: TimebaseMs;
    fs: number;
  } | null>(null);

  // Canvas & live refs synced into rAF
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const msPerDivRef = useRef<TimebaseMs>(msPerDiv);
  const zoomRef = useRef<VerticalZoom>(zoom);
  const isPausedRef = useRef<boolean>(isPaused);
  const screenRef = useRef<ScreenId>(screen);
  const micStatusRef = useRef<MicStatus>(micStatus);

  msPerDivRef.current = msPerDiv;
  zoomRef.current = zoom;
  isPausedRef.current = isPaused;
  screenRef.current = screen;
  micStatusRef.current = micStatus;

  // Live challenge & median window refs
  const recentFreqsRef = useRef<number[]>([]);
  const challengeAnalysisRef = useRef<AnalysisResult>(EMPTY_ANALYSIS);
  const challengeHistoryRef = useRef<HistorySample[]>([]);

  const stopMicTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      void audioCtxRef.current.suspend().catch(() => {});
    }
    analyserRef.current = null;
  }, []);

  const startMicrophone = useCallback(
    async (navigateToScope: boolean) => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setMicStatus('unsupported');
        setMicErrorReason(
          'HTTPS で開かれていないためマイクを使えません（安全な接続 https:// で開いてください）。'
        );
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicStatus('unsupported');
        setMicErrorReason(
          'お使いのブラウザはマイク入力（getUserMedia）に対応していません。最新の Safari・Chrome・Edge でお試しください。'
        );
        return;
      }

      setMicStatus('requesting');
      setMicErrorReason(null);

      try {
        // Create AudioContext directly inside user gesture for iPad/iPhone Safari
        let ctx = audioCtxRef.current;
        if (!ctx || ctx.state === 'closed') {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          ctx = new AudioCtx();
          audioCtxRef.current = ctx;
        }
        await ctx.resume();

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        // Clean up any previous stream
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
        }
        streamRef.current = stream;

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && typeof audioTrack.getSettings === 'function') {
          const s = audioTrack.getSettings();
          trackSettingsRef.current = {
            echoCancellation: s.echoCancellation,
            noiseSuppression: s.noiseSuppression,
            autoGainControl: s.autoGainControl,
          };
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);
        analyserRef.current = analyser;

        recentFreqsRef.current = [];
        setMicStatus('active');
        setIsPaused(false);
        setPausedSnapshot(null);
        if (navigateToScope) {
          setScreen('scope');
        }
      } catch (err) {
        const errorName = err instanceof DOMException ? err.name : '';
        if (
          errorName === 'NotAllowedError' ||
          errorName === 'PermissionDeniedError' ||
          errorName === 'SecurityError'
        ) {
          setMicStatus('denied');
        } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
          setMicStatus('unsupported');
          setMicErrorReason(
            'マイクが見つかりませんでした。マイクが接続されているか確認してください。'
          );
        } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
          setMicStatus('unsupported');
          setMicErrorReason(
            '別のアプリがマイクを使用中か、マイクにアクセスできませんでした。他のアプリを閉じてお試しください。'
          );
        } else {
          setMicStatus('unsupported');
          setMicErrorReason(
            'マイクを開始できませんでした。ブラウザの設定や接続環境を確認してください。'
          );
        }
      }
    },
    []
  );

  // Resume AudioContext when tab returns from background (iPad/iPhone Safari requirement)
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        micStatusRef.current === 'active' &&
        audioCtxRef.current &&
        audioCtxRef.current.state === 'suspended'
      ) {
        void audioCtxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Main requestAnimationFrame loop
  useEffect(() => {
    if (micStatus !== 'active') return;

    let rafId = 0;
    let lastFreqUpdate = 0;
    let lastLoudnessUpdate = 0;

    const loop = (now: number) => {
      const analyser = analyserRef.current;
      const ctx = audioCtxRef.current;

      if (!analyser || !ctx) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const fs = ctx.sampleRate;
      const buffer = useBufARef.current ? bufARef.current : bufBRef.current;
      useBufARef.current = !useBufARef.current;

      analyser.getFloatTimeDomainData(buffer);

      // Update waveform canvas only when on scope screen and not paused
      if (screenRef.current === 'scope' && !isPausedRef.current) {
        const currentMsPerDiv = msPerDivRef.current;
        const windowSec = (currentMsPerDiv * GRID_DIVISIONS_X) / 1000;
        const sampleCount = Math.min(FFT_SIZE, Math.max(2, Math.round(windowSec * fs)));
        const extracted = extractDisplaySamples(buffer, sampleCount);

        lastRenderedRef.current = {
          buffer,
          displaySamples: extracted.displaySamples,
          startIndex: extracted.startIndex,
          triggered: extracted.triggered,
          msPerDiv: currentMsPerDiv,
          fs,
        };

        const canvas = scopeCanvasRef.current;
        if (canvas) {
          renderOscilloscopeCanvas(canvas, {
            samples: extracted.displaySamples,
            zoom: zoomRef.current,
            msPerDiv: currentMsPerDiv,
            isPaused: false,
            cursorAFrac: 0.2,
            cursorBFrac: 0.5,
          });
        }
      }

      // Loudness update (~20 Hz)
      if (!isPausedRef.current && now - lastLoudnessUpdate >= 50) {
        lastLoudnessUpdate = now;
        const rms = calculateRms(buffer);
        setLiveLoudness(calculateLoudness(rms));
      }

      // Pitch & Smoothness update at 10 Hz (every 100 ms)
      if (!isPausedRef.current && now - lastFreqUpdate >= FREQ_UPDATE_INTERVAL_MS) {
        lastFreqUpdate = now;
        const rawAnalysis = analyzeSignal(buffer, fs);
        challengeAnalysisRef.current = rawAnalysis;

        challengeHistoryRef.current.push({
          time: now,
          frequency: rawAnalysis.frequency,
          rms: rawAnalysis.rms,
          smoothness: rawAnalysis.smoothness,
        });
        // Keep last 1.5 seconds
        const cutoff = now - 1500;
        while (
          challengeHistoryRef.current.length > 0 &&
          challengeHistoryRef.current[0].time < cutoff
        ) {
          challengeHistoryRef.current.shift();
        }

        if (rawAnalysis.frequency !== null) {
          recentFreqsRef.current.push(rawAnalysis.frequency);
          if (recentFreqsRef.current.length > FREQ_MEDIAN_WINDOW) {
            recentFreqsRef.current.shift();
          }
        } else {
          recentFreqsRef.current = [];
        }

        const medianFreq = median(recentFreqsRef.current);
        const stabilizedNote = medianFreq !== null ? frequencyToNote(medianFreq) : null;

        setLiveAnalysis({
          ...rawAnalysis,
          frequency: medianFreq,
          note: stabilizedNote,
        });

        if (isDebugMode) {
          setDebugInfo({
            fs,
            echoCancellation: trackSettingsRef.current.echoCancellation,
            noiseSuppression: trackSettingsRef.current.noiseSuppression,
            autoGainControl: trackSettingsRef.current.autoGainControl,
            frequency: rawAnalysis.frequency,
            tau: rawAnalysis.tau,
            rChosen: rawAnalysis.rChosen,
            rms: rawAnalysis.rms,
            triggered: lastRenderedRef.current?.triggered ?? false,
            smoothness: rawAnalysis.smoothness,
          });
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [micStatus, isDebugMode]);

  const handleTogglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      setPausedSnapshot(null);
      return;
    }

    const rendered = lastRenderedRef.current;
    if (!rendered) return;

    // Copy the exact N displayed samples and 4096 samples including before them
    const displaySamplesCopy = new Float32Array(rendered.displaySamples);
    const fullBufferCopy = new Float32Array(rendered.buffer);
    const endIdx = rendered.startIndex + displaySamplesCopy.length;
    const analysisEnd = Math.max(ANALYSIS_SAMPLE_COUNT, endIdx);
    const analysisStart = analysisEnd - ANALYSIS_SAMPLE_COUNT;
    const analysisSamplesCopy = fullBufferCopy.slice(analysisStart, analysisEnd);

    // Compute paused frequency/note/loudness directly from the frozen 4096 samples
    const frozenAnalysis = analyzeSignal(analysisSamplesCopy, rendered.fs);

    setPausedSnapshot({
      displaySamples: displaySamplesCopy,
      analysisSamples: analysisSamplesCopy,
      fullBuffer: fullBufferCopy,
      startIndex: rendered.startIndex,
      triggered: rendered.triggered,
      msPerDiv: rendered.msPerDiv,
      fs: rendered.fs,
      analysis: frozenAnalysis,
      zoom,
    });
    setIsPaused(true);
  }, [isPaused, zoom]);

  const handleToggleMic = useCallback(() => {
    if (micStatus === 'active') {
      stopMicTracks();
      setMicStatus('stopped');
    } else {
      void startMicrophone(false);
    }
  }, [micStatus, startMicrophone, stopMicTracks]);

  const handleToggleAlwaysShowFreq = (next: boolean) => {
    const updated = { ...settings, alwaysShowFreq: next };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleSaveToShelf = (name: string, replaceId?: string) => {
    if (!pausedSnapshot) return;

    const newItem: ShelfItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      samples: roundSamplesForStorage(pausedSnapshot.displaySamples),
      fs: pausedSnapshot.fs,
      msPerDiv: pausedSnapshot.msPerDiv,
      frequency: pausedSnapshot.analysis.frequency,
      noteLabel: pausedSnapshot.analysis.note?.label ?? null,
      loudness: pausedSnapshot.analysis.loudness,
      createdAt: Date.now(),
    };

    setShelfItems((prev) => {
      let next: ShelfItem[];
      if (prev.length >= SHELF_MAX_ITEMS && replaceId) {
        next = prev.map((item) => (item.id === replaceId ? newItem : item));
      } else {
        next = [...prev, newItem].slice(0, SHELF_MAX_ITEMS);
      }
      saveShelf(next);
      return next;
    });
  };

  const handleRenameShelfItem = (id: string, nextName: string) => {
    setShelfItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, name: nextName } : it));
      saveShelf(next);
      return next;
    });
  };

  const handleDeleteShelfItem = (id: string) => {
    setShelfItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      saveShelf(next);
      return next;
    });
  };

  const handleClearShelf = () => {
    setShelfItems([]);
    saveShelf([]);
  };

  const handleMarkChallengeCleared = useCallback((id: ChallengeId) => {
    setChallengesCleared((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      saveChallengesCleared(next);
      return next;
    });
  }, []);

  if (screen === 'start') {
    return (
      <>
        <StartScreen
          micStatus={micStatus}
          errorReason={micErrorReason}
          shelfCount={shelfItems.length}
          onRequestMic={() => void startMicrophone(true)}
          onOpenShelf={() => setScreen('shelf')}
        />
        {isDebugMode && <DebugPanel liveInfo={debugInfo} />}
      </>
    );
  }

  const navItems: Array<{
    id: Exclude<ScreenId, 'start'>;
    label: string;
    icon: typeof Activity;
    badge?: string;
  }> = [
    { id: 'scope', label: 'スコープ', icon: Activity },
    {
      id: 'shelf',
      label: '棚',
      icon: Bookmark,
      badge: shelfItems.length > 0 ? String(shelfItems.length) : undefined,
    },
    { id: 'challenge', label: 'チャレンジ', icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Compact Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-13 flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={() => setScreen('start')}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          マイクでオシロ
        </button>

        <div className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
          {micStatus === 'active'
            ? isPaused
              ? '一時停止中'
              : 'マイク動作中'
            : micStatus === 'stopped'
              ? 'マイク停止中'
              : 'マイク未開始'}
        </div>
      </header>

      {/* Main Workspace: Side tabs on md+, Bottom tabs on mobile */}
      <div className="flex-1 flex flex-col md:flex-row max-w-6xl w-full mx-auto">
        {/* Desktop Side Navigation */}
        <aside
          aria-label="画面切り替え"
          className="hidden md:flex flex-col w-48 shrink-0 border-r border-slate-200 bg-white/60 p-3 gap-1.5"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`min-h-[46px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`font-mono-tabular text-xs ${
                      active ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Active Screen Content */}
        <main className="flex-1 min-w-0 p-3.5 sm:p-5 pb-20 md:pb-8">
          {screen === 'scope' && (
            <ScopeScreen
              canvasRef={scopeCanvasRef}
              micStatus={micStatus}
              isPaused={isPaused}
              pausedSnapshot={pausedSnapshot}
              liveLoudness={liveLoudness}
              liveAnalysis={liveAnalysis}
              msPerDiv={msPerDiv}
              zoom={zoom}
              alwaysShowFreq={settings.alwaysShowFreq}
              shelfItems={shelfItems}
              onTogglePause={handleTogglePause}
              onToggleMic={handleToggleMic}
              onChangeTimebase={setMsPerDiv}
              onChangeZoom={setZoom}
              onToggleAlwaysShowFreq={handleToggleAlwaysShowFreq}
              onSaveToShelf={handleSaveToShelf}
            />
          )}

          {screen === 'shelf' && (
            <ShelfScreen
              items={shelfItems}
              onRenameItem={handleRenameShelfItem}
              onDeleteItem={handleDeleteShelfItem}
              onClearAll={handleClearShelf}
              onGoToScope={() => setScreen('scope')}
            />
          )}

          {screen === 'challenge' && (
            <ChallengeScreen
              clearedMap={challengesCleared}
              micStatus={micStatus}
              liveAnalysisRef={challengeAnalysisRef}
              historyRef={challengeHistoryRef}
              onMarkCleared={handleMarkChallengeCleared}
              onStartMic={() => void startMicrophone(false)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (56px height, well below 15% cap) */}
      <nav
        aria-label="メインナビゲーション"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white border-t border-slate-200 grid grid-cols-3"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = screen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active ? 'text-emerald-700' : 'text-slate-600'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>
                {item.label}
                {item.badge ? ` (${item.badge})` : ''}
              </span>
            </button>
          );
        })}
      </nav>

      {isDebugMode && <DebugPanel liveInfo={debugInfo} />}
    </div>
  );
}
