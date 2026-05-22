import type { Smell, HealthCategory, SmellType } from '../types';
import {
  SMELL_WEIGHTS,
  HEALTHY_THRESHOLD,
  PROBLEMATIC_THRESHOLD,
} from './weights';
import { getWeights } from './calibration-loader';
import { getConfig } from '../config';

/** Calculates the numeric health score (1.0–10.0) using progressive sqrt penalty per smell type. */
export function calculateScore(smells: Smell[], language = 'typescript'): number {
  const { useCalibratedThresholds } = getConfig();
  const calibratedWeights = getWeights(language, { useCalibratedThresholds });

  let score = 10.0;

  const countsByType = new Map<SmellType, number>();
  for (const smell of smells) {
    countsByType.set(smell.type, (countsByType.get(smell.type) ?? 0) + 1);
  }

  for (const [type, count] of countsByType) {
    // Use calibrated weight if available, otherwise fall back to the static SMELL_WEIGHTS table.
    const weight = calibratedWeights[type] ?? SMELL_WEIGHTS[type];
    score -= weight * Math.sqrt(count);
  }

  return Math.max(1.0, parseFloat(score.toFixed(1)));
}

/** Maps a numeric score to a named health category (green/yellow/red). */
export function categorize(score: number): HealthCategory {
  if (score >= HEALTHY_THRESHOLD) return 'green';
  if (score >= PROBLEMATIC_THRESHOLD) return 'yellow';
  return 'red';
}
