/**
 * Greetings, small talk, and audio/video check questions that should NEVER trigger
 * interview answer generation even if they end with a question mark.
 */
export const GREETING_OR_SMALL_TALK_PATTERNS: RegExp[] = [
  /^(hello|hi|hey|good\s+(morning|afternoon|evening)|greetings)\b[\s,!.]*(how\s+are\s+you(\s+doing|\s+today)?|how\s+is\s+it\s+going|how's\s+it\s+going|nice\s+to\s+meet\s+you|pleasure\s+to\s+meet\s+you)?[?.!]*$/i,
  /^how\s+are\s+you(\s+doing|\s+today)?[?.!]*$/i,
  /^how('s|\s+is)\s+(it\s+going|your\s+day(\s+going)?|everything)[?.!]*$/i,
  /^(nice|good|great|pleasure)\s+to\s+(meet|see|talk\s+to)\s+you[?.!]*$/i,
  /^can\s+you\s+(hear|see)\s+me(\s+okay|\s+clearly|\s+well|\s+alright)?[?.!]*$/i,
  /^is\s+my\s+(audio|mic|microphone|video|screen)\s+(working|okay|clear)[?.!]*$/i,
  /^(are\s+you\s+ready(\s+to\s+(start|begin))?|ready\s+to\s+(start|begin)|shall\s+we\s+(start|begin))[?.!]*$/i,
  /^thanks?\s+for\s+(joining|taking\s+the\s+time|coming|being\s+here)[?.!]*$/i,
];

/**
 * Conversational fillers, acknowledgements, and transitions to strip or ignore.
 */
export const FILLER_OR_TRANSITION_PATTERNS: RegExp[] = [
  /^(okay|ok|alright|all\s+right|sure|great|awesome|perfect|sounds\s+good|got\s+it|i\s+see|makes\s+sense|understood|right|yeah|yes|yep|uh\s+huh|mm\s+hmm|thank\s+you|thanks)(\s+(then|so\s+much|very\s+much))?[,.!]*$/i,
  /^(okay|ok|alright|so|well|now)?[\s,]*(let's|let\s+us)\s+(start|get\s+started|begin|jump\s+in|dive\s+in|move\s+on(\s+to\s+the\s+next\s+question)?)[,.!]*$/i,
  /^(moving\s+on|next\s+question|let's\s+see)[,.!]*$/i,
];

/**
 * Leading conversational prefixes that can precede a valid question within the same sentence
 */
export const LEADING_FILLER_PREFIX =
  /^(?:(?:hello|hi|hey|okay|ok|alright|all\s+right|sure|got\s+it|i\s+see|sounds\s+good|makes\s+sense|understood|right|yeah|yes|yep|so|well|great|awesome|perfect|thank\s+you|thanks|now|first(?:\s+of\s+all)?|to\s+start(?:\s+off)?|let's\s+start)\b[\s,.:;-]*)+/i;

/**
 * Direct interrogative question starters
 */
export const INTERROGATIVE_STARTER =
  /^(what|why|how|when|where|who|which|whose|whom)\b/i;

/**
 * Modal / auxiliary question starters
 */
export const AUXILIARY_QUESTION_STARTER =
  /^(can\s+(you|we)|could\s+(you|we)|would\s+you|will\s+you|have\s+you(\s+ever)?|did\s+you|do\s+you|are\s+you|were\s+you|is\s+there|are\s+there|was\s+there|should\s+we|may\s+i\s+ask|might\s+you)\b/i;

/**
 * Imperative / behavioral / technical interview requests (often spoken without a question mark)
 */
export const IMPERATIVE_REQUEST_STARTER =
  /^(tell\s+(me|us)(\s+about|\s+how|\s+why|\s+what|\s+a\s+time)?|walk\s+(me|us)\s+through|describe(\s+your|\s+a|\s+how|\s+the|\s+what)?|explain(\s+your|\s+how|\s+why|\s+what|\s+the|\s+a|\s+to\s+(me|us))?|share(\s+an\s+example|\s+a\s+time|\s+your|\s+how)?|give\s+(me|us)\s+(an\s+example|a\s+brief|some\s+background|an\s+overview)|talk(\s+to\s+(me|us))?\s+about|elaborate\s+on|discuss(\s+your|\s+how|\s+the)?|compare(\s+and\s+contrast)?|define\b|outline\b|summarize\b|take\s+(me|us)\s+through|help\s+(me|us)\s+understand|speak\s+to)\b/i;

/**
 * Indirect interview prompts
 */
export const INDIRECT_PROMPT_STARTER =
  /^(i'd\s+(like|love)\s+to\s+(hear|know|learn|understand)(\s+more)?\s+about|i\s+would\s+(like|love)\s+to\s+(hear|know|learn|understand)(\s+more)?\s+about|i'm\s+(curious|interested)\s+(to\s+(hear|know|learn)|about)|i\s+am\s+(curious|interested)\s+(to\s+(hear|know|learn)|about)|let's\s+(talk|hear)\s+about\b|let's\s+discuss\b)/i;

/**
 * Trailing tokens or incomplete stem phrases that indicate the speaker is still mid-sentence
 */
export const INCOMPLETE_TRAILING_WORD =
  /\b(and|or|but|because|so|that|which|who|where|when|while|if|although|about|with|for|from|into|onto|to|of|in|on|by|at|the|a|an|your|my|our|their|this|these|those|some|any|such|as|like|have|has|had|was|were|is|are|been|being|do|does|did|can|could|would|should|will|shall|may|might|must|can\s+you|could\s+you|how\s+did|what\s+is|what\s+was|tell\s+me)\s*[.?!]{0,3}$/i;

/**
 * Incomplete introductory stems like "Tell me about a time" or "Give me an example"
 * where the speaker paused before stating the actual topic/clause.
 */
export const INCOMPLETE_QUESTION_STEM =
  /^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:tell\s+me|give\s+me|share|describe|walk\s+me\s+through|talk\s+about|explain)\s+(?:about\s+)?(?:a|an|the|some|your)?\s*(?:time|example|situation|scenario|instance|story|case|moment)?\s*(?:where|when|that|in\s+which|of\s+when)?\s*(?:you|your|we)?\s*(?:have|had|were|did)?\s*[.?!]*$/i;

export function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGreetingOrSmallTalk(text: string): boolean {
  const trimmed = text.trim();
  return GREETING_OR_SMALL_TALK_PATTERNS.some((pattern) =>
    pattern.test(trimmed),
  );
}

export function isFillerOrTransition(text: string): boolean {
  const trimmed = text.trim();
  return FILLER_OR_TRANSITION_PATTERNS.some((pattern) =>
    pattern.test(trimmed),
  );
}

export function looksIncompletePhrase(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (isGreetingOrSmallTalk(trimmed) || isFillerOrTransition(trimmed)) {
    return false;
  }
  if (trimmed.endsWith('...')) {
    return true;
  }
  const words = extractWords(trimmed);
  if (words.length < 3) {
    return true;
  }
  if (INCOMPLETE_QUESTION_STEM.test(trimmed)) {
    return true;
  }
  if (!trimmed.endsWith('?') && INCOMPLETE_TRAILING_WORD.test(trimmed)) {
    return true;
  }
  return false;
}


export function evaluateSingleSentence(sentence: string): string | null {
  let text = sentence.trim();
  if (!text) {
    return null;
  }

  if (isGreetingOrSmallTalk(text) || isFillerOrTransition(text)) {
    return null;
  }

  const stripped = text.replace(LEADING_FILLER_PREFIX, '').trim();
  if (stripped.length > 0 && stripped !== text) {
    text = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  if (isGreetingOrSmallTalk(text) || isFillerOrTransition(text)) {
    return null;
  }

  const words = extractWords(text);
  if (words.length < 3 || looksIncompletePhrase(text)) {
    return null;
  }

  const hasQuestionMark = text.endsWith('?');
  const isInterrogative = INTERROGATIVE_STARTER.test(text);
  const isAuxiliaryQuestion = AUXILIARY_QUESTION_STARTER.test(text);
  const isImperativeRequest = IMPERATIVE_REQUEST_STARTER.test(text);
  const isIndirectPrompt = INDIRECT_PROMPT_STARTER.test(text);

  if (
    isInterrogative ||
    isAuxiliaryQuestion ||
    isImperativeRequest ||
    isIndirectPrompt ||
    hasQuestionMark
  ) {
    if (!/[.?!]$/.test(text) && (isInterrogative || isAuxiliaryQuestion)) {
      return `${text}?`;
    }
    if (!/[.?!]$/.test(text)) {
      return `${text}.`;
    }
    return text;
  }

  // Check if the sentence has an introductory statement followed by a comma/dash and a question clause
  // e.g. "I see you worked on NestJS, can you explain how you handled scaling?"
  const embeddedMatch = text.match(
    /[,;—-]\s*((?:what|why|how|when|where|who|which|can\s+you|could\s+you|would\s+you|did\s+you|do\s+you|have\s+you|tell\s+me|walk\s+me\s+through|explain|describe)\b.+)$/i,
  );
  if (embeddedMatch && embeddedMatch[1]) {
    const clause =
      embeddedMatch[1].charAt(0).toUpperCase() + embeddedMatch[1].slice(1);
    return evaluateSingleSentence(clause);
  }

  return null;
}

export function extractQuestionFromUtterance(rawText: string): string | null {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const cleanedInput = rawText.replace(/\s+/g, ' ').trim();
  if (!cleanedInput) {
    return null;
  }

  const sentenceCandidates = cleanedInput
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const validQuestions: string[] = [];

  for (const candidate of sentenceCandidates) {
    const evaluated = evaluateSingleSentence(candidate);
    if (evaluated) {
      validQuestions.push(evaluated);
    }
  }

  if (validQuestions.length === 0) {
    return null;
  }

  return validQuestions.join(' ');
}

export function computeJaccardSimilarity(
  setA: Set<string>,
  setB: Set<string>,
): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
