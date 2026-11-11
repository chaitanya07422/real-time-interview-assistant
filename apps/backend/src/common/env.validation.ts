import { Logger } from '@nestjs/common';

export interface ValidatedEnvConfig {
  PORT: number;
  FRONTEND_ORIGIN: string;
  DEEPGRAM_API_KEY: string;
  DEEPGRAM_MODEL: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  QUESTION_SILENCE_THRESHOLD_MS: number;
}

const logger = new Logger('EnvValidation');

export function validateEnvironment(
  config: Record<string, unknown>,
): ValidatedEnvConfig {
  const rawPort = config.PORT ?? process.env.PORT ?? '4000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT environment variable: "${String(rawPort)}"`);
  }

  const frontendOrigin = String(
    config.FRONTEND_ORIGIN ??
      process.env.FRONTEND_ORIGIN ??
      'http://localhost:3000',
  ).trim();
  if (!frontendOrigin) {
    throw new Error('FRONTEND_ORIGIN must be a non-empty URL string.');
  }

  const deepgramApiKey = String(
    config.DEEPGRAM_API_KEY ?? process.env.DEEPGRAM_API_KEY ?? '',
  ).trim();
  if (
    !deepgramApiKey ||
    deepgramApiKey === 'your_deepgram_api_key'
  ) {
    logger.warn(
      'DEEPGRAM_API_KEY is not configured or uses placeholder value. Live Deepgram STT connections will report STT_CONNECTION_FAILED until a valid key is provided.',
    );
  }

  const deepgramModel = String(
    config.DEEPGRAM_MODEL ?? process.env.DEEPGRAM_MODEL ?? 'nova-3',
  ).trim();

  const geminiApiKey = String(
    config.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '',
  ).trim();
  if (!geminiApiKey || geminiApiKey === 'your_gemini_api_key') {
    logger.warn(
      'GEMINI_API_KEY is not configured or uses placeholder value. Live Gemini calls will report LLM_CONFIG_ERROR until a valid key is provided.',
    );
  }

  const geminiModel = String(
    config.GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  ).trim();
  if (!geminiModel || geminiModel === 'your_supported_gemini_model') {
    logger.warn(
      'GEMINI_MODEL uses placeholder value; defaulting to "gemini-2.5-flash".',
    );
  }

  const rawSilenceMs =
    config.QUESTION_SILENCE_THRESHOLD_MS ??
    process.env.QUESTION_SILENCE_THRESHOLD_MS ??
    '900';
  const silenceMs = Number(rawSilenceMs);
  const validatedSilenceMs =
    Number.isFinite(silenceMs) && silenceMs >= 200 && silenceMs <= 5000
      ? silenceMs
      : 900;

  return {
    PORT: port,
    FRONTEND_ORIGIN: frontendOrigin,
    DEEPGRAM_API_KEY: deepgramApiKey,
    DEEPGRAM_MODEL: deepgramModel || 'nova-3',
    GEMINI_API_KEY: geminiApiKey,
    GEMINI_MODEL:
      !geminiModel || geminiModel === 'your_supported_gemini_model'
        ? 'gemini-2.5-flash'
        : geminiModel,
    QUESTION_SILENCE_THRESHOLD_MS: validatedSilenceMs,
  };
}
