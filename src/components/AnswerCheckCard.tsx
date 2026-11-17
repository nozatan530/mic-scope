import { CheckCircle2, HelpCircle, RotateCcw } from 'lucide-react';
import type { AnswerCheckFeedback } from '../types';

interface AnswerCheckCardProps {
  feedback: AnswerCheckFeedback;
}

export function AnswerCheckCard({ feedback }: AnswerCheckCardProps) {
  const isPerfect = feedback.status === 'perfect';
  const isClose = feedback.status === 'close';
  const isUnmeasurable = feedback.status === 'unmeasurable';

  const containerStyle = isPerfect
    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
    : isClose
      ? 'bg-sky-50 border-sky-200 text-sky-950'
      : isUnmeasurable
        ? 'bg-slate-100 border-slate-200 text-slate-800'
        : 'bg-amber-50 border-amber-200 text-amber-950';

  const Icon = isPerfect ? CheckCircle2 : isUnmeasurable ? HelpCircle : RotateCcw;

  return (
    <div className={`rounded-xl border p-4 ${containerStyle}`} role="status">
      <div className="flex items-start gap-2.5">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base">{feedback.headline}</p>
          <p className="text-sm mt-1 leading-relaxed">{feedback.message}</p>

          {feedback.appFreq !== null && feedback.diffPercent !== null && (
            <div className="mt-3 pt-3 border-t border-black/10 grid grid-cols-3 gap-2 text-xs sm:text-sm">
              <div>
                <div className="text-black/60">自分の値</div>
                <div className="font-mono-tabular font-bold text-base mt-0.5">
                  {feedback.userFreq.toFixed(1)} Hz
                </div>
              </div>
              <div>
                <div className="text-black/60">アプリの値</div>
                <div className="font-mono-tabular font-bold text-base mt-0.5">
                  {feedback.appFreq.toFixed(1)} Hz
                </div>
              </div>
              <div>
                <div className="text-black/60">ずれ</div>
                <div className="font-mono-tabular font-bold text-base mt-0.5">
                  {feedback.diffPercent.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {feedback.appNoteLabel && (
            <p className="mt-2 text-xs font-medium text-black/75">
              音名：{feedback.appNoteLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function evaluateFrequencyAnswer(
  userFreq: number,
  appFreq: number | null,
  appNoteLabel: string | null
): AnswerCheckFeedback {
  if (appFreq === null) {
    return {
      userFreq,
      appFreq: null,
      appNoteLabel: null,
      diffPercent: null,
      status: 'unmeasurable',
      headline: '周期がはっきりしません',
      message:
        'この波形は周期がはっきりしないので、答え合わせできません。声をまっすぐ伸ばしてみよう。',
    };
  }

  const diffPercent = (Math.abs(userFreq - appFreq) / appFreq) * 100;

  if (diffPercent <= 5) {
    return {
      userFreq,
      appFreq,
      appNoteLabel,
      diffPercent,
      status: 'perfect',
      headline: 'ぴったり！',
      message: '周期 T から振動数 f をとても正確に計算できました。',
    };
  }

  // Check ~1000x or ~1/1000x unit conversion error (ms vs s)
  const ratio1000Up = Math.abs(userFreq - appFreq * 1000) / (appFreq * 1000);
  const ratio1000Down = Math.abs(userFreq - appFreq / 1000) / (appFreq / 1000);
  if (ratio1000Up <= 0.15 || ratio1000Down <= 0.15) {
    return {
      userFreq,
      appFreq,
      appNoteLabel,
      diffPercent,
      status: 'unit-error',
      headline: '単位の直し方を確かめよう',
      message: 'ms と s の直し方を確かめよう（1 ms = 0.001 s）',
    };
  }

  // Check ~1/2 or ~1/3 (measured 2 or 3 periods instead of 1)
  const halfDiff = Math.abs(userFreq - appFreq / 2) / (appFreq / 2);
  const thirdDiff = Math.abs(userFreq - appFreq / 3) / (appFreq / 3);
  if (halfDiff <= 0.1 || thirdDiff <= 0.1) {
    return {
      userFreq,
      appFreq,
      appNoteLabel,
      diffPercent,
      status: 'harmonic-sub',
      headline: '測った周期の数を確認しよう',
      message:
        'T を2周期（3周期）ぶん測っていない？ 山から『となりの』山までを測ろう',
    };
  }

  if (diffPercent <= 15) {
    return {
      userFreq,
      appFreq,
      appNoteLabel,
      diffPercent,
      status: 'close',
      headline: 'おしい！',
      message: 'おしい！カーソルを山の頂上にもっと正確に合わせてみよう',
    };
  }

  return {
    userFreq,
    appFreq,
    appNoteLabel,
    diffPercent,
    status: 'retry',
    headline: 'もう一度測ってみよう',
    message: '山から次の山までの時間が T だよ。もう一度測ってみよう',
  };
}
