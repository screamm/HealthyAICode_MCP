import { describe, it, expect } from 'vitest';
import { isAdvisorySmell, isSecuritySmell, isAiNativeSmell } from '../src/smell-classification';

// TidyOpportunity is a non-scored (weight 0) clean-code advisory. It must be classified as
// advisory so the gate excludes it from the regression-delta judgement (extracting a helper can
// reveal a fresh 2-chunk function — that must never be denied as a regression), and it must NOT
// be in the security or AI-native hard-deny sets.
describe('TidyOpportunity classification', () => {
  it('is advisory (excluded from the regression-delta judgement)', () => {
    expect(isAdvisorySmell('TidyOpportunity')).toBe(true);
  });

  it('is not a security smell', () => {
    expect(isSecuritySmell('TidyOpportunity')).toBe(false);
  });

  it('is not an AI-native smell', () => {
    expect(isAiNativeSmell('TidyOpportunity')).toBe(false);
  });
});
