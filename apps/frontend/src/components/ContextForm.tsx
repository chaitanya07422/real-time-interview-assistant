'use client';

import React, { useState } from 'react';
import { FileText, Briefcase, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUME } from '../types/interview';

interface ContextFormProps {
  resume: string;
  jobDescription: string;
  onChangeResume: (value: string) => void;
  onChangeJobDescription: (value: string) => void;
  disabled?: boolean;
}

export function ContextForm({
  resume,
  jobDescription,
  onChangeResume,
  onChangeJobDescription,
  disabled,
}: ContextFormProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isContextValid =
    resume.trim().length > 0 && jobDescription.trim().length > 0;

  const handleLoadSample = () => {
    onChangeResume(SAMPLE_RESUME);
    onChangeJobDescription(SAMPLE_JOB_DESCRIPTION);
  };

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Candidate Context Configuration
          </h2>
          {isContextValid ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Context Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-full">
              <AlertCircle className="h-3 w-3" />
              Required Before Starting
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/60 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Load Sample Context
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-800 hover:border-slate-700"
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label
              htmlFor="resume-input"
              className="flex items-center justify-between text-xs font-medium text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
                Resume / Professional Summary <span className="text-rose-400">*</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {resume.trim().length} chars
              </span>
            </label>
            <textarea
              id="resume-input"
              rows={5}
              disabled={disabled}
              value={resume}
              onChange={(e) => onChangeResume(e.target.value)}
              placeholder="Paste your resume, technical experience, key projects, and achievements here..."
              className="w-full rounded-lg bg-slate-950/90 border border-slate-800 focus:border-indigo-500 focus:outline-none p-3 text-xs text-slate-200 placeholder-slate-600 leading-relaxed resize-y disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="jd-input"
              className="flex items-center justify-between text-xs font-medium text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
                Job Description <span className="text-rose-400">*</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {jobDescription.trim().length} chars
              </span>
            </label>
            <textarea
              id="jd-input"
              rows={5}
              disabled={disabled}
              value={jobDescription}
              onChange={(e) => onChangeJobDescription(e.target.value)}
              placeholder="Paste the target job description, role responsibilities, and required skills here..."
              className="w-full rounded-lg bg-slate-950/90 border border-slate-800 focus:border-indigo-500 focus:outline-none p-3 text-xs text-slate-200 placeholder-slate-600 leading-relaxed resize-y disabled:opacity-60"
            />
          </div>
        </div>
      )}
    </section>
  );
}
