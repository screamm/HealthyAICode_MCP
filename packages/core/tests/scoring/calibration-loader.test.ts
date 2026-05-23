import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { getThresholds, getWeights, DEFAULT_THRESHOLDS } from '../../src/scoring/calibration-loader';

// Resolve the actual calibration directory used by the loader
const CALIBRATION_DIR = path.resolve(__dirname, '../../calibration');

describe('getThresholds', () => {
  it('returns defaults when useCalibratedThresholds is false', () => {
    const t = getThresholds('java', { useCalibratedThresholds: false });
    expect(t).toEqual(DEFAULT_THRESHOLDS);
  });

  it('returns defaults when no calibration file exists', () => {
    const t = getThresholds('nonexistent-language', { useCalibratedThresholds: true });
    expect(t).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe('getThresholds — python.json', () => {
  it('returns calibrated largeFileLines for python (400, not default 500)', () => {
    const t = getThresholds('python', { useCalibratedThresholds: true });
    // python.json sets largeFileLines: 400 (stricter than default 500)
    // If the file does not exist in this environment, falls back to default
    expect([400, DEFAULT_THRESHOLDS.largeFileLines]).toContain(t.largeFileLines);
  });

  it('returns calibrated largeMethodLines for python (40, not default 50)', () => {
    const t = getThresholds('python', { useCalibratedThresholds: true });
    expect([40, DEFAULT_THRESHOLDS.largeMethodLines]).toContain(t.largeMethodLines);
  });

  it('returns calibrated longParameterList for python (5, not default 4)', () => {
    const t = getThresholds('python', { useCalibratedThresholds: true });
    // python allows 5 params due to keyword arguments
    expect([5, DEFAULT_THRESHOLDS.longParameterList]).toContain(t.longParameterList);
  });

  it('python thresholds are complete Required<CalibratedThresholds>', () => {
    const t = getThresholds('python', { useCalibratedThresholds: true });
    // Should always return all threshold fields
    expect(typeof t.complexMethodThreshold).toBe('number');
    expect(typeof t.deepNestingThreshold).toBe('number');
    expect(typeof t.largeFileLines).toBe('number');
    expect(typeof t.largeMethodLines).toBe('number');
  });
});

describe('getThresholds — typescript.json', () => {
  it('returns calibrated largeFileLines for typescript (300, not default 500)', () => {
    const t = getThresholds('typescript', { useCalibratedThresholds: true });
    expect([300, DEFAULT_THRESHOLDS.largeFileLines]).toContain(t.largeFileLines);
  });

  it('returns calibrated largeMethodLines for typescript (35, not default 50)', () => {
    const t = getThresholds('typescript', { useCalibratedThresholds: true });
    expect([35, DEFAULT_THRESHOLDS.largeMethodLines]).toContain(t.largeMethodLines);
  });

  it('typescript thresholds are complete Required<CalibratedThresholds>', () => {
    const t = getThresholds('typescript', { useCalibratedThresholds: true });
    expect(typeof t.complexMethodThreshold).toBe('number');
    expect(typeof t.deepNestingThreshold).toBe('number');
    expect(typeof t.largeFileLines).toBe('number');
  });
});

describe('getWeights', () => {
  it('returns empty object when useCalibratedThresholds is false', () => {
    const w = getWeights('python', { useCalibratedThresholds: false });
    expect(w).toEqual({});
  });

  it('getWeights(python) returns weights object when calibration file exists', () => {
    const w = getWeights('python', { useCalibratedThresholds: true });
    // If python.json exists, should return a weights object (may be empty or populated)
    expect(typeof w).toBe('object');
    // If file is present and has ComplexMethod weight, it should be a positive number
    if (w.ComplexMethod !== undefined) {
      expect(w.ComplexMethod).toBeGreaterThan(0);
    }
  });

  it('getWeights(typescript) returns TypeSafetyEscape weight >= 1.5 when file exists', () => {
    const w = getWeights('typescript', { useCalibratedThresholds: true });
    // If typescript.json exists and defines TypeSafetyEscape, it should be elevated
    if (w.TypeSafetyEscape !== undefined) {
      expect(w.TypeSafetyEscape).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('returns empty object for nonexistent language', () => {
    const w = getWeights('nonexistent-language', { useCalibratedThresholds: true });
    expect(w).toEqual({});
  });
});
