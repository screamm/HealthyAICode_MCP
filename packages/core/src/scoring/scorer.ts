import type { Smell, HealthCategory, SmellType } from '../types';
import {
  SMELL_WEIGHTS,
  SMELL_MAX_DEDUCTION,
  HEALTHY_THRESHOLD,
  PROBLEMATIC_THRESHOLD,
} from './weights';

export function calculateScore(smells: Smell[]): number {
  let score = 10.0;

  const countsByType = new Map<SmellType, number>();
  for (const smell of smells) {
    countsByType.set(smell.type, (countsByType.get(smell.type) ?? 0) + 1);
  }

  for (const [type, count] of countsByType) {
    const weight = SMELL_WEIGHTS[type];
    const deduction = Math.min(weight * count, SMELL_MAX_DEDUCTION);
    score -= deduction;
  }

  return Math.max(1.0, parseFloat(score.toFixed(1)));
}

export function categorize(score: number): HealthCategory {
  if (score >= HEALTHY_THRESHOLD) return 'green';
  if (score >= PROBLEMATIC_THRESHOLD) return 'yellow';
  return 'red';
}
