import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { batchTopSmellType } from '../../src/refactor/smell-batcher';
import { analyzeCode } from '../../src/index';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../fixtures/unhealthy/batch-same-type.ts',
);
const BATCH_CODE = fs.readFileSync(FIXTURE_PATH, 'utf-8');

function analyze() {
  return analyzeCode(BATCH_CODE, 'typescript', FIXTURE_PATH);
}

describe('batchTopSmellType', () => {
  it('batches all 4 DeepNesting instances of the dominant type', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    expect(plan.smellType).toBe('DeepNesting');
    expect(plan.instances.length).toBe(4);
  });

  it('ranks instances by descending marginalDelta', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    expect(plan.instances[0].marginalDelta).toBeGreaterThan(
      plan.instances[3].marginalDelta,
    );
    for (let i = 1; i < plan.instances.length; i++) {
      expect(plan.instances[i - 1].marginalDelta).toBeGreaterThanOrEqual(
        plan.instances[i].marginalDelta,
      );
    }
  });

  it('assigns sequential 1-based ranks after sorting', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    plan.instances.forEach((instance, index) => {
      expect(instance.rank).toBe(index + 1);
    });
  });

  it('first instance recovers the full type weight (rank 1 marginal delta)', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    // DeepNesting weight is 1.2; rank-1 marginal delta = 1.2 × (√1 − √0) = 1.2.
    expect(plan.instances[0].marginalDelta).toBeCloseTo(1.2, 5);
  });

  it('totalPredictedDelta equals weight × √count', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    expect(plan.totalPredictedDelta).toBeCloseTo(1.2 * Math.sqrt(4), 5);
  });

  it('resolves a function for each batched instance', () => {
    const { smells, functions } = analyze();
    const plan = batchTopSmellType(smells, functions);
    const resolved = plan.instances.filter(i => i.fn !== null);
    expect(resolved.length).toBe(4);
  });

  it('returns an empty plan when there are no smells', () => {
    const plan = batchTopSmellType([], []);
    expect(plan.instances.length).toBe(0);
    expect(plan.totalPredictedDelta).toBe(0);
  });
});
