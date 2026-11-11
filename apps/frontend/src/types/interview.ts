export type AppStatus =
  | 'Idle'
  | 'Connecting'
  | 'Listening'
  | 'Thinking'
  | 'Answering'
  | 'Error'
  | 'Stopped';

export type AudioInputMode = 'microphone' | 'tab';

export type AnswerMode = 'concise' | 'detailed' | 'star';

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface LatencyMetrics {
  questionId?: string;
  questionDetectionMs: number;
  timeToFirstTokenMs: number;
  totalGenerationMs: number;
  endToEndLatencyMs?: number;
}

export interface DetectedQuestionItem {
  questionId: string;
  sequenceNumber: number;
  question: string;
  answerMode: AnswerMode;
  detectedAt: number;
  status: 'thinking' | 'answering' | 'completed' | 'error';
  answer: string;
  durationMs?: number;
  latency?: LatencyMetrics;
}

export interface SessionError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface CandidateContext {
  resume: string;
  jobDescription: string;
  audioMode: AudioInputMode;
  answerMode: AnswerMode;
}

export const SAMPLE_RESUME = `Alex Rivera — Senior Full-Stack & AI Systems Engineer
Summary:
Software Engineer with 5+ years of experience building low-latency real-time web applications, distributed Node.js/NestJS microservices, and streaming LLM integrations.

Experience:
- Senior Software Engineer at CloudScale AI (2023–Present):
  • Architected a real-time customer support voice assistant using Next.js, NestJS (Fastify), WebSockets, Deepgram Nova-3 STT, and Google Gemini.
  • Reduced end-to-end AI answer latency (Time-to-First-Token) from 4.2s to 1.4s by replacing buffered REST calls with binary WebSocket audio streaming, hybrid VAD endpointing, and streaming LLM generation.
  • Implemented bounded audio ring buffers and exponential backoff reconnection handling 10,000+ concurrent WebSocket sessions with 99.95% uptime.
- Software Engineer at FinStream Systems (2021–2023):
  • Built high-throughput event pipelines in TypeScript, Node.js, PostgreSQL, and Redis processing 50k events/sec.
  • Led migration from Express to NestJS + Fastify, cutting P95 API latency by 35%.

Skills:
TypeScript, JavaScript, React, Next.js, Node.js, NestJS, Fastify, WebSockets, Deepgram STT, Google Gemini API, Redis, PostgreSQL, Docker, AWS.`;

export const SAMPLE_JOB_DESCRIPTION = `Role: Senior Software Engineer — Real-Time AI Products
Responsibilities:
- Design and build low-latency, real-time streaming audio and conversational AI applications.
- Integrate Speech-to-Text (Deepgram) and Large Language Models (Google Gemini) with sub-3-second response latency.
- Build resilient WebSocket gateways in Node.js / NestJS + Fastify and responsive dashboards in Next.js + React + TypeScript.
- Ensure strong engineering reliability, backpressure handling, observability, and clean modular architecture.`;

export const DEMO_INTERVIEW_QUESTIONS = [
  'Tell me about yourself.',
  'Explain your previous project.',
  'How did you improve AI response latency?',
  'What was your biggest technical challenge?',
  'Why are you interested in this role?',
];
