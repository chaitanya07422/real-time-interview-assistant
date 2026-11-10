'use client';

import React, { useState } from 'react';
import { AnswerPanel } from '../components/AnswerPanel';
import { AudioControls } from '../components/AudioControls';
import { ContextForm } from '../components/ContextForm';
import { Header } from '../components/Header';
import { QuestionPanel } from '../components/QuestionPanel';
import { TranscriptPanel } from '../components/TranscriptPanel';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import {
  AnswerMode,
  AudioInputMode,
  SAMPLE_JOB_DESCRIPTION,
  SAMPLE_RESUME,
} from '../types/interview';

export default function InterviewDashboardPage() {
  const [resume, setResume] = useState<string>(SAMPLE_RESUME);
  const [jobDescription, setJobDescription] = useState<string>(
    SAMPLE_JOB_DESCRIPTION,
  );
  const [audioMode, setAudioMode] = useState<AudioInputMode>('microphone');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('concise');

  const {
    status,
    transcriptSegments,
    interimTranscript,
    questions,
    activeQuestion,
    setActiveQuestionId,
    latestLatency,
    error,
    isCapturing,
    activeMimeType,
    startSession,
    stopSession,
    simulateQuestion,
    updateAnswerMode,
    clearError,
  } = useInterviewSocket();

  const canStart =
    resume.trim().length > 0 && jobDescription.trim().length > 0;

  const handleChangeAnswerMode = (mode: AnswerMode) => {
    setAnswerMode(mode);
    updateAnswerMode(mode);
  };

  const handleStartListening = () => {
    void startSession({
      resume,
      jobDescription,
      audioMode,
      answerMode,
    });
  };

  const handleSimulateQuestion = (questionText: string) => {
    void simulateQuestion(questionText, {
      resume,
      jobDescription,
      audioMode,
      answerMode,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header
        status={status}
        isCapturing={isCapturing}
        canStart={canStart}
        onStart={handleStartListening}
        onStop={stopSession}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top Configuration Area: Resume, Job Description & Audio Source */}
        <ContextForm
          resume={resume}
          jobDescription={jobDescription}
          onChangeResume={setResume}
          onChangeJobDescription={setJobDescription}
          disabled={isCapturing}
        />

        <AudioControls
          audioMode={audioMode}
          onChangeAudioMode={setAudioMode}
          answerMode={answerMode}
          onChangeAnswerMode={handleChangeAnswerMode}
          status={status}
          isCapturing={isCapturing}
          activeMimeType={activeMimeType}
          onSimulateQuestion={handleSimulateQuestion}
        />

        {/* Main Split Area: Left = Live Transcript, Right = Detected Question + Streamed Answer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5">
            <TranscriptPanel
              segments={transcriptSegments}
              interimTranscript={interimTranscript}
              isListening={
                status === 'Listening' ||
                status === 'Thinking' ||
                status === 'Answering' ||
                isCapturing
              }
            />
          </div>

          <div className="lg:col-span-7 space-y-5">
            <QuestionPanel
              activeQuestion={activeQuestion}
              questions={questions}
              onSelectQuestion={(qId) => setActiveQuestionId(qId)}
            />

            <AnswerPanel
              activeQuestion={activeQuestion}
              latestLatency={latestLatency}
              error={error}
              onDismissError={clearError}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
