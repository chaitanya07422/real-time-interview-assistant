# Real-Time AI Interview Assistant (POC)

A real-time web application that assists candidates during virtual technical, behavioral, and HR interviews by capturing live audio, streaming Speech-to-Text (STT) via **Deepgram**, automatically detecting completed interview questions, and streaming concise, context-grounded suggested answers using **Google Gemini**.

---

## 1. Project Overview & Features

### Pipeline Flow
`Audio Input (Mic / Tab) → Binary WebSocket Stream → Deepgram Live STT → Hybrid Question Detection → Google Gemini Streaming → Real-Time UI Display`

### Implemented Features
- **Candidate Context Configuration (FR-01):** Multiline inputs for Resume and Job Description with validation, prompt-injection sanitization, and one-click sample context loading.
- **Dual-Mode Audio Capture (FR-02):**
  - **Mode A (Browser Tab Audio):** Captures meeting tab audio via `navigator.mediaDevices.getDisplayMedia()`.
  - **Mode B (Microphone Audio):** Captures microphone audio via `navigator.mediaDevices.getUserMedia()` with echo cancellation and noise suppression.
- **Binary WebSocket Audio Streaming (FR-03):** Streams raw 250ms binary `ArrayBuffer` chunks from browser `MediaRecorder` to the NestJS Fastify backend without base64 bloat, backed by a bounded pre-open buffer that preserves container headers.
- **Real-Time Speech-to-Text (FR-04):** Integrates Deepgram Nova-2 Live Streaming with visual distinction between `TRANSCRIPT_UPDATE` (interim) and `TRANSCRIPT_FINAL` (confirmed) segments.
- **5-Stage Hybrid Question Detection Engine (FR-05):** Combines Deepgram `speech_final` and `UtteranceEnd` signals, configurable silence timers (`800–1200ms`), sentence segmentation, linguistic question/imperative heuristics, greeting/filler filtering, and Jaccard similarity deduplication.
- **Grounded Streaming Answer Generation (FR-06 & FR-07):** Streams concise (60–90 words / 3–6 bullet points), first-person answers from Google Gemini strictly grounded in the candidate's resume and job description, with automatic `AbortController` cancellation if a new question supersedes an in-flight generation.
- **Latency Metrics & Reliability:** Measures `questionDetectionMs`, `timeToFirstTokenMs` (TTFT), and `totalGenerationMs` per question, and implements bounded exponential backoff WebSocket reconnection.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Browser MediaDevices & MediaRecorder APIs, Native WebSocket API |
| **Backend** | Node.js, NestJS 11, Fastify Adapter, `ws` WebSocket Server |
| **Speech-to-Text** | Deepgram Streaming API (`@deepgram/sdk`, `nova-2`) |
| **LLM** | Google Gemini Streaming API (`@google/genai`, configurable via `GEMINI_MODEL`) |
| **Testing** | Jest, `@nestjs/testing`, End-to-End WebSocket Pipeline Tests |

---

## 3. High-Level Architecture

```
+-------------------------------------------------------------------------+
|                        FRONTEND (Next.js + React)                       |
|                                                                         |
|  [ContextForm]   [AudioControls (Mic / Tab)]   [StatusIndicator]        |
|                         |                                               |
|               MediaRecorder (250ms binary chunks)                       |
|                         |                                               |
|  [TranscriptPanel] <--- Native WebSocket (ws://) ---> [QuestionPanel]   |
|                                                       [AnswerPanel]     |
+---------------------------------|---------------------------------------+
                                  | Binary Audio + JSON Events
                                  v
+-------------------------------------------------------------------------+
|                    BACKEND (NestJS + Fastify + ws)                      |
|                                                                         |
|  [InterviewGateway] <---> [SessionManagerService] <---> [MetricsService]|
|         |                                                      ^        |
|         +---> [AudioService] (Validation & Bounded Buffer)     |        |
|                     |                                          |        |
|                     v                                          |        |
|         [TranscriptionService] <== WSS ==> (Deepgram Live API) |        |
|                     |                                          |        |
|          Interim & Final Transcripts + Endpointing             |        |
|                     v                                          |        |
|       [QuestionDetectionService] (5-Stage Hybrid Engine)       |        |
|                     |                                          |        |
|              Detected Question (question-001)                  |        |
|                     v                                          |        |
|       [AnswerGenerationService] <== SSE ==> (Google Gemini API)+        |
+-------------------------------------------------------------------------+
```

---

## 4. Setup Instructions & Environment Configuration

