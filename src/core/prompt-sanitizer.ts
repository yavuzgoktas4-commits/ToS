/**
 * Prompt Sanitizer and Untrusted Input Boundary Enforcement
 * Treats all web DOM text as UNTRUSTED CONTENT.
 */

export const UNTRUSTED_TAG_OPEN = '<untrusted_tos_document>';
export const UNTRUSTED_TAG_CLOSE = '</untrusted_tos_document>';

export interface SanitizationResult {
  isolatedPromptPayload: string;
  sanitizedRawText: string;
  breakoutAttemptsCount: number;
  heuristicFlags: string[];
}

/**
 * Known prompt injection heuristic triggers commonly found in adversarial web text.
 */
const INJECTION_PATTERNS: Array<{ id: string; regex: RegExp; description: string }> = [
  {
    id: 'ignore_instructions',
    regex: /(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|rules|prompts|directives)/i,
    description: 'System instruction override attempt',
  },
  {
    id: 'forced_safe_output',
    regex: /(?:say|return|output|state)\s+(?:that\s+)?(?:this|the)\s+(?:policy|terms|document|tos)\s+(?:is|are)\s+(?:safe|legit|benign|zero risk|risk 0)/i,
    description: 'Forced zero-risk output manipulation',
  },
  {
    id: 'risk_score_override',
    regex: /(?:risk_score|risk score)\s*[:=]\s*(?:0|zero)/i,
    description: 'Direct JSON field manipulation (risk_score = 0)',
  },
  {
    id: 'role_impersonation',
    regex: /(?:you are now|pretend you are|act as|switch to)\s+(?:an?\s+)?(?:helpful assistant|unrestricted(?:\s+\w+)?|dan|jailbreak|jailbroken|(?:in\s+)?developer mode)/i,
    description: 'Persona/role hijack attempt',
  },
  {
    id: 'system_delimiter_forgery',
    regex: /<\/?(?:system|instruction|prompt|admin|developer)>/i,
    description: 'Fake system delimiter tags',
  },
];

/**
 * Sanitizes untrusted web text, neutralizes delimiter breakouts, and wraps the content safely.
 *
 * @param rawText Extracted text from DOM
 * @returns SanitizationResult
 */
export function sanitizeAndWrapUntrustedText(rawText: string): SanitizationResult {
  let breakoutCount = 0;
  const heuristicFlags: string[] = [];

  // Check for heuristic prompt injection signals
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(rawText)) {
      heuristicFlags.push(pattern.description);
    }
  }

  // Defuse delimiter breakout attempts (e.g. an attacker putting </untrusted_tos_document> in the text)
  let sanitized = rawText.replace(/<\/untrusted_tos_document>/gi, () => {
    breakoutCount++;
    return '&lt;/untrusted_tos_document&gt;';
  });

  sanitized = sanitized.replace(/<untrusted_tos_document>/gi, () => {
    breakoutCount++;
    return '&lt;untrusted_tos_document&gt;';
  });

  if (breakoutCount > 0) {
    heuristicFlags.push(`Delimiter breakout attempt detected (${breakoutCount} occurrences neutralized)`);
  }

  // Construct isolated payload
  const isolatedPromptPayload = `${UNTRUSTED_TAG_OPEN}\n${sanitized}\n${UNTRUSTED_TAG_CLOSE}`;

  return {
    isolatedPromptPayload,
    sanitizedRawText: sanitized,
    breakoutAttemptsCount: breakoutCount,
    heuristicFlags,
  };
}

/**
 * Checks whether raw text contains high-confidence prompt injection indicators.
 */
export function detectSuspiciousPatterns(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.regex.test(text));
}
