import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  INTERVIEW_SYSTEM_PROMPT,
  PromptContextInput,
  buildUserPrompt,
} from './prompt.builder';

export interface StreamAnswerCallbacks {
  onStart?: () => void;
  onChunk: (chunkText: string) => void;
  onComplete: (fullAnswer: string, durationMs: number) => void;
  onError: (code: string, message: string) => void;
}

@Injectable()
export class AnswerGenerationService {
  private readonly logger = new Logger(AnswerGenerationService.name);

  private getApiKey(): string {
    return (process.env.GEMINI_API_KEY ?? '').trim();
  }

  private getModelName(): string {
    const raw = (process.env.GEMINI_MODEL ?? 'gemini-2.5-flash').trim();
    if (!raw || raw === 'your_supported_gemini_model') {
      return 'gemini-2.5-flash';
    }
    return raw;
  }

  async generateStreamingAnswer(
    input: PromptContextInput,
    callbacks: StreamAnswerCallbacks,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey || apiKey === 'your_gemini_api_key') {
      callbacks.onError(
        'LLM_CONFIG_ERROR',
        'Gemini API key is missing or not configured on the backend (GEMINI_API_KEY).',
      );
      return;
    }

    const model = this.getModelName();
    const userPrompt = buildUserPrompt(input);
    const startedAt = Date.now();
    let fullAnswer = '';

    if (abortSignal?.aborted) {
      return;
    }

    callbacks.onStart?.();

    try {
      const ai = new GoogleGenAI({ apiKey });
      const isGemini25 = model.includes('2.5');
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        config: {
          systemInstruction: INTERVIEW_SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: 320,
          ...(isGemini25 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          abortSignal,
        },
      });

      for await (const chunk of responseStream) {
        if (abortSignal?.aborted) {
          this.logger.debug('Answer generation aborted mid-stream.');
          return;
        }

        const text = chunk.text ?? '';
        if (text) {
          fullAnswer += text;
          callbacks.onChunk(text);
        }
      }

      if (abortSignal?.aborted) {
        return;
      }

      const durationMs = Math.max(0, Date.now() - startedAt);
      callbacks.onComplete(fullAnswer.trim(), durationMs);
    } catch (error: unknown) {
      if (abortSignal?.aborted) {
        return;
      }

      const errMessage =
        error instanceof Error ? error.message : 'Unknown Gemini API error';
      this.logger.error(`Gemini streaming error: ${errMessage}`);

      const lower = errMessage.toLowerCase();
      if (
        lower.includes('429') ||
        lower.includes('quota') ||
        lower.includes('rate limit') ||
        lower.includes('resource_exhausted')
      ) {
        callbacks.onError(
          'LLM_RATE_LIMITED',
          'Gemini API rate limit or quota exceeded. Please wait briefly and try again.',
        );
        return;
      }

      if (
        lower.includes('api_key_invalid') ||
        lower.includes('api key not valid') ||
        lower.includes('401') ||
        lower.includes('403') ||
        lower.includes('permission_denied')
      ) {
        callbacks.onError(
          'LLM_CONFIG_ERROR',
          'Invalid Gemini API key or unauthorized model access.',
        );
        return;
      }

      callbacks.onError(
        'LLM_GENERATION_FAILED',
        `Failed to generate interview answer: ${errMessage}`,
      );
    }
  }
}
