'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackendSocketEvent,
  InterviewWebSocketService,
} from '../services/websocket';
import {
  AppStatus,
  CandidateContext,
  DetectedQuestionItem,
  LatencyMetrics,
  SessionError,
  TranscriptSegment,
} from '../types/interview';
import { useAudioCapture } from './useAudioCapture';

export function useInterviewSocket() {
  const [status, setStatus] = useState<AppStatus>('Idle');
  const [transcriptSegments, setTranscriptSegments] = useState<
    TranscriptSegment[]
  >([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [questions, setQuestions] = useState<DetectedQuestionItem[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [latestLatency, setLatestLatency] = useState<LatencyMetrics | null>(
    null,
  );
  const [error, setError] = useState<SessionError | null>(null);

  const wsRef = useRef<InterviewWebSocketService | null>(null);
  const questionCounterRef = useRef<number>(0);
  const activeQuestionIdRef = useRef<string | null>(null);
  const { isCapturing, activeMimeType, startCapture, stopCapture } =
    useAudioCapture();

  const handleBackendEvent = useCallback((event: BackendSocketEvent) => {
    switch (event.type) {
      case 'SESSION_READY': {
        setStatus('Listening');
        setError(null);
        break;
      }

      case 'TRANSCRIPT_UPDATE': {
        setInterimTranscript(event.payload.text);
        break;
      }

      case 'TRANSCRIPT_FINAL': {
        setInterimTranscript('');
        setTranscriptSegments((prev) => [
          ...prev,
          {
            id: `seg-${Date.now()}-${prev.length + 1}`,
            text: event.payload.text,
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case 'QUESTION_DETECTED': {
        const { questionId, question } = event.payload;
        questionCounterRef.current += 1;
        const seq = questionCounterRef.current;
        activeQuestionIdRef.current = questionId;
        setActiveQuestionId(questionId);
        setStatus('Thinking');

        setQuestions((prev) => {
          if (prev.some((q) => q.questionId === questionId)) {
            return prev;
          }
          return [
            ...prev,
            {
              questionId,
              sequenceNumber: seq,
              question,
              detectedAt: Date.now(),
              status: 'thinking',
              answer: '',
            },
          ];
        });
        break;
      }

      case 'ANSWER_START': {
        const { questionId } = event.payload;
        activeQuestionIdRef.current = questionId;
        setActiveQuestionId(questionId);
        setStatus('Answering');
        setQuestions((prev) =>
          prev.map((q) =>
            q.questionId === questionId ? { ...q, status: 'answering' } : q,
          ),
        );
        break;
      }

      case 'ANSWER_CHUNK': {
        const { questionId, text } = event.payload;
        setStatus('Answering');
        // Strictly associate chunks by questionId so answers never mix
        setQuestions((prev) =>
          prev.map((q) =>
            q.questionId === questionId
              ? { ...q, status: 'answering', answer: q.answer + text }
              : q,
          ),
        );
        break;
      }

      case 'ANSWER_COMPLETE': {
        const { questionId, durationMs } = event.payload;
        setQuestions((prev) =>
          prev.map((q) =>
            q.questionId === questionId
              ? { ...q, status: 'completed', durationMs }
              : q,
          ),
        );
        setStatus((current) =>
          current === 'Stopped' || current === 'Error' ? current : 'Listening',
        );
        break;
      }

      case 'LATENCY_METRICS': {
        const metrics = event.payload;
        setLatestLatency(metrics);
        const currentQId = activeQuestionIdRef.current;
        if (currentQId) {
          setQuestions((prev) =>
            prev.map((q) =>
              q.questionId === currentQId ? { ...q, latency: metrics } : q,
            ),
          );
        }
        break;
      }

      case 'ERROR': {
        const { code, message } = event.payload;
        setError({
          code,
          message,
          recoverable: true,
        });
        setStatus('Error');
        break;
      }

      case 'SESSION_STOPPED': {
        setStatus('Stopped');
        setInterimTranscript('');
        break;
      }
    }
  }, []);

  const stopSession = useCallback(() => {
    stopCapture();
    if (wsRef.current) {
      wsRef.current.sendStopSession();
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setInterimTranscript('');
    setStatus('Stopped');
  }, [stopCapture]);

  const startSession = useCallback(
    async (context: CandidateContext) => {
      const trimmedResume = context.resume.trim();
      const trimmedJd = context.jobDescription.trim();

      if (!trimmedResume || !trimmedJd) {
        setError({
          code: 'INVALID_CONTEXT',
          message:
            'Both Candidate Resume and Job Description are required before starting a session.',
          recoverable: true,
        });
        setStatus('Error');
        return;
      }

      setError(null);
      setStatus('Connecting');

      try {
        const ws = new InterviewWebSocketService();
        wsRef.current = ws;

        await ws.connect({
          onEvent: handleBackendEvent,
          onDisconnect: (recoverable, attempt, maxAttempts) => {
            stopCapture();
            setError({
              code: recoverable ? 'WS_RECONNECTING' : 'WS_DISCONNECTED',
              message: recoverable
                ? `WebSocket interrupted. Reconnecting (attempt ${attempt}/${maxAttempts})...`
                : 'WebSocket connection lost. Click Start Listening to begin a fresh session.',
              recoverable: true,
            });
            setStatus(recoverable ? 'Connecting' : 'Error');
          },
          onReconnected: () => {
            setError({
              code: 'WS_RECONNECTED_NEEDS_RESTART',
              message:
                'WebSocket connection restored. Click Start Listening to resume audio capture.',
              recoverable: true,
            });
            setStatus('Stopped');
          },
          onError: (code, message) => {
            setError({ code, message, recoverable: true });
            setStatus('Error');
          },
        });

        const audioMeta = await startCapture({
          mode: context.audioMode,
          onAudioChunk: (chunk) => wsRef.current?.sendAudioChunk(chunk),
          onStreamInterrupted: (reason) => {
            wsRef.current?.sendStopSession();
            wsRef.current?.disconnect();
            wsRef.current = null;
            setError({
              code: 'AUDIO_STREAM_INTERRUPTED',
              message: `${reason} Click Start Listening to restart audio capture.`,
              recoverable: true,
            });
            setStatus('Stopped');
          },
        });

        ws.sendStartSession({
          resume: trimmedResume,
          jobDescription: trimmedJd,
          audioMode: context.audioMode,
          mimeType: audioMeta.mimeType,
          sampleRate: audioMeta.sampleRate,
        });
      } catch (err: unknown) {
        stopCapture();
        wsRef.current?.disconnect();
        wsRef.current = null;
        setError({
          code: 'SESSION_START_FAILED',
          message:
            err instanceof Error ? err.message : 'Failed to start interview session.',
          recoverable: true,
        });
        setStatus('Error');
      }
    },
    [handleBackendEvent, startCapture, stopCapture],
  );

  const simulateQuestion = useCallback(
    async (questionText: string, context: CandidateContext) => {
      const trimmedResume = context.resume.trim();
      const trimmedJd = context.jobDescription.trim();

      if (!trimmedResume || !trimmedJd) {
        setError({
          code: 'INVALID_CONTEXT',
          message: 'Please provide both Candidate Resume and Job Description first.',
          recoverable: true,
        });
        setStatus('Error');
        return;
      }

      try {
        if (!wsRef.current) {
          setStatus('Connecting');
          const ws = new InterviewWebSocketService();
          wsRef.current = ws;

          await ws.connect({
            onEvent: handleBackendEvent,
            onDisconnect: (_rec, attempt, max) => {
              setError({
                code: 'WS_DISCONNECTED',
                message: `WebSocket disconnected (${attempt}/${max}).`,
                recoverable: true,
              });
              setStatus('Error');
            },
            onError: (code, message) => {
              setError({ code, message, recoverable: true });
              setStatus('Error');
            },
          });

          ws.sendStartSession({
            resume: trimmedResume,
            jobDescription: trimmedJd,
            audioMode: context.audioMode,
            mimeType: 'audio/webm',
          });
        }

        wsRef.current.sendSimulatedSpeech(questionText, true, true);
      } catch (err: unknown) {
        setError({
          code: 'SIMULATION_FAILED',
          message:
            err instanceof Error ? err.message : 'Failed to connect to backend.',
          recoverable: true,
        });
        setStatus('Error');
      }
    },
    [handleBackendEvent],
  );

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'Error') {
      setStatus(isCapturing ? 'Listening' : 'Idle');
    }
  }, [status, isCapturing]);

  const activeQuestion =
    questions.find((q) => q.questionId === activeQuestionId) ??
    questions[questions.length - 1] ??
    null;

  useEffect(() => {
    return () => {
      stopCapture();
      wsRef.current?.disconnect();
    };
  }, [stopCapture]);

  return {
    status,
    transcriptSegments,
    interimTranscript,
    questions,
    activeQuestion,
    activeQuestionId,
    setActiveQuestionId,
    latestLatency,
    error,
    isCapturing,
    activeMimeType,
    startSession,
    stopSession,
    simulateQuestion,
    clearError,
  };
}
