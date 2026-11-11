'use client';

import React from 'react';
import { HelpCircle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { DetectedQuestionItem } from '../types/interview';

interface QuestionPanelProps {
  activeQuestion: DetectedQuestionItem | null;
  questions: DetectedQuestionItem[];
  onSelectQuestion: (questionId: string) => void;
}

export function QuestionPanel({
  activeQuestion,
  questions,
  onSelectQuestion,
}: QuestionPanelProps) {
  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-400" />
          Detected Interview Question
        </h2>

        {activeQuestion && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              #{activeQuestion.sequenceNumber} ({activeQuestion.questionId})
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="h-3 w-3" />
              {new Date(activeQuestion.detectedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>

      {!activeQuestion ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Waiting for a completed interview question or request (greetings and filler are ignored automatically).
        </div>
      ) : (
        <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
              Active Prompt
            </span>
            {activeQuestion.status === 'thinking' ||
            activeQuestion.status === 'answering' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                {activeQuestion.status === 'thinking'
                  ? 'Analyzing question...'
                  : 'Generating answer...'}
              </span>
            ) : activeQuestion.status === 'error' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                Generation failed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </span>
            )}
          </div>
          <p className="text-sm sm:text-base font-semibold text-white leading-snug">
            &ldquo;{activeQuestion.question}&rdquo;
          </p>
        </div>
      )}

      {questions.length > 1 && (
        <div className="pt-2 border-t border-slate-800/80">
          <div className="text-[11px] text-slate-400 mb-1.5">
            Session Questions ({questions.length}):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q) => {
              const isSelected = q.questionId === activeQuestion?.questionId;
              return (
                <button
                  key={q.questionId}
                  type="button"
                  onClick={() => onSelectQuestion(q.questionId)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors truncate max-w-[220px] ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  #{q.sequenceNumber}: {q.question}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
