export type AudioInputMode = 'microphone' | 'tab';

export interface StartSessionPayload {
  resume: string;
  jobDescription: string;
  audioMode: AudioInputMode;
  mimeType?: string;
  sampleRate?: number;
}

export interface AudioChunkJsonPayload {
  data: string; // base64 fallback if client sends JSON instead of binary
}

export interface ClientToServerMessage {
  type: 'START_SESSION' | 'AUDIO_CHUNK' | 'STOP_SESSION';
  payload?: StartSessionPayload | AudioChunkJsonPayload | Record<string, unknown>;
}

export interface SessionReadyEvent {
  type: 'SESSION_READY';
  payload?: {
    sessionId: string;
    timestamp: number;
  };
}

export interface TranscriptUpdateEvent {
  type: 'TRANSCRIPT_UPDATE';
  payload: {
    text: string;
    isFinal: false;
  };
}

export interface TranscriptFinalEvent {
  type: 'TRANSCRIPT_FINAL';
  payload: {
    text: string;
    isFinal: true;
  };
}

export interface QuestionDetectedEvent {
  type: 'QUESTION_DETECTED';
  payload: {
    questionId: string;
    question: string;
  };
}

export interface AnswerStartEvent {
  type: 'ANSWER_START';
  payload: {
    questionId: string;
  };
}

export interface AnswerChunkEvent {
  type: 'ANSWER_CHUNK';
  payload: {
    questionId: string;
    text: string;
  };
}

export interface AnswerCompleteEvent {
  type: 'ANSWER_COMPLETE';
  payload: {
    questionId: string;
    durationMs: number;
  };
}

export interface LatencyMetricsPayload {
  questionDetectionMs: number;
  timeToFirstTokenMs: number;
  totalGenerationMs: number;
  endToEndLatencyMs?: number;
  questionId?: string;
}

export interface LatencyMetricsEvent {
  type: 'LATENCY_METRICS';
  payload: LatencyMetricsPayload;
}

export type ErrorCode =
  | 'INVALID_MESSAGE'
  | 'INVALID_CONTEXT'
  | 'SESSION_NOT_FOUND'
  | 'AUDIO_FORMAT_INVALID'
  | 'AUDIO_BUFFER_OVERFLOW'
  | 'STT_CONNECTION_FAILED'
  | 'STT_AUTH_FAILED'
  | 'STT_STREAM_ERROR'
  | 'LLM_CONFIG_ERROR'
  | 'LLM_RATE_LIMITED'
  | 'LLM_GENERATION_FAILED'
  | 'INTERNAL_ERROR';

export interface ErrorEvent {
  type: 'ERROR';
  payload: {
    code: ErrorCode | string;
    message: string;
  };
}

export interface SessionStoppedEvent {
  type: 'SESSION_STOPPED';
  payload?: {
    sessionId?: string;
  };
}

export type ServerToClientEvent =
  | SessionReadyEvent
  | TranscriptUpdateEvent
  | TranscriptFinalEvent
  | QuestionDetectedEvent
  | AnswerStartEvent
  | AnswerChunkEvent
  | AnswerCompleteEvent
  | LatencyMetricsEvent
  | ErrorEvent
  | SessionStoppedEvent;
