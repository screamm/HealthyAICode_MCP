// packages/core/src/security/llm-assessor.ts
// LLM assessment layer: stub for Claude API integration (Sprint 28, static-only phase).
//
// The pure functions buildAssessmentPrompt and parseAssessmentResponse are fully
// testable without API calls. assessFinding is a stub returning confidence=0.5.

import type { StaticFinding, LlmAssessment, ScanDepth } from './types';

const DEPTH_TO_MODEL: Record<ScanDepth, string> = {
  quick: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-5',
  deep: 'claude-opus-4-5',
};

/**
 * Build the assessment prompt for a static finding.
 *
 * Pure function — no external dependencies, fully unit-testable.
 */
export function buildAssessmentPrompt(
  finding: StaticFinding,
  contextCode: string,
  language: string,
): string {
  return [
    `Finding: ${finding.type} at line ${finding.line}`,
    `File: ${finding.filePath}`,
    `Static risk score: ${finding.static_score}`,
    '',
    `Code context (${language}):`,
    '```' + language,
    contextCode,
    '```',
    '',
    'Code snippet near finding:',
    finding.codeSnippet,
    '',
    'Respond with JSON only:',
    JSON.stringify({
      confidence: '<float 0.0-1.0>',
      severity: 'critical|high|medium|low',
      false_positive_likelihood: '<float 0.0-1.0>',
      exploitability: 'trivial|moderate|complex|theoretical',
      remediation_code: '<code fix>',
      explanation: '<max 100 words>',
    }),
  ].join('\n');
}

/** Valid severity levels for LLM assessment responses. */
const VALID_SEVERITIES: LlmAssessment['severity'][] = ['critical', 'high', 'medium', 'low'];

/** Valid exploitability levels for LLM assessment responses. */
const VALID_EXPLOITABILITIES: LlmAssessment['exploitability'][] = ['trivial', 'moderate', 'complex', 'theoretical'];

/** Default float value used for confidence and false_positive_likelihood on parse errors. */
const DEFAULT_CONFIDENCE = 0.5;

/** Extracts a validated severity from a parsed JSON object, falling back to 'medium'. */
function extractSeverity(parsed: Record<string, unknown>): LlmAssessment['severity'] {
  const v = parsed.severity;
  if (typeof v === 'string' && VALID_SEVERITIES.includes(v as LlmAssessment['severity'])) {
    return v as LlmAssessment['severity'];
  }
  return 'medium';
}

/** Extracts a validated exploitability from a parsed JSON object, falling back to 'moderate'. */
function extractExploitability(parsed: Record<string, unknown>): LlmAssessment['exploitability'] {
  const v = parsed.exploitability;
  if (typeof v === 'string' && VALID_EXPLOITABILITIES.includes(v as LlmAssessment['exploitability'])) {
    return v as LlmAssessment['exploitability'];
  }
  return 'moderate';
}

/**
 * Parse a JSON response from the LLM into an LlmAssessment.
 *
 * Returns a neutral fallback assessment (confidence=0.5) on parse failure.
 * Pure function — no external dependencies, fully unit-testable.
 */
export function parseAssessmentResponse(
  text: string,
  model: string,
  cost: number,
): LlmAssessment {
  const fallback: LlmAssessment = {
    confidence: DEFAULT_CONFIDENCE,
    severity: 'medium',
    false_positive_likelihood: DEFAULT_CONFIDENCE,
    exploitability: 'moderate',
    remediation_code: '',
    explanation: 'Assessment unavailable — parse error.',
    model_used: model,
    cost_usd: cost,
  };

  try {
    // Extract JSON object from response (LLM may include prose around it).
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    return {
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : DEFAULT_CONFIDENCE,
      severity: extractSeverity(parsed),
      false_positive_likelihood: typeof parsed.false_positive_likelihood === 'number'
        ? parsed.false_positive_likelihood
        : DEFAULT_CONFIDENCE,
      exploitability: extractExploitability(parsed),
      remediation_code: typeof parsed.remediation_code === 'string' ? parsed.remediation_code : '',
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
      model_used: model,
      cost_usd: cost,
    };
  } catch {
    return fallback;
  }
}

/**
 * Assess a static finding.
 *
 * STUB for the static-only phase of Sprint 28.
 * Returns a neutral LlmAssessment with confidence=0.5 so combined_score
 * reflects primarily the static layer signal.
 *
 * When the API key is available and the caller opts in, this will be
 * upgraded to a real Claude API call with retry logic.
 */
export async function assessFinding(
  finding: StaticFinding,
  _sourceCode: string,
  depth: ScanDepth = 'standard',
): Promise<LlmAssessment> {
  const model = DEPTH_TO_MODEL[depth];
  return {
    confidence: 0.5,
    severity: 'medium',
    false_positive_likelihood: 0.5,
    exploitability: 'moderate',
    remediation_code: '',
    explanation: `Static finding: ${finding.type} at line ${finding.line}. LLM assessment pending (dry-run mode).`,
    model_used: model,
    cost_usd: 0,
  };
}
