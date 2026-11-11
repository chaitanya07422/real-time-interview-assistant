import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { AnswerGenerationService } from '../answer-generation/answer-generation.service';
import { AudioService } from '../audio/audio.service';
import {
  ServerToClientEvent,
  StartSessionPayload,
} from '../common/events.types';
import { MetricsService } from '../metrics/metrics.service';
import {
  DetectedQuestionResult,
  QuestionDetectionService,
} from '../question-detection/question-detection.service';
import { SessionManagerService } from './session.manager';

interface ClientConnectionContext {
  socket: WebSocket;
  sessionId: string | null;
}

@Injectable()
export class InterviewGateway implements OnModuleDestroy {
  private readonly logger = new Logger(InterviewGateway.name);
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<ClientConnectionContext>();

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly audioService: AudioService,
    private readonly questionDetectionService: QuestionDetectionService,
    private readonly answerGenerationService: AnswerGenerationService,
    private readonly metricsService: MetricsService,
  ) {}

  attachToServer(server: HttpServer): void {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({
      server,
      maxPayload: 1024 * 1024, // 1 MB max frame size
      verifyClient: (info, done) => {
        const allowed = this.isOriginAllowed(info.origin, info.req);
        if (!allowed) {
          this.logger.warn(`Rejected WebSocket connection from unauthorized origin: ${String(info.origin)}`);
          done(false, 403, 'Forbidden origin');
          return;
        }
        done(true);
      },
    });

    this.wss.on('connection', (socket: WebSocket) => {
      this.handleConnection(socket);
    });

    this.logger.log('WebSocket Gateway initialized and attached to HTTP server.');
  }

  private isOriginAllowed(origin: string | undefined, _req: IncomingMessage): boolean {
    // Allow non-browser test clients that do not send an Origin header
    if (!origin) {
      return true;
    }

    const configuredOrigin = (
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'
    ).trim();

    const allowedOrigins = new Set([
      configuredOrigin,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);

    return allowedOrigins.has(origin);
  }

  private handleConnection(socket: WebSocket): void {
    const clientCtx: ClientConnectionContext = {
      socket,
      sessionId: null,
    };
    this.clients.add(clientCtx);

    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      this.handleIncomingMessage(clientCtx, data, isBinary);
    });

    socket.on('close', () => {
      this.cleanupClientSession(clientCtx, false);
      this.clients.delete(clientCtx);
    });

    socket.on('error', (err: Error) => {
      this.logger.warn(`WebSocket client error: ${err.message}`);
      this.cleanupClientSession(clientCtx, false);
    });
  }

  private handleIncomingMessage(
    clientCtx: ClientConnectionContext,
    rawData: Buffer | ArrayBuffer | Buffer[],
    isBinary: boolean,
  ): void {
    const buffer = this.normalizeBuffer(rawData);

    // Binary WebSocket frame -> raw audio chunk
    if (isBinary) {
      if (!clientCtx.sessionId) {
        this.sendEvent(clientCtx.socket, {
          type: 'ERROR',
          payload: {
            code: 'SESSION_NOT_FOUND',
            message: 'Cannot stream audio before START_SESSION is initialized.',
          },
        });
        return;
      }

      this.metricsService.recordAudioEndpoint(clientCtx.sessionId, Date.now());
      this.audioService.processAudioChunk(
        clientCtx.sessionId,
        buffer,
        (code, message) => {
          this.sendEvent(clientCtx.socket, {
            type: 'ERROR',
            payload: { code, message },
          });
        },
      );
      return;
    }

    // Text frame -> JSON control message
    let parsed: any;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: 'INVALID_MESSAGE',
          message: 'Incoming WebSocket text frame must be valid JSON.',
        },
      });
      return;
    }

    if (!parsed || typeof parsed.type !== 'string') {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: 'INVALID_MESSAGE',
          message: 'WebSocket message is missing a valid "type" field.',
        },
      });
      return;
    }

    switch (parsed.type) {
      case 'START_SESSION':
        this.handleStartSession(clientCtx, parsed.payload);
        break;
      case 'SET_ANSWER_MODE':
        this.handleSetAnswerMode(clientCtx, parsed.payload);
        break;
      case 'AUDIO_CHUNK':
        this.handleJsonAudioChunk(clientCtx, parsed.payload);
        break;
      case 'SIMULATE_SPEECH':
        this.handleSimulatedSpeech(clientCtx, parsed.payload);
        break;
      case 'STOP_SESSION':
        this.cleanupClientSession(clientCtx, true);
        break;
      default:
        this.sendEvent(clientCtx.socket, {
          type: 'ERROR',
          payload: {
            code: 'INVALID_MESSAGE',
            message: `Unsupported WebSocket event type: "${String(parsed.type)}".`,
          },
        });
    }
  }

  private normalizeBuffer(rawData: Buffer | ArrayBuffer | Buffer[]): Buffer {
    if (Buffer.isBuffer(rawData)) {
      return rawData;
    }
    if (Array.isArray(rawData)) {
      return Buffer.concat(rawData);
    }
    return Buffer.from(rawData);
  }

  private handleStartSession(
    clientCtx: ClientConnectionContext,
    payload: unknown,
  ): void {
    if (clientCtx.sessionId) {
      this.cleanupClientSession(clientCtx, false);
    }

    const validation = this.sessionManager.validateStartPayload(payload);
    if (!validation.valid) {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: validation.errorCode ?? 'INVALID_CONTEXT',
          message: validation.errorMessage ?? 'Invalid session configuration.',
        },
      });
      return;
    }

    const startPayload = payload as StartSessionPayload;
    const formatValidation = this.audioService.validateAudioFormat(
      startPayload.mimeType,
      startPayload.sampleRate,
    );
    if (!formatValidation.valid) {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: formatValidation.errorCode ?? 'AUDIO_FORMAT_INVALID',
          message:
            formatValidation.errorMessage ?? 'Invalid audio format.',
        },
      });
      return;
    }

    const session = this.sessionManager.createSession(startPayload);
    const { sessionId } = session;
    clientCtx.sessionId = sessionId;

    session.audioState = 'listening';
    this.sendEvent(clientCtx.socket, {
      type: 'SESSION_READY',
      payload: {
        sessionId,
        timestamp: Date.now(),
      },
    });

    this.audioService.startAudioSession(
      sessionId,
      {
        mimeType: startPayload.mimeType,
        sampleRate: startPayload.sampleRate,
      },
      {
        onOpen: () => {
          const active = this.sessionManager.getSession(sessionId);
          if (active) {
            active.audioState = 'listening';
          }
        },
        onInterimTranscript: (text: string) => {
          this.sessionManager.updateInterimTranscript(sessionId, text);
          this.questionDetectionService.notifyInterimTranscript(sessionId);
          this.sendEvent(clientCtx.socket, {
            type: 'TRANSCRIPT_UPDATE',
            payload: { text, isFinal: false },
          });
        },
        onFinalTranscript: (text: string, speechFinal: boolean) => {
          this.handleFinalTranscriptEvent(
            clientCtx,
            sessionId,
            text,
            speechFinal,
          );
        },
        onUtteranceEnd: () => {
          this.questionDetectionService.handleUtteranceEnd(
            sessionId,
            (detected) => this.handleQuestionDetected(clientCtx, sessionId, detected),
          );
        },
        onError: (code: string, message: string) => {
          const active = this.sessionManager.getSession(sessionId);
          if (active) {
            active.audioState = 'error';
          }
          this.sendEvent(clientCtx.socket, {
            type: 'ERROR',
            payload: { code, message },
          });
        },
        onClose: () => {
          const active = this.sessionManager.getSession(sessionId);
          if (active) {
            active.audioState = 'stopped';
          }
        },
      },
    );
  }

  private handleJsonAudioChunk(
    clientCtx: ClientConnectionContext,
    payload: any,
  ): void {
    if (!clientCtx.sessionId) {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: 'SESSION_NOT_FOUND',
          message: 'Cannot stream audio before START_SESSION is initialized.',
        },
      });
      return;
    }

    if (!payload || typeof payload.data !== 'string') {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: 'AUDIO_FORMAT_INVALID',
          message: 'AUDIO_CHUNK JSON payload must contain base64 "data" string.',
        },
      });
      return;
    }

    const buffer = Buffer.from(payload.data, 'base64');
    this.metricsService.recordAudioEndpoint(clientCtx.sessionId, Date.now());
    this.audioService.processAudioChunk(
      clientCtx.sessionId,
      buffer,
      (code, message) => {
        this.sendEvent(clientCtx.socket, {
          type: 'ERROR',
          payload: { code, message },
        });
      },
    );
  }

  private handleSetAnswerMode(
    clientCtx: ClientConnectionContext,
    payload: any,
  ): void {
    if (!clientCtx.sessionId) {
      return;
    }
    this.sessionManager.setAnswerMode(
      clientCtx.sessionId,
      typeof payload?.answerMode === 'string' ? payload.answerMode : undefined,
    );
  }

  private handleSimulatedSpeech(
    clientCtx: ClientConnectionContext,
    payload: any,
  ): void {
    if (!clientCtx.sessionId) {
      this.sendEvent(clientCtx.socket, {
        type: 'ERROR',
        payload: {
          code: 'SESSION_NOT_FOUND',
          message: 'Start a session before simulating speech.',
        },
      });
      return;
    }

    if (typeof payload?.answerMode === 'string') {
      this.sessionManager.setAnswerMode(clientCtx.sessionId, payload.answerMode);
    }

    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (!text) return;

    const isFinal = payload?.isFinal !== false;
    const speechFinal = payload?.speechFinal !== false;

    if (!isFinal) {
      this.sessionManager.updateInterimTranscript(clientCtx.sessionId, text);
      this.questionDetectionService.notifyInterimTranscript(clientCtx.sessionId);
      this.sendEvent(clientCtx.socket, {
        type: 'TRANSCRIPT_UPDATE',
        payload: { text, isFinal: false },
      });
      return;
    }

    this.handleFinalTranscriptEvent(
      clientCtx,
      clientCtx.sessionId,
      text,
      speechFinal,
    );
  }

  private handleFinalTranscriptEvent(
    clientCtx: ClientConnectionContext,
    sessionId: string,
    text: string,
    speechFinal: boolean,
  ): void {
    const now = Date.now();
    this.metricsService.recordAudioEndpoint(sessionId, now);
    this.sessionManager.appendFinalTranscript(sessionId, text);

    this.sendEvent(clientCtx.socket, {
      type: 'TRANSCRIPT_FINAL',
      payload: { text, isFinal: true },
    });

    this.questionDetectionService.ingestFinalTranscript(
      sessionId,
      text,
      (detected) => this.handleQuestionDetected(clientCtx, sessionId, detected),
      { speechFinal, timestamp: now },
    );
  }

  private handleQuestionDetected(
    clientCtx: ClientConnectionContext,
    sessionId: string,
    detected: DetectedQuestionResult,
  ): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    const { questionId, question, audioEndpointAt, detectedAt } = detected;

    const recentHistory = session.detectedQuestions
      .filter((q) => q.completed && q.answer)
      .slice(-3)
      .map((q) => ({ question: q.question, answer: q.answer }));

    this.sessionManager.recordDetectedQuestion(
      sessionId,
      questionId,
      question,
      detectedAt,
    );
    this.metricsService.recordQuestionDetected(
      sessionId,
      questionId,
      audioEndpointAt,
      detectedAt,
    );

    this.sendEvent(clientCtx.socket, {
      type: 'QUESTION_DETECTED',
      payload: {
        questionId,
        question,
      },
    });

    const abortController = new AbortController();
    this.sessionManager.setActiveAnswerGeneration(sessionId, {
      questionId,
      question,
      startedAt: Date.now(),
      abortController,
    });

    let firstTokenRecorded = false;

    void this.answerGenerationService.generateStreamingAnswer(
      {
        resume: session.resume,
        jobDescription: session.jobDescription,
        question,
        answerMode: session.answerMode,
        recentHistory,
      },
      {
        onStart: () => {
          this.metricsService.recordLlmRequestStart(sessionId, questionId);
          this.sendEvent(clientCtx.socket, {
            type: 'ANSWER_START',
            payload: { questionId },
          });
        },
        onChunk: (chunkText: string) => {
          if (abortController.signal.aborted) return;
          if (!firstTokenRecorded) {
            firstTokenRecorded = true;
            this.metricsService.recordFirstToken(sessionId, questionId);
          }
          this.sessionManager.appendAnswerChunk(sessionId, questionId, chunkText);
          this.sendEvent(clientCtx.socket, {
            type: 'ANSWER_CHUNK',
            payload: {
              questionId,
              text: chunkText,
            },
          });
        },
        onComplete: (_fullAnswer: string, durationMs: number) => {
          if (abortController.signal.aborted) return;
          this.sessionManager.completeQuestionAnswer(sessionId, questionId);

          this.sendEvent(clientCtx.socket, {
            type: 'ANSWER_COMPLETE',
            payload: {
              questionId,
              durationMs,
            },
          });

          const latencyMetrics = this.metricsService.recordGenerationComplete(
            sessionId,
            questionId,
          );
          session.latestLatencyMetrics = latencyMetrics;

          this.sendEvent(clientCtx.socket, {
            type: 'LATENCY_METRICS',
            payload: {
              questionId: latencyMetrics.questionId,
              questionDetectionMs: latencyMetrics.questionDetectionMs,
              timeToFirstTokenMs: latencyMetrics.timeToFirstTokenMs,
              totalGenerationMs: latencyMetrics.totalGenerationMs,
              endToEndLatencyMs: latencyMetrics.endToEndLatencyMs,
            },
          });
        },
        onError: (code: string, message: string) => {
          if (abortController.signal.aborted) return;
          this.sessionManager.setActiveAnswerGeneration(sessionId, null);
          this.sendEvent(clientCtx.socket, {
            type: 'ERROR',
            payload: { code, message },
          });
        },
      },
      abortController.signal,
    );
  }

  private cleanupClientSession(
    clientCtx: ClientConnectionContext,
    emitStoppedEvent: boolean,
  ): void {
    const sessionId = clientCtx.sessionId;
    if (sessionId) {
      this.audioService.stopAudioSession(sessionId);
      this.questionDetectionService.clearSession(sessionId);
      this.metricsService.clearSession(sessionId);
      this.sessionManager.destroySession(sessionId);
      clientCtx.sessionId = null;
    }

    if (emitStoppedEvent) {
      this.sendEvent(clientCtx.socket, {
        type: 'SESSION_STOPPED',
        payload: sessionId ? { sessionId } : undefined,
      });
    }
  }

  private sendEvent(socket: WebSocket, event: ServerToClientEvent): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  onModuleDestroy(): void {
    for (const clientCtx of this.clients) {
      this.cleanupClientSession(clientCtx, false);
      try {
        clientCtx.socket.close();
      } catch {
        // ignore close errors
      }
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
