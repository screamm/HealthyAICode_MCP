import type { Smell } from '../types';
import { analyzeStructuralTierC } from './structural-tier-c';

/**
 * Counts RUN instructions that chain multiple commands with &&.
 * Each such instruction adds complexity to the Docker layer.
 */
function countComplexRunLayers(code: string): number {
  return (code.match(/^\s*RUN\b.*&&/gm) ?? []).length;
}

const COMPLEX_DOCKER_LAYER_THRESHOLD = 5;

/**
 * Tier C Dockerfile analyzer.
 * Extends the structural base with a Dockerfile-specific check:
 * flags ComplexMethod when more than 5 RUN instructions use command chaining (&&).
 * Each chained RUN layer is harder to cache and debug.
 */
export function analyzeDockerfile(code: string, filePath = '<inline>') {
  const base = analyzeStructuralTierC(code, filePath);

  const complexRunCount = countComplexRunLayers(code);
  if (complexRunCount > COMPLEX_DOCKER_LAYER_THRESHOLD) {
    const smell: Smell = {
      type: 'ComplexMethod',
      severity: 'medium',
      line: 1,
      description: `${complexRunCount} RUN instructions with && (limit: ${COMPLEX_DOCKER_LAYER_THRESHOLD}) — complex Docker layers make caching and debugging harder`,
      suggestion: 'Consolidate related RUN instructions or split the Dockerfile into multi-stage builds.',
    };
    return { ...base, smells: [...base.smells, smell] };
  }

  return base;
}
