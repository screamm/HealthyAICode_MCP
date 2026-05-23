// packages/core/src/security/aggregator.ts
// Aggregation layer: combines static score and LLM confidence into combined_score.
// Detects disagreement between the two layers. Sprint 28.

import type { StaticFinding, LlmAssessment, AggregatedFinding } from './types';

const STATIC_WEIGHT = 0.4;
const LLM_WEIGHT = 0.6;

const DISAGREEMENT_THRESHOLD_HIGH = 0.7;
const DISAGREEMENT_THRESHOLD_LOW = 0.3;

/**
 * Detect whether the static score and LLM confidence diverge significantly.
 *
 * Disagreement is flagged when:
 *   - static_score > 0.7 AND llm_confidence < 0.3 (static says risky, LLM disagrees)
 *   - static_score < 0.3 AND llm_confidence > 0.7 (LLM says risky, static missed it)
 */
export function detectDisagreement(static_score: number, llm_confidence: number): boolean {
  const gap = Math.abs(static_score - llm_confidence);
  if (gap < 0.4) return false;
  return (
    (static_score > DISAGREEMENT_THRESHOLD_HIGH && llm_confidence < DISAGREEMENT_THRESHOLD_LOW) ||
    (static_score < DISAGREEMENT_THRESHOLD_LOW && llm_confidence > DISAGREEMENT_THRESHOLD_HIGH)
  );
}

/**
 * Combine a StaticFinding with an LlmAssessment into an AggregatedFinding.
 *
 * Formula: combined_score = 0.4 * static_score + 0.6 * llm_confidence
 * Precision: 4 decimal places.
 */
export function aggregateFindings(
  finding: StaticFinding,
  assessment: LlmAssessment,
): AggregatedFinding {
  const combined_score = STATIC_WEIGHT * finding.static_score + LLM_WEIGHT * assessment.confidence;
  const disagreement = detectDisagreement(finding.static_score, assessment.confidence);
  return {
    ...finding,
    llm_assessment: assessment,
    combined_score: parseFloat(combined_score.toFixed(4)),
    disagreement,
    requires_manual_review: disagreement,
  };
}
