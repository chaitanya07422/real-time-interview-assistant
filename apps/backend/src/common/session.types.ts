import {
  AnswerMode,
  AudioInputMode,
  LatencyMetricsPayload,
} from './events.types';

export type SessionAudioState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'stopped'
  | 'error';

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface DetectedQuestionRecord {
  questionId: string;
  question: string;
  answerMode: AnswerMode;
  detectedAt: number;
  answer: string;
  completed: boolean;
}

export interface ActiveAnswerGeneration {
  questionId: string;
  question: string;
  startedAt: number;
  abortController: AbortController;
}

export interface InterviewSessionState {
  sessionId: string;
  resume: string;
  jobDescription: string;
  audioMode: AudioInputMode;
  answerMode: AnswerMode;
  mimeType?: string;
  sampleRate?: number;
  audioState: SessionAudioState;
  transcriptSegments: TranscriptSegment[];
  currentUtterance: string;
  detectedQuestions: DetectedQuestionRecord[];
  activeAnswerGeneration: ActiveAnswerGeneration | null;
  latestLatencyMetrics: LatencyMetricsPayload | null;
  questionCounter: number;
  createdAt: number;
}
