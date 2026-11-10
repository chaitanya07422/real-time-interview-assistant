'use client';

import React, { useEffect, useRef } from 'react';
import { MessageSquareText, Waves } from 'lucide-react';
import { TranscriptSegment } from '../types/interview';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  interimTranscript: string;
  isListening: boolean;
}

export function TranscriptPanel({
  segments,
  interimTranscript,
  isListening,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, interimTranscript]);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col h-[420px]">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-emerald-400" />
          Live Speech Transcript
        </h2>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{segments.length} confirmed segments</span>
          {isListening && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Waves className="h-3.5 w-3.5 animate-pulse" />
              Streaming
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
        {segments.length === 0 && !interimTranscript ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 text-slate-500 space-y-2">
            <Waves className="h-8 w-8 text-slate-700" />
            <p className="text-xs">
              No speech transcribed yet. Click{' '}
              <span className="text-slate-300 font-medium">Start Listening</span>{' '}
              or trigger a demo question above to see live transcription.
            </p>
          </div>
        ) : (
          <>
            {segments.map((seg) => (
              <div
                key={seg.id}
                className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-200 leading-relaxed"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span className="font-mono text-emerald-400/90">CONFIRMED</span>
                  <span>
                    {new Date(seg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p>{seg.text}</p>
              </div>
            ))}

            {interimTranscript && (
              <div
                data-testid="interim-transcript"
                className="bg-indigo-950/30 border border-dashed border-indigo-500/40 rounded-lg p-2.5 text-xs text-indigo-200/90 italic leading-relaxed"
              >
                <div className="flex items-center justify-between text-[10px] text-indigo-400 mb-1 not-italic">
                  <span className="font-mono">INTERIM (LIVE...)</span>
                </div>
                <p>{interimTranscript}</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
