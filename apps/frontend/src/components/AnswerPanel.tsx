'use client';

import React from 'react';
import {
  Sparkles,
  Gauge,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  DetectedQuestionItem,
  LatencyMetrics,
  SessionError,
} from '../types/interview';

interface AnswerPanelProps {
  activeQuestion: DetectedQuestionItem | null;
  latestLatency: LatencyMetrics | null;
  error: SessionError | null;
  onDismissError: () => void;
}

export function AnswerPanel({
  activeQuestion,
  latestLatency,
  error,
  onDismissError,
}: AnswerPanelProps) {
  const latency = activeQuestion?.latency ?? latestLatency;
  const isStreaming =
    activeQuestion?.status === 'thinking' ||
    activeQuestion?.status === 'answering';

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col min-h-[260px] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          Suggested Interview Answer (Streamed)
        </h2>

        {latency && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
              <Gauge className="h-3 w-3 text-cyan-400" />
              Detection: <strong>{latency.questionDetectionMs}ms</strong>
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                latency.timeToFirstTokenMs <= 3000
                  ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-800/60 text-amber-300'
              }`}
            >
              TTFT: <strong>{latency.timeToFirstTokenMs}ms</strong>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
              Total: <strong>{latency.totalGenerationMs}ms</strong>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="bg-rose-950/70 border border-rose-700/70 rounded-lg p-3 flex items-start justify-between gap-3 text-xs text-rose-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-300">
                [{error.code}] Session Alert
              </div>
              <p className="mt-0.5 text-rose-200/90 leading-relaxed">
                {error.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-rose-300 hover:text-white p-1"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between">
        {!activeQuestion ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-slate-500 space-y-2">
            <Sparkles className="h-7 w-7 text-slate-700" />
            <p className="text-xs max-w-md">
              Once a question is detected, a concise 60–90 word answer grounded in your resume and job description will stream here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeQuestion.status === 'thinking' && !activeQuestion.answer && (
              <div className="flex items-center gap-2.5 text-xs text-cyan-300 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span>
                  Preparing context-aware response with Google Gemini...
                </span>
              </div>
            )}

            {activeQuestion.answer && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-4 text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
                {activeQuestion.answer}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 align-middle bg-cyan-400 animate-pulse" />
                )}
              </div>
            )}

            {activeQuestion.status === 'completed' && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Answer complete ({activeQuestion.questionId})
                </span>
                {activeQuestion.durationMs !== undefined && (
                  <span>Generated in {activeQuestion.durationMs}ms</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
