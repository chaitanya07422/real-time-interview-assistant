import { QuestionDetectionService } from '../src/question-detection/question-detection.service';

describe('QuestionDetectionService (PRD Section 17.3 & FR-05)', () => {
  let service: QuestionDetectionService;

  beforeEach(() => {
    service = new QuestionDetectionService();
  });

  describe('PRD Section 17.3 Table Cases', () => {
    it('ignores "Hello, how are you?" as a greeting', () => {
      expect(service.extractQuestionFromText('Hello, how are you?')).toBeNull();
    });

    it('ignores "Okay, let\'s start." as filler/transition', () => {
      expect(service.extractQuestionFromText("Okay, let's start.")).toBeNull();
    });

    it('detects "Tell me about yourself." as an interview request', () => {
      expect(service.extractQuestionFromText('Tell me about yourself.')).toBe(
        'Tell me about yourself.',
      );
    });

    it('detects "Why do you want this role?"', () => {
      expect(service.extractQuestionFromText('Why do you want this role?')).toBe(
        'Why do you want this role?',
      );
    });

    it('detects "Explain your previous project." without question mark', () => {
      expect(
        service.extractQuestionFromText('Explain your previous project.'),
      ).toBe('Explain your previous project.');
    });

    it('detects "Can you explain your architecture?"', () => {
      expect(
        service.extractQuestionFromText('Can you explain your architecture?'),
      ).toBe('Can you explain your architecture?');
    });

    it('ignores "I worked on a backend system." as a standalone statement', () => {
      expect(
        service.extractQuestionFromText('I worked on a backend system.'),
      ).toBeNull();
    });

    it('detects "How did you improve performance?"', () => {
      expect(
        service.extractQuestionFromText('How did you improve performance?'),
      ).toBe('How did you improve performance?');
    });
  });

  describe('FR-05 Mixed Input & Edge Cases', () => {
    it('ignores "Okay, let\'s start." and detects "Can you tell me about yourself?" in combined input', () => {
      const input = "Okay, let's start. Can you tell me about yourself?";
      expect(service.extractQuestionFromText(input)).toBe(
        'Can you tell me about yourself?',
      );
    });

    it('ignores audio/video check questions like "Can you hear me okay?"', () => {
      expect(
        service.extractQuestionFromText('Can you hear me okay?'),
      ).toBeNull();
      expect(
        service.extractQuestionFromText('Is my microphone working?'),
      ).toBeNull();
    });

    it('rejects incomplete trailing fragments', () => {
      expect(service.extractQuestionFromText('Can you explain how you...')).toBeNull();
      expect(service.extractQuestionFromText('What was the')).toBeNull();
    });

    it('accumulates segments, detects on speechFinal, and prevents duplicate questions', () => {
      const detected: string[] = [];

      service.ingestFinalTranscript(
        'session-1',
        'Can you explain how you improved AI response latency?',
        (res) => detected.push(res.question),
        { speechFinal: true, timestamp: 1000 },
      );

      // Duplicate utterance should be suppressed
      service.ingestFinalTranscript(
        'session-1',
        'Can you explain how you improved AI response latency?',
        (res) => detected.push(res.question),
        { speechFinal: true, timestamp: 2000 },
      );

      expect(detected).toEqual([
        'Can you explain how you improved AI response latency?',
      ]);
    });

    it('triggers detection after silence threshold when speechFinal is false', (done) => {
      service.ingestFinalTranscript(
        'session-2',
        'Walk me through your system design experience.',
        (res) => {
          expect(res.questionId).toBe('question-001');
          expect(res.question).toBe(
            'Walk me through your system design experience.',
          );
          service.clearSession('session-2');
          done();
        },
        { speechFinal: false, silenceThresholdMs: 50, timestamp: Date.now() },
      );
    });

    it('holds incomplete mid-sentence utterances across a pause and merges the continuation segment', () => {
      const detected: string[] = [];

      // First segment ends with "the" (speaker paused for 5 seconds mid-sentence)
      service.ingestFinalTranscript(
        'session-split',
        'Tell me the time where you have handled the',
        (res) => detected.push(res.question),
        { speechFinal: true, silenceThresholdMs: 20, timestamp: 1000 },
      );

      // Even if UtteranceEnd fires during the pause, it should hold the incomplete segment
      service.handleUtteranceEnd(
        'session-split',
        (res) => detected.push(res.question),
        2000,
      );
      expect(detected).toHaveLength(0);

      // 5 seconds later, the speaker finishes the sentence
      service.ingestFinalTranscript(
        'session-split',
        'order responsibilities.',
        (res) => detected.push(res.question),
        { speechFinal: true, timestamp: 6000 },
      );

      expect(detected).toEqual([
        'Tell me the time where you have handled the order responsibilities.',
      ]);
      service.clearSession('session-split');
    });

    it('does not hold 1-2 word greetings or fillers in the incomplete buffer and detects the following question cleanly', () => {
      const detected: string[] = [];

      for (const filler of ['Hello.', 'Sure.', 'Got it.', 'Sounds good.', 'I see.']) {
        service.ingestFinalTranscript(
          'session-filler-seq',
          filler,
          (res) => detected.push(res.question),
          { speechFinal: true, timestamp: 1000 },
        );
      }
      expect(detected).toHaveLength(0);

      service.ingestFinalTranscript(
        'session-filler-seq',
        'Tell me about yourself.',
        (res) => detected.push(res.question),
        { speechFinal: true, timestamp: 2000 },
      );

      expect(detected).toEqual(['Tell me about yourself.']);
      service.clearSession('session-filler-seq');
    });

    it('recognizes plural interviewer requests and conversational prefixes', () => {
      expect(
        service.extractQuestionFromText('Walk us through your system architecture.'),
      ).toBe('Walk us through your system architecture.');
      expect(
        service.extractQuestionFromText('Tell us about your previous project.'),
      ).toBe('Tell us about your previous project.');
      expect(
        service.extractQuestionFromText('Sure, tell me about yourself.'),
      ).toBe('Tell me about yourself.');
      expect(
        service.extractQuestionFromText('Got it, how did you improve performance?'),
      ).toBe('How did you improve performance?');
    });

    it('resets silence timer when interim transcripts arrive so multi-clause questions are not cut off mid-speech', async () => {
      const detected: string[] = [];

      service.ingestFinalTranscript(
        'session-interim',
        'Can you explain your architecture',
        (res) => detected.push(res.question),
        { speechFinal: false, silenceThresholdMs: 80, timestamp: 1000 },
      );

      await new Promise((r) => setTimeout(r, 45));
      service.notifyInterimTranscript('session-interim', 1045);

      await new Promise((r) => setTimeout(r, 45));
      // Without notifyInterimTranscript, the 80ms silence timer would have already fired at ~80ms
      expect(detected).toHaveLength(0);

      service.ingestFinalTranscript(
        'session-interim',
        'and how you handled scaling?',
        (res) => detected.push(res.question),
        { speechFinal: true, timestamp: 1100 },
      );

      expect(detected).toEqual([
        'Can you explain your architecture and how you handled scaling?',
      ]);
      service.clearSession('session-interim');
    });
  });
});
