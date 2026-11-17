import { AlertTriangle, Lock, Mic, ShieldCheck } from 'lucide-react';
import type { MicStatus } from '../types';

interface StartScreenProps {
  micStatus: MicStatus;
  errorReason: string | null;
  shelfCount: number;
  onRequestMic: () => void;
  onOpenShelf: () => void;
}

export function StartScreen({
  micStatus,
  errorReason,
  shelfCount,
  onRequestMic,
  onOpenShelf,
}: StartScreenProps) {
  const isRequesting = micStatus === 'requesting';
  const isDenied = micStatus === 'denied';
  const isUnsupported = micStatus === 'unsupported';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl mx-auto my-auto">
        <div className="mb-8">
          <p className="text-xs font-medium text-emerald-700 tracking-wide mb-2">
            中学・高校 理科「音」の学習用オシロスコープ
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            マイクでオシロ
          </h1>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            声や楽器の音を、その場で波の形として映し出します。音の高さ・大きさ・音色のちがいを、自分の目で確かめよう。
          </p>
        </div>

        {/* Oscilloscope preview strip */}
        <div
          className="mb-6 rounded-xl bg-[#07130d] border border-emerald-950/80 p-4 sm:p-5 overflow-hidden"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 600 96"
            className="w-full h-20 sm:h-24"
            preserveAspectRatio="none"
          >
            <g stroke="#14452b" strokeWidth="1">
              <line x1="0" y1="48" x2="600" y2="48" stroke="#1e6b43" strokeWidth="1.5" />
              <line x1="0" y1="24" x2="600" y2="24" />
              <line x1="0" y1="72" x2="600" y2="72" />
              <line x1="60" y1="0" x2="60" y2="96" />
              <line x1="120" y1="0" x2="120" y2="96" />
              <line x1="180" y1="0" x2="180" y2="96" />
              <line x1="240" y1="0" x2="240" y2="96" />
              <line x1="300" y1="0" x2="300" y2="96" />
              <line x1="360" y1="0" x2="360" y2="96" />
              <line x1="420" y1="0" x2="420" y2="96" />
              <line x1="480" y1="0" x2="480" y2="96" />
              <line x1="540" y1="0" x2="540" y2="96" />
            </g>
            <path
              d="M 0 48 Q 37.5 8, 75 48 T 150 48 T 225 48 T 300 48 T 375 48 T 450 48 T 525 48 T 600 48"
              fill="none"
              stroke="#39ff7a"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* 3-step guide */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">つかいかた</h2>
          <ol className="space-y-3 text-base text-slate-800">
            <li className="flex items-start gap-3">
              <span className="font-mono-tabular font-semibold text-emerald-700 shrink-0">
                ①
              </span>
              <span>マイクをオンにする</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono-tabular font-semibold text-emerald-700 shrink-0">
                ②
              </span>
              <span>音を出して波形を見る</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="font-mono-tabular font-semibold text-emerald-700 shrink-0">
                ③
              </span>
              <span>止めて周期を測る</span>
            </li>
          </ol>
        </div>

        {/* Error states */}
        {isDenied && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 sm:p-5 text-amber-950"
          >
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="font-semibold">マイクの使用が許可されていません</p>
                <p>
                  ブラウザのアドレスバーの🔒（またはカメラ・マイクの設定）から、マイクを『許可』にしてください。
                </p>
              </div>
            </div>
          </div>
        )}

        {isUnsupported && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 sm:p-5 text-rose-950"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm leading-relaxed">
                <p className="font-semibold">この環境ではマイクを使えません</p>
                <p>
                  {errorReason ||
                    'HTTPSのページで開くか、マイクが接続されたブラウザで開いてください。'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={onRequestMic}
            disabled={isRequesting}
            className="w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold text-base sm:text-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Mic className="w-5 h-5 shrink-0" />
            <span>
              {isRequesting
                ? 'マイクを準備中...'
                : isDenied
                  ? 'もう一度試す'
                  : 'マイクをオンにする'}
            </span>
          </button>

          <div className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed px-1">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p>
              音は録音しません。マイクの音は、この端末の中で波形にするだけで、外には送りません。
            </p>
          </div>

          {shelfCount > 0 && (
            <div className="pt-2 border-t border-slate-200 flex justify-center">
              <button
                type="button"
                onClick={onOpenShelf}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
              >
                保存した波形を見る（棚に {shelfCount} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-2xl mx-auto w-full pt-8 text-center text-xs text-slate-400">
        マイクでオシロ · 端末内処理のみ
      </footer>
    </div>
  );
}
