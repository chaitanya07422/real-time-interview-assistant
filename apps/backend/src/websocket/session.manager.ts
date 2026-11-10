import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StartSessionPayload } from '../common/events.types';
import {
  ActiveAnswerGeneration,
  DetectedQuestionRecord,
  InterviewSessionState,
} from '../common/session.types';

const MAX_CONTEXT_LENGTH = 25_000;

export interface ContextValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly sessions = new Map<string, InterviewSessionState>();

  validateStartPayload(payload: unknown): ContextValidationResult {
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        errorCode: 'INVALID_CONTEXT',
        errorMessage: 'START_SESSION payload must be an object.',
      };
    }

    const candidate = payload as Partial<StartSessionPayload>;
    const resume = typeof candidate.resume === 'string' ? candidate.resume.trim() : '';
    const jobDescription =
      typeof candidate.jobDescription === 'string'
        ? candidate.jobDescription.trim()
        : '';

    if (!resume) {
      return {
        valid: false,
        errorCode: 'INVALID_CONTEXT',
        errorMessage: 'Candidate resume / professional summary is required.',
      };
    }

    if (!jobDescription) {
      return {
        valid: false,
        errorCode: 'INVALID_CONTEXT',
        errorMessage: 'Job description is required.',
      };
    }

    if (resume.length > MAX_CONTEXT_LENGTH || jobDescription.length > MAX_CONTEXT_LENGTH) {
      return {
        valid: false,
        errorCode: 'INVALID_CONTEXT',
        errorMessage: `Resume and job description must each be under ${MAX_CONTEXT_LENGTH} characters.`,
      };
    }

    if (candidate.audioMode !== 'microphone' && candidate.audioMode !== 'tab') {
      return {
        valid: false,
        errorCode: 'INVALID_CONTEXT',
        errorMessage: 'audioMode must be either "microphone" or "tab".',
      };
    }

    return { valid: true };
  }

  createSession(
    payload: StartSessionPayload,
    existingSessionId?: string,
  ): InterviewSessionState {
    const sessionId = existingSessionId ?? `session-${randomUUID()}`;
    const state: InterviewSessionState = {
      sessionId,
      resume: payload.resume.trim(),
      jobDescription: payload.jobDescription.trim(),
      audioMode: payload.audioMode,
      mimeType: payload.mimeType,
      sampleRate: payload.sampleRate,
      audioState: 'connecting',
      transcriptSegments: [],
      currentUtterance: '',
      detectedQuestions: [],
      activeAnswerGeneration: null,
      latestLatencyMetrics: null,
      questionCounter: 0,
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, state);
    this.logger.log(
      `Created interview session ${sessionId} (audioMode=${state.audioMode}, resumeChars=${state.resume.length}, jdChars=${state.jobDescription.length})`,
    );
    return state;
  }

  getSession(sessionId: string): InterviewSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  appendFinalTranscript(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.currentUtterance = '';
    session.transcriptSegments.push({
      id: `seg-${session.transcriptSegments.length + 1}`,
      text,
      timestamp: Date.now(),
    });
  }

  updateInterimTranscript(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.currentUtterance = text;
  }

  recordDetectedQuestion(
    sessionId: string,
    questionId: string,
    question: string,
    detectedAt: number,
  ): DetectedQuestionRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const record: DetectedQuestionRecord = {
      questionId,
      question,
      detectedAt,
      answer: '',
      completed: false,
    };
    session.detectedQuestions.push(record);
    return record;
  }

  setActiveAnswerGeneration(
    sessionId: string,
    generation: ActiveAnswerGeneration | null,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (
      session.activeAnswerGeneration &&
      session.activeAnswerGeneration.questionId !== generation?.questionId
    ) {
      session.activeAnswerGeneration.abortController.abort();
    }
    session.activeAnswerGeneration = generation;
  }

  appendAnswerChunk(sessionId: string, questionId: string, chunkText: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const q = session.detectedQuestions.find((item) => item.questionId === questionId);
    if (q) q.answer += chunkText;
  }

  completeQuestionAnswer(sessionId: string, questionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const q = session.detectedQuestions.find((item) => item.questionId === questionId);
    if (q) q.completed = true;
    if (session.activeAnswerGeneration?.questionId === questionId) {
      session.activeAnswerGeneration = null;
    }
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.activeAnswerGeneration) {
      try {
        session.activeAnswerGeneration.abortController.abort();
      } catch {
        // ignore abort errors
      }
      session.activeAnswerGeneration = null;
    }
    session.audioState = 'stopped';
    this.sessions.delete(sessionId);
    this.logger.log(`Destroyed session ${sessionId} and cleared temporary state.`);
  }
}
