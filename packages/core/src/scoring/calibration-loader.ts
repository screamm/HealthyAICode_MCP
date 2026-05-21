import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface CalibratedThresholds {
  complexMethodThreshold?: number;
  criticalComplexityThreshold?: number;
  deepNestingThreshold?: number;
  highNestingThreshold?: number;
  criticalNestingThreshold?: number;
  largeMethodLines?: number;
  longParameterList?: number;
  cognitiveComplexityThreshold?: number;
  criticalCognitiveThreshold?: number;
  bumpyRoadChunkThreshold?: number;
  chainThreshold?: number;
  booleanChainThreshold?: number;
  atfdThreshold?: number;
  wmcThreshold?: number;
  largeFileLines?: number;
}

export interface CalibratedWeights {
  [smellType: string]: number;
}

// Default thresholds matching current detector.ts constants
export const DEFAULT_THRESHOLDS: Required<CalibratedThresholds> = {
  complexMethodThreshold: 10,
  criticalComplexityThreshold: 20,
  deepNestingThreshold: 3,
  highNestingThreshold: 4,
  criticalNestingThreshold: 5,
  largeMethodLines: 50,
  longParameterList: 4,
  cognitiveComplexityThreshold: 15,
  criticalCognitiveThreshold: 25,
  bumpyRoadChunkThreshold: 4,
  chainThreshold: 4,
  booleanChainThreshold: 3,
  atfdThreshold: 5,
  wmcThreshold: 20,
  largeFileLines: 500,
};

let _cachedCalibration: { thresholds: CalibratedThresholds; weights: CalibratedWeights } | null = null;

export function loadCalibration(language: string, calibrationDir?: string): {
  thresholds: Required<CalibratedThresholds>;
  weights: CalibratedWeights;
} {
  const dir = calibrationDir ?? join(__dirname, '../../calibration');
  const calibFile = join(dir, `${language}.json`);

  if (!existsSync(calibFile)) {
    return { thresholds: DEFAULT_THRESHOLDS, weights: {} };
  }

  try {
    const data = JSON.parse(readFileSync(calibFile, 'utf8'));
    const thresholds = { ...DEFAULT_THRESHOLDS, ...data.thresholds };
    const weights = data.weights ?? {};
    _cachedCalibration = { thresholds, weights };
    return { thresholds, weights };
  } catch {
    return { thresholds: DEFAULT_THRESHOLDS, weights: {} };
  }
}

export function getThresholds(language: string, options: { useCalibratedThresholds?: boolean } = {}): Required<CalibratedThresholds> {
  if (!options.useCalibratedThresholds) return DEFAULT_THRESHOLDS;
  return loadCalibration(language).thresholds;
}
