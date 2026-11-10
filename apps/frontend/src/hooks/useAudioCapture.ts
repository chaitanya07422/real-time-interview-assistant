'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioInputMode } from '../types/interview';

export interface StartAudioCaptureOptions {
  mode: AudioInputMode;
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onStreamInterrupted: (reason: string) => void;
}

export interface AudioCaptureMetadata {
  mimeType: string;
  sampleRate?: number;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function detectSupportedAudioMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function useAudioCapture() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeMimeType, setActiveMimeType] = useState<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const stopCapture = useCallback(() => {
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // ignore stop errors
      }
      recorderRef.current = null;
    }

    for (const ref of [mediaStreamRef, displayStreamRef]) {
      if (ref.current) {
        ref.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        ref.current = null;
      }
    }

    setIsCapturing(false);
  }, []);

  const startCapture = useCallback(
    async (options: StartAudioCaptureOptions): Promise<AudioCaptureMetadata> => {
      stopCapture();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof MediaRecorder === 'undefined'
      ) {
        throw new Error(
          'Browser audio capture APIs (MediaDevices / MediaRecorder) are not supported.',
        );
      }

      let rawStream: MediaStream;
      try {
        if (options.mode === 'tab') {
          rawStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          displayStreamRef.current = rawStream;
        } else {
          rawStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        }
      } catch (err: unknown) {
        const domErr = err as { name?: string; message?: string };
        if (
          domErr?.name === 'NotAllowedError' ||
          domErr?.name === 'PermissionDeniedError'
        ) {
          throw new Error(
            options.mode === 'tab'
              ? 'Screen/tab sharing permission was denied. Please grant permission and check "Share tab audio".'
              : 'Microphone permission was denied. Please allow microphone access in browser settings.',
          );
        }
        throw new Error(domErr?.message || 'Failed to access audio input device.');
      }

      const audioTracks = rawStream.getAudioTracks();
      if (audioTracks.length === 0) {
        rawStream.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
        throw new Error(
          options.mode === 'tab'
            ? 'No audio track was shared from the browser tab. Please enable "Share tab audio".'
            : 'No audio track is available from the selected microphone.',
        );
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      mediaStreamRef.current = audioOnlyStream;

      const primaryAudioTrack = audioTracks[0];
      const trackSettings = primaryAudioTrack.getSettings?.() ?? {};

      const handleTrackEnded = () => {
        stopCapture();
        options.onStreamInterrupted(
          options.mode === 'tab'
            ? 'Browser tab audio sharing was stopped.'
            : 'Microphone audio track was disconnected.',
        );
      };

      primaryAudioTrack.onended = handleTrackEnded;
      if (options.mode === 'tab') {
        const videoTrack = rawStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.onended = handleTrackEnded;
      }

      const preferredMime = detectSupportedAudioMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(audioOnlyStream, { mimeType: preferredMime })
        : new MediaRecorder(audioOnlyStream);

      const actualMimeType = recorder.mimeType || preferredMime || 'audio/webm';
      setActiveMimeType(actualMimeType);

      recorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          try {
            const buffer = await event.data.arrayBuffer();
            options.onAudioChunk(buffer);
          } catch {
            // ignore conversion error
          }
        }
      };

      recorder.onerror = () => {
        stopCapture();
        options.onStreamInterrupted('MediaRecorder encountered an encoding error.');
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setIsCapturing(true);

      return {
        mimeType: actualMimeType,
        sampleRate:
          typeof trackSettings.sampleRate === 'number'
            ? trackSettings.sampleRate
            : undefined,
      };
    },
    [stopCapture],
  );

  useEffect(() => () => stopCapture(), [stopCapture]);

  return { isCapturing, activeMimeType, startCapture, stopCapture };
}
