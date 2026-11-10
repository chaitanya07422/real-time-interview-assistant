'use client';

import React from 'react';
import {
  Mic,
  MonitorSpeaker,
  Play,
  Radio,
  Zap,
  AlignLeft,
  Award,
} from 'lucide-react';
import {
  AnswerMode,
  AppStatus,
  AudioInputMode,
  DEMO_INTERVIEW_QUESTIONS,
} from '../types/interview';

interface AudioControlsProps {
  audioMode: AudioInputMode;
  onChangeAudioMode: (mode: AudioInputMode) => void;
  answerMode: AnswerMode;
  onChangeAnswerMode: (mode: AnswerMode) => void;
  status: AppStatus;
  isCapturing: boolean;
  activeMimeType: string;
  onSimulateQuestion: (question: string) => void;
}

const ANSWER_MODE_OPTIONS: Array<{
  mode: AnswerMode;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    mode: 'concise',
    label: 'Concise (Default)',
    sublabel: '60–90 words • 3–6 bullet points',
    icon: Zap,
  },
  {
    mode: 'detailed',
    label: 'Detailed',
    sublabel: '130–180 words • Architecture & depth',
    icon: AlignLeft,
  },
  {
    mode: 'star',
    label: 'STAR Format',
    sublabel: 'Situation • Task • Action • Result',
    icon: Award,
  },
];

export function AudioControls({
  audioMode,
  onChangeAudioMode,
  answerMode,
  onChangeAnswerMode,
  status,
  isCapturing,
  activeMimeType,
  onSimulateQuestion,
}: AudioControlsProps) {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Radio className="h-4 w-4 text-indigo-400" />
          Audio Source & Demo Controls
        </h2>
        {activeMimeType && isCapturing && (
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
            {activeMimeType}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={isCapturing}
          onClick={() => onChangeAudioMode('microphone')}
          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
            audioMode === 'microphone'
              ? 'bg-indigo-950/50 border-indigo-500/80 text-white'
              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
          } ${isCapturing ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <Mic
            className={`h-5 w-5 mt-0.5 shrink-0 ${
              audioMode === 'microphone' ? 'text-indigo-400' : 'text-slate-500'
            }`}
          />
          <div>
            <div className="text-xs font-semibold">Mode B: Microphone Audio</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Captures live speech via <code className="text-slate-300">getUserMedia()</code>
            </p>
          </div>
        </button>

        <button
          type="button"
          disabled={isCapturing}
          onClick={() => onChangeAudioMode('tab')}
          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
            audioMode === 'tab'
              ? 'bg-indigo-950/50 border-indigo-500/80 text-white'
              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
          } ${isCapturing ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <MonitorSpeaker
            className={`h-5 w-5 mt-0.5 shrink-0 ${
              audioMode === 'tab' ? 'text-indigo-400' : 'text-slate-500'
            }`}
          />
          <div>
            <div className="text-xs font-semibold">Mode A: Browser Tab Audio</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Captures meeting tab via <code className="text-slate-300">getDisplayMedia()</code>
            </p>
          </div>
        </button>
      </div>

      {audioMode === 'tab' && (
        <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
          Tip: When the browser dialog opens, select your interview tab (e.g., Google Meet / Zoom / YouTube) and enable <strong>&ldquo;Also share tab audio&rdquo;</strong>.
        </div>
      )}

      <div className="pt-2 border-t border-slate-800/80">
        <div className="text-[11px] font-medium text-slate-400 mb-2">
          AI Answer Generation Mode (Default: Concise 60–90 words):
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ANSWER_MODE_OPTIONS.map(({ mode, label, sublabel, icon: Icon }) => {
            const active = answerMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeAnswerMode(mode)}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                  active
                    ? 'bg-cyan-950/50 border-cyan-500/80 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    active ? 'text-cyan-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold">{label}</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{sublabel}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-slate-800/80">
        <div className="text-[11px] font-medium text-slate-400 mb-2">
          Quick Demo Question Trigger (Simulates Completed Interviewer Speech):
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_INTERVIEW_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={status === 'Connecting' || status === 'Thinking' || status === 'Answering'}
              onClick={() => onSimulateQuestion(q)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-slate-800 hover:bg-indigo-600/80 text-slate-200 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
            >
              <Play className="h-2.5 w-2.5" />
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
