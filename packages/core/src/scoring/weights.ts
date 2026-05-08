import type { SmellType } from '../types';

export const SMELL_WEIGHTS: Record<SmellType, number> = {
  ComplexMethod: 1.5,
  DeepNesting: 1.2,
  BumpyRoad: 0.8,
  LargeMethod: 0.6,
  ComplexConditional: 0.5,
  LongParameterList: 0.4,
  LargeFile: 0.3,
};

export const SMELL_MAX_DEDUCTION = 3.0;
export const AI_READY_THRESHOLD = 9.5;
export const HEALTHY_THRESHOLD = 9.0;
export const PROBLEMATIC_THRESHOLD = 4.0;
