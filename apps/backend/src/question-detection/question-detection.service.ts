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
  incompleteExpiryTimer: NodeJS.Timeout | null;
  lastOnDetected: QuestionDetectedCallback | null;
  questionCounter: number;
  processedQuestions: Array<{
    normalized: string;
    tokens: Set<string>;
    detectedAt: number;
  }>;
  lastTranscriptSegmentNormalized: string;
}

const INCOMPLETE_CONTINUATION_WINDOW_MS = 10_000;

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
        incompleteExpiryTimer: null,
        lastOnDetected: null,
        questionCounter: 0,
        processedQuestions: [],
        lastTranscriptSegmentNormalized: '',
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private joinSegments(segments: string[]): string {
    if (segments.length === 0) return '';
    if (segments.length === 1) return segments[0].trim();

    let combined = segments[0].trim();
    for (let i = 1; i < segments.length; i++) {
      const nextSeg = segments[i].trim();
      if (!nextSeg) continue;
      if (looksIncompletePhrase(combined)) {
        combined = combined.replace(/[.?!]+$/, '').trim();
      }
      combined = `${combined} ${nextSeg}`;
    }
    return combined.replace(/\s+/g, ' ').trim();
  }

  notifyInterimTranscript(sessionId: string, timestamp: number = Date.now()): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.segments.length === 0) {
      return;
    }

    // Speaker is actively continuing their utterance; reset pending silence timer
    // so we do not prematurely evaluate a partial question mid-speech.
    if (session.silenceTimer) {
      this.clearSilenceTimer(session);
      session.silenceTimer = setTimeout(() => {
        this.evaluateAccumulatedUtterance(sessionId, undefined, Date.now());
      }, this.defaultSilenceThresholdMs);
    }

    if (session.incompleteExpiryTimer) {
      session.lastSegmentAt = timestamp;
    }
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

    if (
      session.segments.length > 0 &&
      session.lastSegmentAt !== null &&
      now - session.lastSegmentAt > INCOMPLETE_CONTINUATION_WINDOW_MS
    ) {
      session.segments = [];
      session.firstSegmentAt = null;
      session.lastTranscriptSegmentNormalized = '';
    }

    session.lastOnDetected = onDetected;
    session.segments.push(trimmed);
    if (session.firstSegmentAt === null) {
      session.firstSegmentAt = now;
    }
    session.lastSegmentAt = now;

    this.clearSilenceTimer(session);
    this.clearIncompleteExpiryTimer(session);

    const accumulatedText = this.joinSegments(session.segments);
    const silenceMs =
      options?.silenceThresholdMs ?? this.defaultSilenceThresholdMs;

    if (options?.speechFinal && !looksIncompletePhrase(accumulatedText)) {
      return this.evaluateAccumulatedUtterance(sessionId, onDetected, now);
    }

    session.silenceTimer = setTimeout(() => {
      this.evaluateAccumulatedUtterance(
        sessionId,
        session.lastOnDetected ?? onDetected,
        Date.now(),
      );
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

    const rawUtterance = this.joinSegments(session.segments);
    const audioEndpointAt = session.lastSegmentAt ?? evaluatedAt;

    if (looksIncompletePhrase(rawUtterance)) {
      this.logger.debug(
        `Holding incomplete utterance in session ${sessionId} awaiting continuation: "${rawUtterance}"`,
      );
      this.clearIncompleteExpiryTimer(session);
      session.incompleteExpiryTimer = setTimeout(() => {
        const current = this.sessions.get(sessionId);
        if (current) {
          current.segments = [];
          current.firstSegmentAt = null;
          current.lastSegmentAt = null;
          current.lastTranscriptSegmentNormalized = '';
        }
      }, INCOMPLETE_CONTINUATION_WINDOW_MS);
      return null;
    }

    this.clearIncompleteExpiryTimer(session);
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

    const callbackToUse = onDetected ?? session.lastOnDetected;
    if (callbackToUse) {
      callbackToUse(result);
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

  private clearIncompleteExpiryTimer(session: SessionDetectionBuffer): void {
    if (session.incompleteExpiryTimer) {
      clearTimeout(session.incompleteExpiryTimer);
      session.incompleteExpiryTimer = null;
    }
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.clearSilenceTimer(session);
      this.clearIncompleteExpiryTimer(session);
      this.sessions.delete(sessionId);
    }
  }
}
