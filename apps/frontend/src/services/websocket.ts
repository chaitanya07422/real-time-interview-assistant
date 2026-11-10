import { AudioInputMode, LatencyMetrics } from '../types/interview';

export interface StartSessionMessagePayload {
  resume: string;
  jobDescription: string;
  audioMode: AudioInputMode;
  mimeType?: string;
  sampleRate?: number;
}

export type BackendSocketEvent =
  | { type: 'SESSION_READY'; payload?: { sessionId: string; timestamp: number } }
  | { type: 'TRANSCRIPT_UPDATE'; payload: { text: string; isFinal: false } }
  | { type: 'TRANSCRIPT_FINAL'; payload: { text: string; isFinal: true } }
  | {
      type: 'QUESTION_DETECTED';
      payload: { questionId: string; question: string };
    }
  | { type: 'ANSWER_START'; payload: { questionId: string } }
  | {
      type: 'ANSWER_CHUNK';
      payload: { questionId: string; text: string };
    }
  | {
      type: 'ANSWER_COMPLETE';
      payload: { questionId: string; durationMs: number };
    }
  | { type: 'LATENCY_METRICS'; payload: LatencyMetrics }
  | { type: 'ERROR'; payload: { code: string; message: string } }
  | { type: 'SESSION_STOPPED'; payload?: { sessionId?: string } };

export interface WebSocketCallbacks {
  onOpen?: () => void;
  onEvent: (event: BackendSocketEvent) => void;
  onDisconnect: (recoverable: boolean, attempt: number, maxAttempts: number) => void;
  onReconnected?: () => void;
  onError: (code: string, message: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

export class InterviewWebSocketService {
  private socket: WebSocket | null = null;
  private readonly wsUrl: string;
  private callbacks: WebSocketCallbacks | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(wsUrl?: string) {
    this.wsUrl =
      wsUrl ||
      process.env.NEXT_PUBLIC_BACKEND_WS_URL ||
      'ws://localhost:4000';
  }

  connect(callbacks: WebSocketCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.intentionalClose = false;
    this.clearReconnectTimer();

    return new Promise((resolve, reject) => {
      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        const ws = new WebSocket(this.wsUrl);
        ws.binaryType = 'arraybuffer';
        this.socket = ws;

        let settled = false;

        ws.onopen = () => {
          const wasReconnecting = this.reconnectAttempts > 0;
          this.reconnectAttempts = 0;
          if (!settled) {
            settled = true;
            resolve();
          }
          if (wasReconnecting) {
            this.callbacks?.onReconnected?.();
          } else {
            this.callbacks?.onOpen?.();
          }
        };

        ws.onmessage = (msgEvent: MessageEvent) => {
          if (typeof msgEvent.data !== 'string') return;
          try {
            const parsed = JSON.parse(msgEvent.data) as BackendSocketEvent;
            this.callbacks?.onEvent(parsed);
          } catch {
            this.callbacks?.onError(
              'INVALID_SERVER_MESSAGE',
              'Received malformed message from server.',
            );
          }
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `Unable to connect to backend WebSocket at ${this.wsUrl}. Ensure the backend server is running.`,
              ),
            );
          }
        };

        ws.onclose = () => {
          if (this.intentionalClose) {
            return;
          }
          this.handleUnexpectedClose();
        };
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new Error('Failed to initialize WebSocket connection.'),
        );
      }
    });
  }

  private handleUnexpectedClose(): void {
    if (this.intentionalClose) return;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts += 1;
      const delay = BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempts - 1);
      this.callbacks?.onDisconnect(
        true,
        this.reconnectAttempts,
        MAX_RECONNECT_ATTEMPTS,
      );

      this.reconnectTimer = setTimeout(() => {
        if (this.callbacks && !this.intentionalClose) {
          this.connect(this.callbacks).catch(() => {
            // Subsequent close/error triggers next backoff step until max attempts
          });
        }
      }, delay);
    } else {
      this.callbacks?.onDisconnect(
        false,
        this.reconnectAttempts,
        MAX_RECONNECT_ATTEMPTS,
      );
    }
  }

  sendStartSession(payload: StartSessionMessagePayload): void {
    this.sendJson({
      type: 'START_SESSION',
      payload,
    });
  }

  sendAudioChunk(chunk: ArrayBuffer): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    }
  }

  sendSimulatedSpeech(
    text: string,
    isFinal = true,
    speechFinal = true,
  ): void {
    this.sendJson({
      type: 'SIMULATE_SPEECH',
      payload: { text, isFinal, speechFinal },
    });
  }

  sendStopSession(): void {
    this.sendJson({
      type: 'STOP_SESSION',
    });
  }

  private sendJson(data: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close errors
      }
      this.socket = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
