import { Injectable, Logger } from '@nestjs/common';
import {
  TranscriptionService,
  TranscriptionSessionOptions,
  TranscriptionStreamCallbacks,
} from '../transcription/transcription.service';

const SUPPORTED_MIME_PREFIXES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
  'audio/pcm',
  'audio/l16',
  'audio/linear16',
];

const MAX_AUDIO_CHUNK_BYTES = 512 * 1024; // 512 KB per chunk safety cap

export interface AudioValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private readonly activeAudioSessions = new Set<string>();

  constructor(private readonly transcriptionService: TranscriptionService) {}

  validateAudioFormat(mimeType?: string, sampleRate?: number): AudioValidationResult {
    if (mimeType) {
      const normalized = mimeType.toLowerCase().trim();
      const isSupported = SUPPORTED_MIME_PREFIXES.some((prefix) =>
        normalized.startsWith(prefix),
      );
      if (!isSupported) {
        return {
          valid: false,
          errorCode: 'AUDIO_FORMAT_INVALID',
          errorMessage: `Unsupported audio MIME type "${mimeType}". Supported formats include audio/webm, audio/ogg, audio/mp4, audio/wav, and audio/pcm.`,
        };
      }
    }

    if (
      sampleRate !== undefined &&
      (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    ) {
      return {
        valid: false,
        errorCode: 'AUDIO_FORMAT_INVALID',
        errorMessage: `Invalid audio sample rate: ${String(sampleRate)} Hz. Expected between 8000 and 96000 Hz.`,
      };
    }

    return { valid: true };
  }

  startAudioSession(
    sessionId: string,
    options: TranscriptionSessionOptions,
    callbacks: TranscriptionStreamCallbacks,
  ): boolean {
    const validation = this.validateAudioFormat(
      options.mimeType,
      options.sampleRate,
    );
    if (!validation.valid) {
      callbacks.onError(
        validation.errorCode ?? 'AUDIO_FORMAT_INVALID',
        validation.errorMessage ?? 'Invalid audio format.',
      );
      return false;
    }

    this.activeAudioSessions.add(sessionId);
    return this.transcriptionService.startStream(sessionId, options, callbacks);
  }

  processAudioChunk(
    sessionId: string,
    chunk: Buffer,
    onError?: (code: string, message: string) => void,
  ): boolean {
    if (!this.activeAudioSessions.has(sessionId)) {
      return false;
    }

    if (!Buffer.isBuffer(chunk) || chunk.byteLength === 0) {
      return false;
    }

    if (chunk.byteLength > MAX_AUDIO_CHUNK_BYTES) {
      this.logger.warn(
        `Rejected oversized audio chunk (${chunk.byteLength} bytes) for session ${sessionId}`,
      );
      onError?.(
        'AUDIO_FORMAT_INVALID',
        `Audio chunk size (${chunk.byteLength} bytes) exceeds maximum allowed limit (${MAX_AUDIO_CHUNK_BYTES} bytes).`,
      );
      return false;
    }

    return this.transcriptionService.forwardAudioChunk(
      sessionId,
      chunk,
      onError,
    );
  }

  stopAudioSession(sessionId: string): void {
    this.activeAudioSessions.delete(sessionId);
    this.transcriptionService.stopStream(sessionId);
  }
}
