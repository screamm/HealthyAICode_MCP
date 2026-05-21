import { describe, it, expect } from 'vitest';
import { getThresholds, DEFAULT_THRESHOLDS } from '../../src/scoring/calibration-loader';

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
