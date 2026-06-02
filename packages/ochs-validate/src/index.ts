/**
 * @package ochs-validate
 *
 * Standalone OCHS v0.1 validator. Checks an OCHS score object for:
 *   1. Structural validity (required fields, types, score range, known smell types).
 *   2. Formula consistency (reported score == max(1.0, 10 − Σ(weight × √count))).
 *
 * No runtime dependency on @healthy-ai-code/core.
 */

export {
  validateOchs,
  validateOchsJson,
  deriveScore,
  scoreToCategory,
  deriveLoopComplete,
  type OchsObject,
  type SmellFinding,
  type ValidationResult,
  type ValidateOptions,
} from './validate';

export {
  OCHS_WEIGHTS,
  OCHS_FLOOR,
  AI_READY_THRESHOLD,
  AI_READY_THRESHOLD_WITH_AI_SATD,
  HEALTHY_THRESHOLD,
  PROBLEMATIC_THRESHOLD,
  ALL_SMELL_TYPES,
} from './weights';

export {
  runConformanceSuite,
  loadOutputsFromDirectory,
  getCorpusFixtureIds,
  type ConformanceLevel,
  type AssertionStatus,
  type AssertionResult,
  type FixtureConformanceResult,
  type ConformanceSuiteResult,
  type SpecGap,
  type ConformanceOptions,
} from './conformance';
