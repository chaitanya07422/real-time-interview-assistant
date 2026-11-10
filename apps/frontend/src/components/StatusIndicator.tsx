'use client';

import React from 'react';
import { AppStatus } from '../types/interview';

interface StatusIndicatorProps {
  status: AppStatus;
  isCapturing?: boolean;
}

const STATUS_STYLES: Record<
  AppStatus,
  { badge: string; dot: string; label: string }
> = {
  Idle: {
    badge: 'bg-slate-800 text-slate-300 border-slate-700',
    dot: 'bg-slate-400',
    label: 'Idle — Ready to Configure',
  },
  Connecting: {
    badge: 'bg-amber-950/70 text-amber-300 border-amber-700/60',
    dot: 'bg-amber-400 animate-ping',
    label: 'Connecting to Pipeline...',
  },
  Listening: {
    badge: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
    dot: 'bg-emerald-400 animate-pulse',
    label: 'Listening — Capturing Audio',
  },
  Thinking: {
    badge: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/60',
    dot: 'bg-indigo-400 animate-pulse',
    label: 'Thinking — Processing Question',
  },
  Answering: {
    badge: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60',
    dot: 'bg-cyan-400 animate-ping',
    label: 'Answering — Streaming Gemini Response',
  },
  Error: {
    badge: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
    dot: 'bg-rose-400',
    label: 'Error — Attention Needed',
  },
  Stopped: {
    badge: 'bg-slate-800/80 text-slate-400 border-slate-700',
    dot: 'bg-slate-500',
    label: 'Stopped — Audio Released',
  },
};

export function StatusIndicator({ status, isCapturing }: StatusIndicatorProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Idle;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${style.badge}`}
        role="status"
        aria-live="polite"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={` inline-flex h-full w-full rounded-full ${style.dot}`}
          />
        </span>
        <span>{style.label}</span>
      </div>

      {isCapturing && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          REC
        </span>
      )}
    </div>
  );
}
