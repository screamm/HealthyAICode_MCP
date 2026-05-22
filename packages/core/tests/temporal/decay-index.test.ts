// packages/core/tests/temporal/decay-index.test.ts
import { describe, it, expect } from 'vitest';
import { computeArchitecturalDecayIndex } from '../../src/temporal/decay-index';

// All tests inject pre-computed values to avoid git calls.
// Injecting all 5 dimensions bypasses git entirely.

describe('computeArchitecturalDecayIndex — unit tests', () => {
  it('perfect file (no slope, no churn, no coupling, full docs, full tests) gives ADI near 0', async () => {
    const result = await computeArchitecturalDecayIndex('unused', 'unused.ts', {
      complexitySlope: 0,
      churnPerDay: 0,
      strongCouplings: 0,
      docScore: 0,     // 0 = good documentation
      testScore: 10,   // 10 = great test coverage
    });
    // complexityTrend: 0 * 0.35 = 0
    // churnRate:       0 * 0.25 = 0
    // couplingDensity: 0 * 0.20 = 0
    // docCoverage:     0 * 0.10 = 0
    // testProximity:   (10-10) * 0.10 = 0
    expect(result.adi).toBeCloseTo(0, 1);
    expect(result.classification).toBe('healthy');
  });

  it('worst-case file gives ADI near 10', async () => {
    const result = await computeArchitecturalDecayIndex('unused', 'bad.ts', {
      complexitySlope: 1.0,   // score = clamp(1.0 * 10, 0, 10) = 10
      churnPerDay: 500,       // score = clamp(500/50 * 10, 0, 10) = 10
      strongCouplings: 5,     // score = clamp(5 * 2, 0, 10) = 10
      docScore: 10,           // score = 10
      testScore: 0,           // score = inverted = 10
    });
    // ADI = 10*0.35 + 10*0.25 + 10*0.20 + 10*0.10 + 10*0.10 = 10
    expect(result.adi).toBeCloseTo(10, 1);
    expect(result.classification).toBe('critical');
  });

  it('ADI is in [0, 10] for all reasonable inputs', async () => {
    for (const slope of [0, 0.5, 1.0, 2.0]) {
      const result = await computeArchitecturalDecayIndex('unused', 'test.ts', {
        complexitySlope: slope,
        churnPerDay: slope * 100,
        strongCouplings: Math.floor(slope * 3),
        docScore: Math.min(slope * 5, 10),
        testScore: Math.max(10 - slope * 5, 0),
      });
      expect(result.adi).toBeGreaterThanOrEqual(0);
      expect(result.adi).toBeLessThanOrEqual(10.001);
    }
  });

  it('classification boundaries are correct', async () => {
    const healthy = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 0, churnPerDay: 0, strongCouplings: 0, docScore: 0, testScore: 10,
    });
    expect(healthy.classification).toBe('healthy');

    // Target warning zone (ADI ~4): moderate slope gives ~3.5 + small churn
    const warning = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 0.4,   // 0.4 * 10 * 0.35 = 1.4
      churnPerDay: 25,        // 25/50 * 10 * 0.25 = 1.25
      strongCouplings: 2,     // 2*2 * 0.20 = 0.8
      docScore: 5,            // 5 * 0.10 = 0.5
      testScore: 5,           // inverted=5 * 0.10 = 0.5 → total ~4.45
    });
    expect(['warning', 'high_risk']).toContain(warning.classification);

    const critical = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 1.0, churnPerDay: 500, strongCouplings: 5, docScore: 10, testScore: 0,
    });
    expect(critical.classification).toBe('critical');
  });

  it('dimensions have correct labels', async () => {
    const result = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 0, churnPerDay: 0, strongCouplings: 0, docScore: 0, testScore: 10,
    });
    expect(result.dimensions.complexityTrend.label).toBe('Complexity Trend');
    expect(result.dimensions.churnRate.label).toBe('Churn Rate');
    expect(result.dimensions.couplingDensity.label).toBe('Coupling Density');
    expect(result.dimensions.docCoverage.label).toBe('Documentation Coverage');
    expect(result.dimensions.testProximity.label).toBe('Test Proximity');
  });

  it('each dimension score is in [0, 10]', async () => {
    const result = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 0.5, churnPerDay: 30, strongCouplings: 2, docScore: 7, testScore: 4,
    });
    for (const dim of Object.values(result.dimensions)) {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(10);
    }
  });

  it('negative complexity slope does not contribute to decay (clamped to 0)', async () => {
    const declining = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: -1.0, // should be clamped to 0 contribution
      churnPerDay: 0,
      strongCouplings: 0,
      docScore: 0,
      testScore: 10,
    });
    // complexityTrend score: clamp(-1.0 * 10, 0, 10) = 0
    expect(declining.dimensions.complexityTrend.score).toBe(0);
    expect(declining.adi).toBeCloseTo(0, 1);
  });

  it('evidence strings are populated', async () => {
    const result = await computeArchitecturalDecayIndex('u', 'f.ts', {
      complexitySlope: 0.5, churnPerDay: 30, strongCouplings: 1, docScore: 8, testScore: 2,
    });
    for (const dim of Object.values(result.dimensions)) {
      expect(typeof dim.evidence).toBe('string');
      expect(dim.evidence.length).toBeGreaterThan(0);
    }
  });
});
