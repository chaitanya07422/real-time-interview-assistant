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
  isOpen: boolean;
  isClosed: boolean;
  pendingChunks: Buffer[];
  keepAliveTimer: NodeJS.Timeout | null;
  connectTimeoutTimer: NodeJS.Timeout | null;
}

const MAX_PENDING_CHUNKS = 60;
const CONNECT_TIMEOUT_MS = 10_000;
const KEEP_ALIVE_INTERVAL_MS = 8_000;
const DEEPGRAM_WS_ENDPOINT = 'wss://api.deepgram.com/v1/listen';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly streams = new Map<string, ActiveDeepgramStream>();

  private getApiKey(): string {
    return (process.env.DEEPGRAM_API_KEY ?? '').trim();
  }

  private buildDeepgramUrl(options: TranscriptionSessionOptions): string {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
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
      const url = this.buildDeepgramUrl(options);
      const socket = new WebSocket(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      const streamState: ActiveDeepgramStream = {
        socket,
        isOpen: false,
        isClosed: false,
        pendingChunks: [],
        keepAliveTimer: null,
        connectTimeoutTimer: null,
      };

      this.streams.set(sessionId, streamState);

      streamState.connectTimeoutTimer = setTimeout(() => {
        if (!streamState.isOpen && !streamState.isClosed) {
          this.logger.error(`Deepgram connection timeout for session ${sessionId}`);
          callbacks.onError(
            'STT_CONNECTION_FAILED',
            'Timed out establishing streaming connection to Deepgram STT.',
          );
          this.stopStream(sessionId);
        }
      }, CONNECT_TIMEOUT_MS);

      this.attachDeepgramListeners(sessionId, streamState, callbacks);
      return true;
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Failed to initialize Deepgram client';
      this.logger.error(`Deepgram init error (${sessionId}): ${msg}`);
      callbacks.onError('STT_CONNECTION_FAILED', msg);
      return false;
    }
  }

  private attachDeepgramListeners(
    sessionId: string,
    streamState: ActiveDeepgramStream,
    callbacks: TranscriptionStreamCallbacks,
  ): void {
    const { socket } = streamState;

    socket.on('open', () => {
      if (streamState.isClosed) return;
      streamState.isOpen = true;

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
      if (streamState.isClosed) return;
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
        }
      } catch {
        // ignore non-JSON frames
      }
    });

    socket.on(
      'unexpected-response',
      (_req: unknown, res: IncomingMessage) => {
        if (streamState.isClosed) return;
        const status = res.statusCode ?? 0;
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
      if (streamState.isClosed) return;
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

      callbacks.onError(code, String(errMsg));
    });

    socket.on('close', () => {
      if (streamState.isClosed) return;
      this.logger.log(`Deepgram stream closed for session ${sessionId}`);
      callbacks.onClose?.();
    });
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
    streamState.pendingChunks = [];

    if (streamState.connectTimeoutTimer) {
      clearTimeout(streamState.connectTimeoutTimer);
      streamState.connectTimeoutTimer = null;
    }

    if (streamState.keepAliveTimer) {
      clearInterval(streamState.keepAliveTimer);
      streamState.keepAliveTimer = null;
    }

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
