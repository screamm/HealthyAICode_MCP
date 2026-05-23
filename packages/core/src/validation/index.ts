/** Validation utilities: correlation metrics, dataset runner, and benchmark loaders. */
export { pearsonCorrelation, spearmanCorrelation, computeAUROC } from './correlation';
export type { BugRecord, ValidationReport } from './dataset-runner';
export { runValidation, buildRecordsFromDirectory } from './dataset-runner';
export type { Defects4JEntry } from './defects4j-loader';
export { loadDefects4JFromJson, createSyntheticBenchmark } from './defects4j-loader';
