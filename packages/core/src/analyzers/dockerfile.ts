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
      description: `${complexRunCount} RUN-instruktioner med && (gräns: ${COMPLEX_DOCKER_LAYER_THRESHOLD}) — komplexa Docker-lager försvårar caching och felsökning`,
      suggestion: 'Konsolidera relaterade RUN-instruktioner eller dela Dockerfile i multi-stage builds.',
    };
    return { ...base, smells: [...base.smells, smell] };
  }

  return base;
}
