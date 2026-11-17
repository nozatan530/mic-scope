import { useCallback, useEffect, useRef } from 'react';
import { GRID_DIVISIONS_X, GRID_DIVISIONS_Y } from '../constants';
import type { TimebaseMs, VerticalZoom } from '../constants';

export interface ScopeRenderOptions {
  samples: Float32Array | number[] | null;
  zoom: VerticalZoom;
  msPerDiv: TimebaseMs;
  isPaused: boolean;
  cursorAFrac: number;
  cursorBFrac: number;
}

export function renderOscilloscopeCanvas(
  canvas: HTMLCanvasElement,
  options: ScopeRenderOptions
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(100, Math.round(rect.width));
  const cssH = Math.max(100, Math.round(rect.height));

  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  // Dark oscilloscope background
  ctx.fillStyle = '#07130d';
  ctx.fillRect(0, 0, cssW, cssH);

  const divW = cssW / GRID_DIVISIONS_X;
  const divH = cssH / GRID_DIVISIONS_Y;
  const midY = cssH / 2;

  // Grid lines
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_DIVISIONS_X; i++) {
    const x = Math.round(i * divW) + 0.5;
    ctx.strokeStyle = i === GRID_DIVISIONS_X / 2 ? '#1b5e3a' : '#103b24';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }

  for (let j = 1; j < GRID_DIVISIONS_Y; j++) {
    const y = Math.round(j * divH) + 0.5;
    const isZero = j === GRID_DIVISIONS_Y / 2;
    ctx.strokeStyle = isZero ? '#257a4c' : '#103b24';
    ctx.lineWidth = isZero ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }

  // Subtle tick marks along center zero line
  ctx.strokeStyle = '#257a4c';
  ctx.lineWidth = 1;
  for (let i = 0; i < GRID_DIVISIONS_X * 5; i++) {
    const x = (i / (GRID_DIVISIONS_X * 5)) * cssW;
    ctx.beginPath();
    ctx.moveTo(x, midY - 3);
    ctx.lineTo(x, midY + 3);
    ctx.stroke();
  }

  // Axis annotations inside scope
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(134, 239, 172, 0.72)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`+${(1 / options.zoom).toFixed(options.zoom === 1 ? 0 : 2)}`, 8, 6);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`-${(1 / options.zoom).toFixed(options.zoom === 1 ? 0 : 2)}`, 8, cssH - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`0〜${(options.msPerDiv * GRID_DIVISIONS_X).toFixed(0)} ms`, cssW - 8, cssH - 6);

  // Waveform trace
  const { samples, zoom } = options;
  if (samples && samples.length > 1) {
    ctx.strokeStyle = '#39ff7a';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    const len = samples.length;
    const halfH = cssH / 2;

    if (len <= cssW * 2) {
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * cssW;
        const scaled = samples[i] * zoom;
        const y = midY - Math.max(-1.05, Math.min(1.05, scaled)) * halfH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      // Envelope min/max decimation per pixel column for ultra-crisp rendering at 10ms/div
      const cols = Math.max(1, Math.floor(cssW));
      for (let px = 0; px < cols; px++) {
        const start = Math.floor((px / cols) * len);
        const end = Math.min(len, Math.floor(((px + 1) / cols) * len));
        let minV = Infinity;
        let maxV = -Infinity;
        for (let k = start; k < end; k++) {
          const v = samples[k];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const yMax = midY - Math.max(-1.05, Math.min(1.05, maxV * zoom)) * halfH;
        const yMin = midY - Math.max(-1.05, Math.min(1.05, minV * zoom)) * halfH;
        if (px === 0) {
          ctx.moveTo(px, yMax);
          ctx.lineTo(px, yMin);
        } else {
          ctx.lineTo(px, yMax);
          ctx.lineTo(px, yMin);
        }
      }
    }
    ctx.stroke();
  } else {
    // Flat zero line when no samples
    ctx.strokeStyle = '#39ff7a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(cssW, midY);
    ctx.stroke();
  }

  // Paused measurement cursors (A = Blue, B = Orange)
  if (options.isPaused) {
    const drawCursor = (
      frac: number,
      lineColor: string,
      handleColor: string,
      label: string
    ) => {
      const x = Math.max(2, Math.min(cssW - 2, frac * cssW));

      // Vertical line
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top grab handle
      const hw = 28;
      const hh = 24;
      ctx.fillStyle = handleColor;
      ctx.beginPath();
      ctx.roundRect(x - hw / 2, 2, hw, hh, 6);
      ctx.fill();

      // Bottom grab handle
      ctx.beginPath();
      ctx.roundRect(x - hw / 2, cssH - hh - 2, hw, hh, 6);
      ctx.fill();

      // Handle text
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, 2 + hh / 2);
      ctx.fillText(label, x, cssH - hh / 2 - 2);
    };

    // Shaded interval between A and B
    const xA = options.cursorAFrac * cssW;
    const xB = options.cursorBFrac * cssW;
    const leftX = Math.min(xA, xB);
    const spanW = Math.abs(xB - xA);
    if (spanW > 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(leftX, 0, spanW, cssH);
    }

    drawCursor(options.cursorAFrac, '#60a5fa', '#2563eb', 'A');
    drawCursor(options.cursorBFrac, '#fb923c', '#ea580c', 'B');

    // A と B の間の時間を波形の上にも出す（スマホでは下の T 表示が画面外になるため）
    const deltaMs =
      Math.abs(options.cursorBFrac - options.cursorAFrac) *
      options.msPerDiv *
      GRID_DIVISIONS_X;
    const tLabel = `T = ${deltaMs.toFixed(1)} ms`;
    ctx.font = '700 14px "JetBrains Mono", monospace';
    const padX = 8;
    const boxW = ctx.measureText(tLabel).width + padX * 2;
    const boxH = 24;
    const centerX = (xA + xB) / 2;
    const boxX = Math.max(4, Math.min(cssW - boxW - 4, centerX - boxW / 2));
    const boxY = 32;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tLabel, boxX + padX, boxY + boxH / 2);
  }

  ctx.restore();
}

