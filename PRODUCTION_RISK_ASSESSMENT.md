# Production Risk Assessment

**Question:** *"What are the top 3 risks of taking this POC to production, and how would you address them?"*

### 1. Speaker Confusion, Acoustic Bleed, and False Turn Detection
In live interviews, candidates and interviewers interrupt each other, pause mid-thought, or speak over laptop speakers. A single-channel audio pipeline without speaker separation will transcribe the candidate's own voice—triggering answers to the candidate's own clarifying questions—or fire prematurely during an interviewer's thinking pause.
- **Mitigation:** Isolate audio into two distinct channels (`getDisplayMedia` tab audio = Interviewer; `getUserMedia` mic = Candidate) combined with Deepgram speaker diarization (`diarize=true`), muting question detection whenever the candidate's mic is active. Pair fast acoustic endpointing with an async micro-classifier (`gemini-2.5-flash-lite`) to resolve ambiguous pauses without slowing down clear questions.

### 2. P99 Tail-Latency (>3s) and Stateful Audio Stream Fragility
Hitting sub-3-second TTFT at P99 across thousands of 45-minute sessions is threatened by stateful WebM containers (where only `chunk #0` holds the EBML header, making mid-session socket drops undecodable) and upstream STT/LLM latency spikes.
- **Mitigation:** Replace `MediaRecorder` WebM blobs with a WebAudio `AudioWorklet` streaming stateless `16kHz` Linear16 PCM frames so any worker or backup STT provider (AssemblyAI fallback) can take over mid-sentence without replaying container headers. Warm context early by running speculative retrieval on *interim* transcripts while the interviewer is still speaking, backed by multi-provider LLM circuit breakers.

### 3. Unverifiable Hallucinations, Prompt Injection, and Recording Compliance
If the LLM fabricates a metric or tool the candidate cannot defend 10 seconds later on a follow-up question, the candidate's credibility collapses. Streaming live third-party voice also triggers two-party recording consent laws and PII exposure risks.
- **Mitigation:** Pre-index the candidate's resume into verified claim chunks at session start so answers cite only grounded facts (with honest pivot phrasing for missing skills); sandbox untrusted job descriptions in sanitized XML tags; and enforce explicit consent, PII scrubbing, short-lived WebSocket JWTs, and zero-retention provider flags (`mip_opt_out=true`).
