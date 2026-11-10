'use client';

import React from 'react';
import { Mic, Square, Sparkles } from 'lucide-react';
import { AppStatus } from '../types/interview';
import { StatusIndicator } from './StatusIndicator';

interface HeaderProps {
  status: AppStatus;
  isCapturing: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function Header({
  status,
  isCapturing,
  canStart,
  onStart,
  onStop,
}: HeaderProps) {
  const isSessionActive =
    status === 'Connecting' ||
    status === 'Listening' ||
    status === 'Thinking' ||
    status === 'Answering' ||
    isCapturing;

  return (
    <header className="w-full border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Real-Time AI Interview Assistant
            </h1>
            <p className="text-xs text-slate-400">
              Streaming STT (Deepgram) • Hybrid Question Detection • Gemini Live Answers
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator status={status} isCapturing={isCapturing} />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={isSessionActive || !canStart}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Mic className="h-4 w-4" />
              Start Listening
            </button>

            <button
              type="button"
              onClick={onStop}
              disabled={!isSessionActive}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Square className="h-4 w-4" />
              Stop Listening
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
