import { Injectable, Logger } from '@nestjs/common';
import {
  computeJaccardSimilarity,
  extractQuestionFromUtterance,
  extractWords,
  looksIncompletePhrase,
  normalizeQuestionText,
} from './question-patterns';

export interface DetectedQuestionResult {
  questionId: string;
  question: string;
  audioEndpointAt: number;
  detectedAt: number;
}

export type QuestionDetectedCallback = (result: DetectedQuestionResult) => void;

interface SessionDetectionBuffer {
  segments: string[];
  firstSegmentAt: number | null;
  lastSegmentAt: number | null;
  silenceTimer: NodeJS.Timeout | null;
  questionCounter: number;
  processedQuestions: Array<{
    normalized: string;
    tokens: Set<string>;
    detectedAt: number;
  }>;
  lastTranscriptSegmentNormalized: string;
}

@Injectable()
export class QuestionDetectionService {
  private readonly logger = new Logger(QuestionDetectionService.name);
  private readonly sessions = new Map<string, SessionDetectionBuffer>();
  private readonly defaultSilenceThresholdMs: number;

  constructor() {
    const envSilence = Number(process.env.QUESTION_SILENCE_THRESHOLD_MS ?? 900);
    this.defaultSilenceThresholdMs =
      Number.isFinite(envSilence) && envSilence >= 200 && envSilence <= 5000
        ? envSilence
        : 900;
  }

  private getOrCreateSession(sessionId: string): SessionDetectionBuffer {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        segments: [],
        firstSegmentAt: null,
        lastSegmentAt: null,
        silenceTimer: null,
        questionCounter: 0,
        processedQuestions: [],
        lastTranscriptSegmentNormalized: '',
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  ingestFinalTranscript(
    sessionId: string,
    text: string,
    onDetected: QuestionDetectedCallback,
    options?: {
      speechFinal?: boolean;
      silenceThresholdMs?: number;
      timestamp?: number;
    },
  ): DetectedQuestionResult | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const session = this.getOrCreateSession(sessionId);
    const now = options?.timestamp ?? Date.now();
    const normalizedSegment = normalizeQuestionText(trimmed);

    if (
      normalizedSegment &&
      normalizedSegment === session.lastTranscriptSegmentNormalized
    ) {
      return null;
    }
    session.lastTranscriptSegmentNormalized = normalizedSegment;

    session.segments.push(trimmed);
    if (session.firstSegmentAt === null) {
      session.firstSegmentAt = now;
    }
    session.lastSegmentAt = now;

    this.clearSilenceTimer(session);

    const accumulatedText = session.segments.join(' ').trim();
    const silenceMs =
      options?.silenceThresholdMs ?? this.defaultSilenceThresholdMs;

    if (options?.speechFinal && !looksIncompletePhrase(accumulatedText)) {
      return this.evaluateAccumulatedUtterance(sessionId, onDetected, now);
    }

    session.silenceTimer = setTimeout(() => {
      this.evaluateAccumulatedUtterance(sessionId, onDetected, Date.now());
    }, silenceMs);

    return null;
  }

  handleUtteranceEnd(
    sessionId: string,
    onDetected: QuestionDetectedCallback,
    timestamp: number = Date.now(),
  ): DetectedQuestionResult | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.segments.length === 0) {
      return null;
    }
    this.clearSilenceTimer(session);
    return this.evaluateAccumulatedUtterance(sessionId, onDetected, timestamp);
  }

  evaluateAccumulatedUtterance(
    sessionId: string,
    onDetected?: QuestionDetectedCallback,
    evaluatedAt: number = Date.now(),
  ): DetectedQuestionResult | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.segments.length === 0) {
      return null;
    }

    this.clearSilenceTimer(session);

    const rawUtterance = session.segments.join(' ').trim();
    const audioEndpointAt = session.lastSegmentAt ?? evaluatedAt;

    session.segments = [];
    session.firstSegmentAt = null;
    session.lastSegmentAt = null;
    session.lastTranscriptSegmentNormalized = '';

    const extractedQuestion = this.extractQuestionFromText(rawUtterance);
    if (!extractedQuestion) {
      this.logger.debug(
        `Ignored non-question utterance in session ${sessionId}: "${rawUtterance}"`,
      );
      return null;
    }

    if (this.isDuplicateQuestion(session, extractedQuestion, evaluatedAt)) {
      this.logger.debug(
        `Ignored duplicate question in session ${sessionId}: "${extractedQuestion}"`,
      );
      return null;
    }

    session.questionCounter += 1;
    const questionId = `question-${String(session.questionCounter).padStart(3, '0')}`;

    this.recordProcessedQuestion(session, extractedQuestion, evaluatedAt);

    const result: DetectedQuestionResult = {
      questionId,
      question: extractedQuestion,
      audioEndpointAt,
      detectedAt: evaluatedAt,
    };

    if (onDetected) {
      onDetected(result);
    }

    return result;
  }

  extractQuestionFromText(rawText: string): string | null {
    return extractQuestionFromUtterance(rawText);
  }

  private isDuplicateQuestion(
    session: SessionDetectionBuffer,
    question: string,
    now: number,
  ): boolean {
    const normalized = normalizeQuestionText(question);
    const tokens = new Set(extractWords(normalized));

    for (const prev of session.processedQuestions) {
      if (prev.normalized === normalized) {
        return true;
      }
      if (
        now - prev.detectedAt < 60_000 &&
        (prev.normalized.includes(normalized) ||
          normalized.includes(prev.normalized))
      ) {
        return true;
      }
      if (computeJaccardSimilarity(tokens, prev.tokens) >= 0.85) {
        return true;
      }
    }
    return false;
  }

  private recordProcessedQuestion(
    session: SessionDetectionBuffer,
    question: string,
    detectedAt: number,
  ): void {
    const normalized = normalizeQuestionText(question);
    const tokens = new Set(extractWords(normalized));
    session.processedQuestions.push({ normalized, tokens, detectedAt });
  }

  private clearSilenceTimer(session: SessionDetectionBuffer): void {
    if (session.silenceTimer) {
      clearTimeout(session.silenceTimer);
      session.silenceTimer = null;
    }
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.clearSilenceTimer(session);
      this.sessions.delete(sessionId);
    }
  }
}
