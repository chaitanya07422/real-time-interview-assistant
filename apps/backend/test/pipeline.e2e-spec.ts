import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import WebSocket from 'ws';
import { AnswerGenerationService } from '../src/answer-generation/answer-generation.service';
import { AppModule } from '../src/app.module';
import { AudioService } from '../src/audio/audio.service';
import { ServerToClientEvent } from '../src/common/events.types';
import { InterviewGateway } from '../src/websocket/interview.gateway';

describe('End-to-End WebSocket Interview Pipeline (PRD Section 17.4 & 17.5)', () => {
  let app: NestFastifyApplication;
  let wsUrl: string;

  const mockAudioService = {
    validateAudioFormat: jest.fn().mockReturnValue({ valid: true }),
    startAudioSession: jest.fn().mockReturnValue(true),
    processAudioChunk: jest.fn().mockReturnValue(true),
    stopAudioSession: jest.fn(),
  };

  const mockAnswerGenerationService = {
    generateStreamingAnswer: jest.fn(async (input, callbacks, abortSignal) => {
      callbacks.onStart?.();
      const chunks = [
        `Based on my experience in my resume, `,
        `regarding "${input.question}", `,
        `I built low-latency Node.js and NestJS streaming pipelines `,
        `that reduced first-token latency under 1.5 seconds.`,
      ];
      for (const chunk of chunks) {
        if (abortSignal?.aborted) return;
        await new Promise((r) => setTimeout(r, 10));
        callbacks.onChunk(chunk);
      }
      if (!abortSignal?.aborted) {
        callbacks.onComplete(chunks.join(''), 45);
      }
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AudioService)
      .useValue(mockAudioService)
      .overrideProvider(AnswerGenerationService)
      .useValue(mockAnswerGenerationService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();

    const gateway = app.get(InterviewGateway);
    gateway.attachToServer(app.getHttpServer());

    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 4000;
    wsUrl = `ws://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes complete session lifecycle across 5 interview questions with streaming answers and latency metrics', async () => {
    const receivedEvents: ServerToClientEvent[] = [];
    const client = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', (err) => reject(err));
    });

    client.on('message', (data) => {
      const event = JSON.parse(data.toString()) as ServerToClientEvent;
      receivedEvents.push(event);
    });

    // 1. Start session
    client.send(
      JSON.stringify({
        type: 'START_SESSION',
        payload: {
          resume:
            'Senior Software Engineer with 5 years of experience in TypeScript, React, Next.js, NestJS, Deepgram STT, and Google Gemini.',
          jobDescription:
            'Full-Stack AI Engineer building real-time conversational pipelines.',
          audioMode: 'microphone',
          mimeType: 'audio/webm;codecs=opus',
        },
      }),
    );

    // Wait for SESSION_READY
    await waitForEvent(receivedEvents, 'SESSION_READY');

    // 2. Send binary audio chunk
    client.send(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

    // 3. Simulate greeting and 1-word filler (both should be ignored without poisoning buffer)
    client.send(
      JSON.stringify({
        type: 'SIMULATE_SPEECH',
        payload: { text: 'Hello, how are you?', isFinal: true, speechFinal: true },
      }),
    );
    client.send(
      JSON.stringify({
        type: 'SIMULATE_SPEECH',
        payload: { text: 'Sure.', isFinal: true, speechFinal: true },
      }),
    );

    // 4. Test the 5 required questions from PRD Section 17.4
    const testQuestions = [
      'Tell me about yourself.',
      'Explain your previous project.',
      'How did you improve AI response latency?',
      'What was your biggest technical challenge?',
      'Why are you interested in this role?',
    ];

    for (let i = 0; i < testQuestions.length; i++) {
      const q = testQuestions[i];
      client.send(
        JSON.stringify({
          type: 'SIMULATE_SPEECH',
          payload: { text: q, isFinal: true, speechFinal: true },
        }),
      );

      const expectedId = `question-00${i + 1}`;
      await waitForEvent(
        receivedEvents,
        'ANSWER_COMPLETE',
        (e: any) => e.payload?.questionId === expectedId,
      );
    }

    // 5. Stop session
    client.send(JSON.stringify({ type: 'STOP_SESSION' }));
    await waitForEvent(receivedEvents, 'SESSION_STOPPED');

    client.close();

    const detectedEvents = receivedEvents.filter(
      (e) => e.type === 'QUESTION_DETECTED',
    );
    expect(detectedEvents).toHaveLength(5);

    const chunkEvents = receivedEvents.filter((e) => e.type === 'ANSWER_CHUNK');
    expect(chunkEvents.length).toBeGreaterThanOrEqual(20);

    const latencyEvents = receivedEvents.filter(
      (e) => e.type === 'LATENCY_METRICS',
    );
    expect(latencyEvents).toHaveLength(5);
    for (const metricEvent of latencyEvents) {
      if (metricEvent.type === 'LATENCY_METRICS') {
        expect(metricEvent.payload.questionId).toMatch(/^question-00[1-5]$/);
        expect(metricEvent.payload.questionDetectionMs).toBeLessThan(3000);
        expect(metricEvent.payload.timeToFirstTokenMs).toBeLessThan(3000);
        expect(metricEvent.payload.endToEndLatencyMs).toBeDefined();
        expect(metricEvent.payload.endToEndLatencyMs).toBeLessThan(3000);
      }
    }
  });
});

async function waitForEvent(
  events: ServerToClientEvent[],
  type: ServerToClientEvent['type'],
  predicate?: (event: ServerToClientEvent) => boolean,
  timeoutMs = 3000,
): Promise<ServerToClientEvent> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = events.find(
      (e) => e.type === type && (!predicate || predicate(e)),
    );
    if (found) return found;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`Timed out waiting for event "${type}"`);
}
