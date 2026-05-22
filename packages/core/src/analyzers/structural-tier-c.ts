import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { detectSATDFromText } from '../smells/text-detectors';

const LARGE_FILE_THRESHOLD = 500;

/**
 * Tier C structural analyzer for config and data languages (YAML, JSON, Dockerfile, HCL, etc.).
 *
 * Returns file-level metrics only — no function-level analysis.
 * Detects: SATD comments, LargeFile smell.
 * Does not detect: cyclomatic complexity, nesting depth (not applicable at this tier).
 */
export function analyzeStructuralTierC(
  code: string,
  filePath: string,
): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const lines = code ? code.split('\n') : [];
  const totalLines = lines.length;

  const smells: Smell[] = [...detectSATDFromText(code)];

  // LargeFile smell when file exceeds threshold
  if (totalLines > LARGE_FILE_THRESHOLD) {
    smells.push({
      type: 'LargeFile',
      severity: 'medium',
      line: 1,
      description: `Filen har ${totalLines} rader (gräns: ${LARGE_FILE_THRESHOLD})`,
      suggestion: 'Dela upp filen i mindre, fokuserade konfigurationsfiler.',
    });
  }

  const metrics: MetricBreakdown = {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };

  return { functions: [], smells, metrics };
}
