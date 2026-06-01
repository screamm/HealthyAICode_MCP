import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildPreActPlan } from '../../src/refactor/pre-act-planner';
import { analyzeCode } from '../../src/index';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../fixtures/unhealthy/pre-act-multi-smell.ts',
);
const MULTI_SMELL_CODE = fs.readFileSync(FIXTURE_PATH, 'utf-8');

describe('buildPreActPlan', () => {
  it('emits >= 3 steps for the multi-smell fixture', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('leads with the heaviest structural smell (ComplexMethod or BrainMethod)', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    expect(['ComplexMethod', 'BrainMethod']).toContain(plan.steps[0].smellType);
  });

  it('sorts steps by descending marginalDelta', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i - 1].marginalDelta).toBeGreaterThanOrEqual(plan.steps[i].marginalDelta);
    }
  });

  it('reports a primarySmellType matching the heaviest actionable type', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    expect(['ComplexMethod', 'BrainMethod']).toContain(plan.primarySmellType);
  });

  it('attaches a non-empty rationale and a strategy to each step', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    for (const step of plan.steps) {
      expect(step.rationale.length).toBeGreaterThan(0);
      expect(step.strategy.length).toBeGreaterThan(0);
      expect(step.marginalDelta).toBeGreaterThan(0);
    }
  });

  it('totalPredictedDelta equals the sum of step deltas', () => {
    const plan = buildPreActPlan(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    const sum = plan.steps.reduce((acc, s) => acc + s.marginalDelta, 0);
    expect(plan.totalPredictedDelta).toBeCloseTo(sum, 6);
  });

  it('produces an empty plan for a clean file', () => {
    const clean = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
    const plan = buildPreActPlan(clean, 'typescript', 'clean.ts');
    expect(plan.steps.length).toBe(0);
    expect(plan.totalPredictedDelta).toBe(0);
  });

  it('keeps the fixture well below the AI-ready threshold (sanity check)', () => {
    const health = analyzeCode(MULTI_SMELL_CODE, 'typescript', FIXTURE_PATH);
    expect(health.score).toBeLessThanOrEqual(7.0);
  });
});
