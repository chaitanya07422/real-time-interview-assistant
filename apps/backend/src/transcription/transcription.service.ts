import { Injectable, Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';
import WebSocket from 'ws';

export interface TranscriptionStreamCallbacks {
  onOpen?: () => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string, speechFinal: boolean) => void;
  onUtteranceEnd: () => void;
  onError: (code: string, message: string) => void;
  onClose?: () => void;
}

export interface TranscriptionSessionOptions {
  mimeType?: string;
  sampleRate?: number;
}

interface ActiveDeepgramStream {
  socket: WebSocket;
  options: TranscriptionSessionOptions;
  callbacks: TranscriptionStreamCallbacks;
  activeModel: string;
  isOpen: boolean;
  isClosed: boolean;
  initHeaderChunk: Buffer | null;
  pendingChunks: Buffer[];
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  keepAliveTimer: NodeJS.Timeout | null;
  connectTimeoutTimer: NodeJS.Timeout | null;
}

const MAX_PENDING_CHUNKS = 60;
const CONNECT_TIMEOUT_MS = 10_000;
const KEEP_ALIVE_INTERVAL_MS = 8_000;
const MAX_STT_RECONNECT_ATTEMPTS = 2;
const STT_RECONNECT_BASE_MS = 500;
const DEFAULT_DEEPGRAM_MODEL = 'nova-3';
const FALLBACK_DEEPGRAM_MODEL = 'nova-2';
const DEEPGRAM_WS_ENDPOINT = 'wss://api.deepgram.com/v1/listen';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly streams = new Map<string, ActiveDeepgramStream>();

  private getApiKey(): string {
    return (process.env.DEEPGRAM_API_KEY ?? '').trim();
  }

  private getModelName(): string {
    const raw = (process.env.DEEPGRAM_MODEL ?? DEFAULT_DEEPGRAM_MODEL).trim();
    return raw || DEFAULT_DEEPGRAM_MODEL;
  }

  private buildDeepgramUrl(
    options: TranscriptionSessionOptions,
    modelOverride?: string,
  ): string {
    const model = modelOverride ?? this.getModelName();
    const params = new URLSearchParams({
      model,
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      numerals: 'true',
      interim_results: 'true',
      endpointing: '600',
      utterance_end_ms: '1200',
      vad_events: 'true',
    });

    const mime = (options.mimeType ?? '').toLowerCase();
    if (
      mime.includes('pcm') ||
      mime.includes('linear16') ||
      mime.includes('raw')
    ) {
      params.set('encoding', 'linear16');
      params.set('sample_rate', String(options.sampleRate ?? 16000));
      params.set('channels', '1');
    }

    return `${DEEPGRAM_WS_ENDPOINT}?${params.toString()}`;
  }

  startStream(
    sessionId: string,
    options: TranscriptionSessionOptions,
    callbacks: TranscriptionStreamCallbacks,
  ): boolean {
    this.stopStream(sessionId);

    const apiKey = this.getApiKey();
    if (!apiKey || apiKey === 'your_deepgram_api_key') {
      callbacks.onError(
        'STT_AUTH_FAILED',
        'Deepgram API key is missing or uses placeholder value (DEEPGRAM_API_KEY).',
      );
      return false;
    }

    try {
      const activeModel = this.getModelName();
      const url = this.buildDeepgramUrl(options, activeModel);
      const socket = new WebSocket(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      const streamState: ActiveDeepgramStream = {
        socket,
        options,
        callbacks,
        activeModel,
        isOpen: false,
        isClosed: false,
        initHeaderChunk: null,
        pendingChunks: [],
        reconnectAttempts: 0,
        reconnectTimer: null,
        keepAliveTimer: null,
        connectTimeoutTimer: null,
      };

      this.streams.set(sessionId, streamState);
      this.startConnectTimeout(sessionId, streamState);
      this.attachDeepgramListeners(sessionId, streamState);
      return true;
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Failed to initialize Deepgram client';
      this.logger.error(`Deepgram init error (${sessionId}): ${msg}`);
      callbacks.onError('STT_CONNECTION_FAILED', msg);
      return false;
    }
  }

  private startConnectTimeout(
    sessionId: string,
    streamState: ActiveDeepgramStream,
  ): void {
    this.clearStreamTimers(streamState);
    streamState.connectTimeoutTimer = setTimeout(() => {
      if (!streamState.isOpen && !streamState.isClosed) {
        this.logger.error(`Deepgram connection timeout for session ${sessionId}`);
        streamState.callbacks.onError(
          'STT_CONNECTION_FAILED',
          'Timed out establishing streaming connection to Deepgram STT.',
        );
        this.stopStream(sessionId);
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private clearStreamTimers(streamState: ActiveDeepgramStream): void {
    if (streamState.connectTimeoutTimer) {
      clearTimeout(streamState.connectTimeoutTimer);
      streamState.connectTimeoutTimer = null;
    }
    if (streamState.keepAliveTimer) {
      clearInterval(streamState.keepAliveTimer);
      streamState.keepAliveTimer = null;
    }
    if (streamState.reconnectTimer) {
      clearTimeout(streamState.reconnectTimer);
      streamState.reconnectTimer = null;
    }
  }

  private attachDeepgramListeners(
    sessionId: string,
    streamState: ActiveDeepgramStream,
  ): void {
    const { socket, callbacks } = streamState;

    socket.on('open', () => {
      if (streamState.isClosed || streamState.socket !== socket) return;
      streamState.isOpen = true;
      streamState.reconnectAttempts = 0;

      if (streamState.connectTimeoutTimer) {
        clearTimeout(streamState.connectTimeoutTimer);
        streamState.connectTimeoutTimer = null;
      }

      this.logger.log(`Deepgram stream opened for session ${sessionId}`);

      while (streamState.pendingChunks.length > 0) {
        const chunk = streamState.pendingChunks.shift();
        if (chunk) {
          this.sendToDeepgramSocket(socket, chunk);
        }
      }

      streamState.keepAliveTimer = setInterval(() => {
        if (
          streamState.isOpen &&
          !streamState.isClosed &&
          streamState.socket === socket &&
          socket.readyState === WebSocket.OPEN
        ) {
          try {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
          } catch {
            // ignore keepAlive errors on closing sockets
          }
        }
      }, KEEP_ALIVE_INTERVAL_MS);

      callbacks.onOpen?.();
    });

    socket.on('message', (raw: WebSocket.RawData) => {
      if (streamState.isClosed || streamState.socket !== socket) return;
      try {
        const data = JSON.parse(raw.toString());
        if (data?.type === 'Results' || data?.channel) {
          const transcript: string =
            data?.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
          if (!transcript) {
            return;
          }

          const isFinal = Boolean(data?.is_final);
          const speechFinal = Boolean(data?.speech_final);

          if (isFinal) {
            callbacks.onFinalTranscript(transcript, speechFinal);
          } else {
            callbacks.onInterimTranscript(transcript);
          }
        } else if (data?.type === 'UtteranceEnd') {
          callbacks.onUtteranceEnd();
        } else if (data?.type === 'Error') {
          const errDesc =
            data?.description ||
            data?.message ||
            'Deepgram reported a stream processing error.';
          this.logger.error(
            `Deepgram Error frame for session ${sessionId}: ${String(errDesc)}`,
          );
          callbacks.onError('STT_STREAM_ERROR', String(errDesc));
        }
      } catch {
        // ignore non-JSON frames
      }
    });

    socket.on(
      'unexpected-response',
      (_req: unknown, res: IncomingMessage) => {
        if (streamState.isClosed || streamState.socket !== socket) return;
        const status = res.statusCode ?? 0;

        if (
          (status === 400 || status === 403) &&
          streamState.activeModel !== FALLBACK_DEEPGRAM_MODEL
        ) {
          this.logger.warn(
            `Deepgram rejected model "${streamState.activeModel}" (HTTP ${status}) for session ${sessionId}; falling back to "${FALLBACK_DEEPGRAM_MODEL}".`,
          );
          streamState.activeModel = FALLBACK_DEEPGRAM_MODEL;
          try {
            socket.close();
          } catch {
            // ignore
          }
          const fallbackUrl = this.buildDeepgramUrl(
            streamState.options,
            FALLBACK_DEEPGRAM_MODEL,
          );
          const fallbackSocket = new WebSocket(fallbackUrl, {
            headers: {
              Authorization: `Token ${this.getApiKey()}`,
            },
          });
          streamState.socket = fallbackSocket;
          this.startConnectTimeout(sessionId, streamState);
          this.attachDeepgramListeners(sessionId, streamState);
          return;
        }

        const code =
          status === 401 || status === 403
            ? 'STT_AUTH_FAILED'
            : 'STT_CONNECTION_FAILED';
        callbacks.onError(
          code,
          `Deepgram rejected WebSocket handshake with HTTP status ${status}.`,
        );
        this.stopStream(sessionId);
      },
    );

    socket.on('error', (err: Error) => {
      if (streamState.isClosed || streamState.socket !== socket) return;
      const errMsg =
        err?.message || 'Deepgram speech recognition stream error.';
      this.logger.error(`Deepgram error for session ${sessionId}: ${errMsg}`);

      const lower = String(errMsg).toLowerCase();
      const code =
        lower.includes('401') ||
        lower.includes('403') ||
        lower.includes('invalid') ||
        lower.includes('credentials')
          ? 'STT_AUTH_FAILED'
          : 'STT_STREAM_ERROR';

      if (code === 'STT_AUTH_FAILED') {
        callbacks.onError(code, String(errMsg));
        this.stopStream(sessionId);
      }
    });

    socket.on('close', () => {
      if (streamState.isClosed || streamState.socket !== socket) return;
      streamState.isOpen = false;
      this.clearStreamTimers(streamState);
      this.logger.warn(
        `Deepgram stream closed unexpectedly for session ${sessionId}`,
      );
      this.attemptReconnect(sessionId, streamState);
    });
  }

  private attemptReconnect(
    sessionId: string,
    streamState: ActiveDeepgramStream,
  ): void {
    if (streamState.isClosed) return;

    if (streamState.reconnectAttempts < MAX_STT_RECONNECT_ATTEMPTS) {
      streamState.reconnectAttempts += 1;
      const delayMs =
        STT_RECONNECT_BASE_MS * Math.pow(2, streamState.reconnectAttempts - 1);
      this.logger.log(
        `Reconnecting Deepgram stream for session ${sessionId} (attempt ${streamState.reconnectAttempts}/${MAX_STT_RECONNECT_ATTEMPTS}) in ${delayMs}ms`,
      );

      streamState.reconnectTimer = setTimeout(() => {
        if (streamState.isClosed) return;
        try {
          const url = this.buildDeepgramUrl(
            streamState.options,
            streamState.activeModel,
          );
          const newSocket = new WebSocket(url, {
            headers: {
              Authorization: `Token ${this.getApiKey()}`,
            },
          });
          streamState.socket = newSocket;
          if (
            streamState.initHeaderChunk &&
            streamState.pendingChunks[0] !== streamState.initHeaderChunk
          ) {
            streamState.pendingChunks.unshift(streamState.initHeaderChunk);
          }
          this.startConnectTimeout(sessionId, streamState);
          this.attachDeepgramListeners(sessionId, streamState);
        } catch {
          this.attemptReconnect(sessionId, streamState);
        }
      }, delayMs);
      return;
    }

    streamState.callbacks.onError(
      'STT_STREAM_ERROR',
      'Speech-to-text stream disconnected unexpectedly. Please restart listening.',
    );
    streamState.callbacks.onClose?.();
    this.stopStream(sessionId);
  }

  forwardAudioChunk(
    sessionId: string,
    chunk: Buffer,
    onError?: (code: string, message: string) => void,
  ): boolean {
    const streamState = this.streams.get(sessionId);
    if (!streamState || streamState.isClosed) {
      return false;
    }

    if (!streamState.initHeaderChunk) {
      streamState.initHeaderChunk = chunk;
    }

    if (streamState.isOpen) {
      return this.sendToDeepgramSocket(streamState.socket, chunk);
    }

    if (streamState.pendingChunks.length >= MAX_PENDING_CHUNKS) {
      onError?.(
        'AUDIO_BUFFER_OVERFLOW',
        'Audio buffer limit reached while waiting for STT stream connection.',
      );
      return false;
    }

    streamState.pendingChunks.push(chunk);
    return true;
  }

  private sendToDeepgramSocket(socket: WebSocket, chunk: Buffer): boolean {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(chunk);
        return true;
      }
      return false;
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to send audio chunk to Deepgram: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return false;
    }
  }

  stopStream(sessionId: string): void {
    const streamState = this.streams.get(sessionId);
    if (!streamState) {
      return;
    }

    streamState.isClosed = true;
    streamState.isOpen = false;
    streamState.initHeaderChunk = null;
    streamState.pendingChunks = [];

    this.clearStreamTimers(streamState);

    try {
      if (streamState.socket.readyState === WebSocket.OPEN) {
        streamState.socket.send(JSON.stringify({ type: 'CloseStream' }));
      }
      streamState.socket.close();
    } catch {
      // Ignore close errors when socket is already closed
    }

    this.streams.delete(sessionId);
  }
}