interface OscilloscopeCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPaused: boolean;
  frozenSamples: Float32Array | null;
  zoom: VerticalZoom;
  msPerDiv: TimebaseMs;
  cursorAFrac: number;
  cursorBFrac: number;
  onCursorAChange: (frac: number) => void;
  onCursorBChange: (frac: number) => void;
}

export function OscilloscopeCanvas({
  canvasRef,
  isPaused,
  frozenSamples,
  zoom,
  msPerDiv,
  cursorAFrac,
  cursorBFrac,
  onCursorAChange,
  onCursorBChange,
}: OscilloscopeCanvasProps) {
  const activeCursorRef = useRef<'A' | 'B' | null>(null);

  // Redraw when paused or cursor/zoom/timebase changes
  useEffect(() => {
    if (!isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderOscilloscopeCanvas(canvas, {
      samples: frozenSamples,
      zoom,
      msPerDiv,
      isPaused: true,
      cursorAFrac,
      cursorBFrac,
    });
  }, [isPaused, frozenSamples, zoom, msPerDiv, cursorAFrac, cursorBFrac, canvasRef]);

  // Also redraw on container resize while paused
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (isPaused) {
        renderOscilloscopeCanvas(canvas, {
          samples: frozenSamples,
          zoom,
          msPerDiv,
          isPaused: true,
          cursorAFrac,
          cursorBFrac,
        });
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isPaused, frozenSamples, zoom, msPerDiv, cursorAFrac, cursorBFrac, canvasRef]);

  const getFracFromEvent = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0.5;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return 0.5;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, [canvasRef]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const xA = cursorAFrac * rect.width;
    const xB = cursorBFrac * rect.width;
    const distA = Math.abs(clickX - xA);
    const distB = Math.abs(clickX - xB);

    // Choose whichever cursor is closer (generous touch area across whole canvas height)
    const target: 'A' | 'B' = distA <= distB ? 'A' : 'B';
    activeCursorRef.current = target;
    canvas.setPointerCapture(e.pointerId);

    const frac = getFracFromEvent(e.clientX);
    if (target === 'A') onCursorAChange(frac);
    else onCursorBChange(frac);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaused || !activeCursorRef.current) return;
    const frac = getFracFromEvent(e.clientX);
    if (activeCursorRef.current === 'A') onCursorAChange(frac);
    else onCursorBChange(frac);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeCursorRef.current) return;
    activeCursorRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }
  };

  return (
    <div className="relative flex-1 rounded-xl overflow-hidden border border-emerald-950 bg-[#07130d]">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
        className={`w-full h-[240px] sm:h-[300px] lg:h-[350px] block touch-none select-none ${
          isPaused ? 'cursor-ew-resize' : 'cursor-default'
        }`}
        aria-label="音の波形の表示画面"
      />
    </div>
  );
}
