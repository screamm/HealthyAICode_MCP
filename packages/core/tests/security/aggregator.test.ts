// packages/core/tests/security/aggregator.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateFindings, detectDisagreement } from '../../src/security/aggregator';
import type { StaticFinding, LlmAssessment } from '../../src/security/types';

const baseFinding: StaticFinding = {
  type: 'SqlInjectionRisk',
  line: 10,
  column: 5,
  endLine: 10,
  endColumn: 50,
  filePath: 'src/db.ts',
  codeSnippet: 'db.query(...)',
  static_score: 0.85,
};

const highConfidenceAssessment: LlmAssessment = {
  confidence: 0.92,
  severity: 'high',
  false_positive_likelihood: 0.08,
  exploitability: 'trivial',
  remediation_code: "db.query('SELECT * FROM users WHERE id = $1', [id])",
  explanation: 'SQL injection risk via string concatenation.',
  model_used: 'claude-haiku-4-5',
  cost_usd: 0.0003,
};

describe('aggregateFindings', () => {
  it('computes combined_score correctly (0.4 * static + 0.6 * llm)', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    const expected = 0.4 * 0.85 + 0.6 * 0.92;
    expect(result.combined_score).toBeCloseTo(expected, 4);
  });

  it('sets disagreement=false and requires_manual_review=false for consistent scores', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    expect(result.disagreement).toBe(false);
    expect(result.requires_manual_review).toBe(false);
  });

  it('sets disagreement=true when static is high and LLM confidence is low', () => {
    const lowConfidenceAssessment = { ...highConfidenceAssessment, confidence: 0.2 };
    const result = aggregateFindings(baseFinding, lowConfidenceAssessment);
    expect(result.disagreement).toBe(true);
    expect(result.requires_manual_review).toBe(true);
  });

  it('preserves all StaticFinding fields', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    expect(result.type).toBe(baseFinding.type);
    expect(result.line).toBe(baseFinding.line);
    expect(result.filePath).toBe(baseFinding.filePath);
    expect(result.static_score).toBe(baseFinding.static_score);
  });

  it('attaches the llm_assessment to the result', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    expect(result.llm_assessment).toBe(highConfidenceAssessment);
  });
});

describe('detectDisagreement', () => {
  it('returns true for high static + low LLM (> 0.7 / < 0.3)', () => {
    expect(detectDisagreement(0.8, 0.2)).toBe(true);
  });

  it('returns true for low static + high LLM (< 0.3 / > 0.7)', () => {
    expect(detectDisagreement(0.2, 0.8)).toBe(true);
  });

  it('returns false for consistent values', () => {
    expect(detectDisagreement(0.8, 0.85)).toBe(false);
  });

  it('returns false when gap is less than 0.4', () => {
    expect(detectDisagreement(0.7, 0.35)).toBe(false);
  });

  it('returns false for two similar mid-range values', () => {
    expect(detectDisagreement(0.5, 0.55)).toBe(false);
  });
});
