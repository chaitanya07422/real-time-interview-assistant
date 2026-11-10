import { Injectable } from '@nestjs/common';
import { LatencyMetricsPayload } from '../common/events.types';

interface QuestionTimingRecord {
  questionId: string;
  audioEndpointAt: number;
  questionDetectedAt: number;
  questionDetectionMs: number;
  llmRequestStartedAt?: number;
  firstTokenAt?: number;
  timeToFirstTokenMs?: number;
  completedAt?: number;
  totalGenerationMs?: number;
}

@Injectable()
export class MetricsService {
  private readonly lastAudioEndpointBySession = new Map<string, number>();
  private readonly questionTimings = new Map<string, QuestionTimingRecord>();

  private getKey(sessionId: string, questionId: string): string {
    return `${sessionId}:${questionId}`;
  }

  recordAudioEndpoint(sessionId: string, timestamp: number = Date.now()): void {
    this.lastAudioEndpointBySession.set(sessionId, timestamp);
  }

  recordQuestionDetected(
    sessionId: string,
    questionId: string,
    explicitAudioEndpointAt?: number,
    detectedAt: number = Date.now(),
  ): number {
    const audioEndpointAt =
      explicitAudioEndpointAt ??
      this.lastAudioEndpointBySession.get(sessionId) ??
      detectedAt;

    const questionDetectionMs = Math.max(0, Math.round(detectedAt - audioEndpointAt));

    this.questionTimings.set(this.getKey(sessionId, questionId), {
      questionId,
      audioEndpointAt,
      questionDetectedAt: detectedAt,
      questionDetectionMs,
    });

    return questionDetectionMs;
  }

  recordLlmRequestStart(
    sessionId: string,
    questionId: string,
    startedAt: number = Date.now(),
  ): void {
    const key = this.getKey(sessionId, questionId);
    const existing = this.questionTimings.get(key);
    if (existing) {
      existing.llmRequestStartedAt = startedAt;
    } else {
      this.questionTimings.set(key, {
        questionId,
        audioEndpointAt: startedAt,
        questionDetectedAt: startedAt,
        questionDetectionMs: 0,
        llmRequestStartedAt: startedAt,
      });
    }
  }

  recordFirstToken(
    sessionId: string,
    questionId: string,
    firstTokenAt: number = Date.now(),
  ): number {
    const key = this.getKey(sessionId, questionId);
    const existing = this.questionTimings.get(key);
    if (!existing) {
      return 0;
    }

    if (existing.firstTokenAt === undefined) {
      existing.firstTokenAt = firstTokenAt;
      const baseTime = existing.llmRequestStartedAt ?? existing.questionDetectedAt;
      existing.timeToFirstTokenMs = Math.max(0, Math.round(firstTokenAt - baseTime));
    }

    return existing.timeToFirstTokenMs ?? 0;
  }

  recordGenerationComplete(
    sessionId: string,
    questionId: string,
    completedAt: number = Date.now(),
  ): LatencyMetricsPayload {
    const key = this.getKey(sessionId, questionId);
    const existing = this.questionTimings.get(key);

    if (!existing) {
      return {
        questionId,
        questionDetectionMs: 0,
        timeToFirstTokenMs: 0,
        totalGenerationMs: 0,
        endToEndLatencyMs: 0,
      };
    }

    existing.completedAt = completedAt;
    const llmStart = existing.llmRequestStartedAt ?? existing.questionDetectedAt;
    const totalGenerationMs = Math.max(0, Math.round(completedAt - llmStart));
    const timeToFirstTokenMs =
      existing.timeToFirstTokenMs ?? totalGenerationMs;
    const endToEndLatencyMs =
      existing.firstTokenAt !== undefined
        ? Math.max(0, Math.round(existing.firstTokenAt - existing.audioEndpointAt))
        : Math.max(
            0,
            existing.questionDetectionMs + timeToFirstTokenMs,
          );

    existing.totalGenerationMs = totalGenerationMs;

    return {
      questionId,
      questionDetectionMs: existing.questionDetectionMs,
      timeToFirstTokenMs,
      totalGenerationMs,
      endToEndLatencyMs,
    };
  }

  clearSession(sessionId: string): void {
    this.lastAudioEndpointBySession.delete(sessionId);
    const prefix = `${sessionId}:`;
    for (const key of this.questionTimings.keys()) {
      if (key.startsWith(prefix)) {
        this.questionTimings.delete(key);
      }
    }
  }
}
