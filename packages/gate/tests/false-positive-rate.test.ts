/**
 * False-positive-rate measurement for the delta gate.
 *
 * The gate is only useful if developers leave it on. The fastest way to make a
 * gate get disabled "on day one" is for it to block benign edits. This suite
 * runs a corpus of ~30 realistic BENIGN edits (renames, added pure functions,
 * doc additions, harmless refactors, formatting, type annotations, import
 * reorders, across TypeScript / JavaScript / Python / Java / Go) through the
 * real `evaluateGate` and asserts:
 *
 *   1. The measured false-positive rate (benign edits denied) is < 5%.
 *   2. As a negative control, the genuinely-bad corpus is still fully denied —
 *      proving the low FP rate is not achieved by neutering the gate.
 *
 * The rate is computed and printed so the measured number is visible in CI
 * output and can be pasted into the acceptance evidence. No fabricated numbers:
 * the assertion runs the same code path the production hook runs.
 */
import { describe, it, expect } from 'vitest';
import { evaluateGate } from '../src/evaluate-gate';
import { BENIGN_EDITS } from './fixtures/benign-edits';
import { MALICIOUS_EDITS } from './fixtures/malicious-edits';

/** Acceptance target from the gate-harden task. */
const MAX_FALSE_POSITIVE_RATE = 0.05;

describe('gate false-positive rate (benign corpus)', () => {
  it(`denies < ${MAX_FALSE_POSITIVE_RATE * 100}% of benign edits`, () => {
    const total = BENIGN_EDITS.length;
    const falsePositives = BENIGN_EDITS.filter((e) => {
      const decision = evaluateGate({
        filePath: e.filePath,
        before: e.before,
        after: e.after,
        language: e.language,
      });
      return decision.verdict === 'deny';
    });

    const rate = falsePositives.length / total;

    // Visible, non-fabricated measurement.
    // eslint-disable-next-line no-console
    console.log(
      `[gate FP measurement] benign edits: ${total}, ` +
        `false positives (denied): ${falsePositives.length}, ` +
        `FP rate: ${(rate * 100).toFixed(2)}%` +
        (falsePositives.length > 0
          ? ` — offenders: ${falsePositives.map((e) => e.id).join(', ')}`
          : ''),
    );

    expect(total).toBeGreaterThanOrEqual(20); // corpus must be large enough to be meaningful
    expect(rate).toBeLessThan(MAX_FALSE_POSITIVE_RATE);
  });

  it('reports FP rate per category (diagnostic, no offenders expected)', () => {
    const byCategory = new Map<string, { total: number; denied: number }>();
    for (const e of BENIGN_EDITS) {
      const bucket = byCategory.get(e.category) ?? { total: 0, denied: 0 };
      bucket.total += 1;
      const decision = evaluateGate({
        filePath: e.filePath,
        before: e.before,
        after: e.after,
        language: e.language,
      });
      if (decision.verdict === 'deny') bucket.denied += 1;
      byCategory.set(e.category, bucket);
    }
    for (const [category, { total, denied }] of byCategory) {
      // eslint-disable-next-line no-console
      console.log(`[gate FP by category] ${category}: ${denied}/${total} denied`);
      expect(denied).toBe(0);
    }
  });
});

describe('negative control: genuinely-bad corpus is still fully denied', () => {
  it('denies every malicious edit (gate is not neutered)', () => {
    for (const e of MALICIOUS_EDITS) {
      const decision = evaluateGate({
        filePath: e.filePath,
        before: e.before,
        after: e.after,
        language: e.language,
      });
      expect(decision.verdict, `${e.id} should be denied`).toBe('deny');
    }
  });

  it('each malicious edit is denied for the expected reason', () => {
    for (const e of MALICIOUS_EDITS) {
      const decision = evaluateGate({
        filePath: e.filePath,
        before: e.before,
        after: e.after,
        language: e.language,
      });
      // below_floor and score_regression are interchangeable for the
      // complexity case (both mean "this edit makes the file materially worse"),
      // so accept either when the fixture expects one of them.
      const acceptable =
        e.expectedReason === 'score_regression' || e.expectedReason === 'below_floor'
          ? ['score_regression', 'below_floor']
          : [e.expectedReason];
      expect(acceptable, `${e.id} reason`).toContain(decision.reasonCode);
    }
  });
});