### Prerequisites
- **Node.js:** v20+
- **npm:** v10+
- **API Keys:**
  - [Deepgram API Key](https://console.deepgram.com/)
  - [Google Gemini API Key](https://aistudio.google.com/)

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` in the repository root (the backend loads `.env` from either the root directory or `apps/backend/.env`):
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Backend Configuration
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
DEEPGRAM_API_KEY=your_deepgram_api_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
QUESTION_SILENCE_THRESHOLD_MS=900

# Frontend Configuration
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:4000
```

---

## 5. How to Run the Application

### Run Backend (Port 4000)
```bash
npm run dev:backend
```

### Run Frontend (Port 3000)
In a second terminal:
```bash
npm run dev:frontend
```
Open **`http://localhost:3000`** in Chrome/Edge/Brave.

### Run Automated Tests & Build Verification
```bash
# Run backend unit & end-to-end WebSocket pipeline tests
npm test

# Type-check both workspaces
npm run lint

# Production build of both backend and frontend
npm run build
```

---

## 6. Key Technical Decisions & Question Detection Approach

### Binary WebSocket Audio Pipeline
- **No Base64 Overhead:** Browser `MediaRecorder` emits `Blob` slices every `250ms`, which are converted to `ArrayBuffer` and transmitted as native binary WebSocket frames (`ws.send(buffer)`).
- **Container Header Preservation:** When using containerized formats (`audio/webm;codecs=opus`), the first chunk contains the EBML/WebM header. `TranscriptionService` maintains a bounded queue (`MAX_PENDING_CHUNKS = 60`) while the Deepgram socket handshake completes, flushing chunk `#0` onward in exact order upon `LiveTranscriptionEvents.Open`.

### 5-Stage Hybrid Question Detection Engine
1. **Transcript Accumulation:** Final segments (`is_final: true`) are accumulated per session while ignoring back-to-back duplicate STT emissions.
2. **Speech Completion:** Evaluation triggers immediately when Deepgram signals `speech_final: true` (provided the phrase does not end with a dangling conjunction/preposition) or when `UtteranceEnd` / the configurable silence timer (`900ms` default) fires.
3. **Sentence Segmentation & Prefix Stripping:** Multi-sentence utterances (e.g., *"Okay, let's start. Can you tell me about yourself?"*) are split on sentence boundaries; conversational prefixes are stripped so *"Okay, let's start."* is discarded and *"Can you tell me about yourself?"* is extracted.
4. **Linguistic Classification & Validation:**
   - **Accepts:** Interrogatives (`what`, `why`, `how`, `when`, `where`, `who`, `which`), auxiliary questions (`can you`, `could you`, `would you`, `have you`, `did you`), imperative prompts without question marks (`tell me about`, `walk me through`, `explain`, `describe`, `share an example`), and indirect prompts (`I'd love to hear about`).
   - **Rejects:** Greetings (`"Hello, how are you?"`), audio checks (`"Can you hear me?"`), filler transitions (`"Okay, let's start."`), standalone declarative statements (`"I worked on a backend system."`), and incomplete < 3-word fragments.
5. **Deduplication:** Normalized text and token-level Jaccard similarity (`>= 0.85`) prevent repeated LLM calls for duplicate questions.

---

## 7. Latency Measurements

| Stage | Metric | Typical Measured Range |
|---|---|---|
| Audio Endpoint → Question Detected | `questionDetectionMs` | `5ms – 350ms` (on `speech_final`) / `~900ms` (silence timer fallback) |
| Gemini Request → First Streamed Chunk | `timeToFirstTokenMs` (TTFT) | `450ms – 1,350ms` (`gemini-2.5-flash`) |
| End-to-End First Answer Token | `endToEndLatencyMs` | **`0.8s – 2.2s`** (Target: `< 3.0s`) |
| Complete 60–90 Word Answer Stream | `totalGenerationMs` | `1,400ms – 2,600ms` |

---

## 8. Known Limitations & Future Improvements

### Known Limitations (POC Scope)
- In-memory session state only (no database or persistent interview history).
- No user authentication or multi-tenant billing.
- Browser-tab audio capture (`getDisplayMedia`) requires Chromium-based browsers for tab-level audio sharing.
- Heuristic question detection may occasionally misclassify unconventional phrasing.

### Future Improvements
1. **STAR-Format & Question Category Classifier:** Classify questions into Behavioral, System Design, Coding, or HR to tailor structure (e.g., Situation-Task-Action-Result).
2. **Speaker Diarization:** Use Deepgram `diarize=true` or dual-stream capture (Tab = Interviewer, Mic = Candidate) to strictly separate candidate speech from interviewer questions.
3. **Semantic Embedding Deduplication & RAG:** Index candidate project artifacts and resume bullet points for sub-100ms retrieval grounding.
4. **Redis Session Store & Multi-Provider Failover:** Persist session state in Redis and add automatic STT/LLM fallback providers.

---

## 9. Production Risk Assessment (≤ 300 Words)

### 1. Audio Privacy, Two-Party Consent, and Data Security
Capturing live interview audio introduces strict legal and privacy obligations (e.g., GDPR, CCPA, and two-party recording consent laws) alongside risks of exposing sensitive PII in resumes and transcripts.
- **Mitigation:** Enforce explicit user consent workflows and visible recording indicators; scrub PII before external API transmission; enforce TLS/WSS encryption in transit and zero-retention flags (`mip_opt_out` on Deepgram, zero data retention on Gemini); and authenticate WebSocket sessions via short-lived JWTs with strict per-tenant isolation.

### 2. Real-Time Reliability, Latency Spikes, and Provider Outages
The sub-3-second Time-to-First-Token (TTFT) target depends on persistent stateful WebSockets and two external cloud providers (Deepgram and Gemini). Network jitter, provider rate limits, or regional outages can break active interviews.
- **Mitigation:** Deploy multi-provider failover (e.g., AssemblyAI/Whisper fallback for STT; OpenAI/Anthropic fallback for LLM) behind circuit breakers and health checks; move session state to Redis for seamless horizontal scaling and stateful WebSocket recovery; and colocate backend edge nodes near STT/LLM regions.

### 3. LLM Hallucinations, Prompt Injection, and Answer Quality
Under low-latency constraints, the LLM may fabricate candidate experience, produce overly verbose text that sounds unnatural when spoken, or fall victim to prompt injection embedded in pasted job descriptions.
- **Mitigation:** Isolate untrusted resume/job-description inputs using strict XML delimiters and input sanitization; pre-index candidate resumes into structured claims for retrieval-augmented grounding; enforce post-generation citation/fact checks; and continuously evaluate output conciseness and faithfulness using automated LLM-as-a-judge benchmarks.


