# Production Risk Assessment

**Question:** *"What are the top 3 risks of taking this POC to production, and how would you address them?"*

### 1. Audio Privacy, Two-Party Consent, and Data Security
Capturing live interview audio introduces strict legal and privacy obligations (e.g., GDPR, CCPA, and two-party recording consent laws) alongside risks of exposing sensitive PII in resumes and transcripts.
- **Mitigation:** Enforce explicit user consent workflows and visible recording indicators; scrub PII before external API transmission; enforce TLS/WSS encryption in transit and zero-retention flags (`mip_opt_out` on Deepgram, zero data retention on Gemini); and authenticate WebSocket sessions via short-lived JWTs with strict per-tenant isolation.

### 2. Real-Time Reliability, Latency Spikes, and Provider Outages
The sub-3-second Time-to-First-Token (TTFT) target depends on persistent stateful WebSockets and two external cloud providers (Deepgram and Gemini). Network jitter, provider rate limits, or regional outages can break active interviews.
- **Mitigation:** Deploy multi-provider failover (e.g., AssemblyAI/Whisper fallback for STT; OpenAI/Anthropic fallback for LLM) behind circuit breakers and health checks; move session state to Redis for seamless horizontal scaling and stateful WebSocket recovery; and colocate backend edge nodes near STT/LLM regions.

### 3. LLM Hallucinations, Prompt Injection, and Answer Quality
Under low-latency constraints, the LLM may fabricate candidate experience, produce overly verbose text that sounds unnatural when spoken, or fall victim to prompt injection embedded in pasted job descriptions.
- **Mitigation:** Isolate untrusted resume/job-description inputs using strict XML delimiters and input sanitization; pre-index candidate resumes into structured claims for retrieval-augmented grounding; enforce post-generation citation/fact checks; and continuously evaluate output conciseness and faithfulness using automated LLM-as-a-judge benchmarks.
