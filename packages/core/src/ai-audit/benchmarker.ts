// packages/core/src/ai-audit/benchmarker.ts
import type { BenchmarkEntry, ModelStats } from './types';
import { mean, stddev, topN } from './statistics';

/**
 * Compares AI-generated code against a reference/baseline by running a
 * caller-supplied analysis function on each. Returns a BenchmarkEntry
 * capturing the delta and newly introduced/fixed smells.
 *
 * The `runAnalysis` parameter is intentionally injectable so tests can supply
 * a mock without needing to spin up the full analysis pipeline.
 */
export function compareToBaseline(
  modelName: string,
  aiCode: string,
  referenceCode: string,
  filePath: string,
  language: string,
  runAnalysis: (code: string, filePath: string) => { score: number; smells: string[] },
): BenchmarkEntry {
  const aiResult = runAnalysis(aiCode, filePath);
  const baselineResult = runAnalysis(referenceCode, filePath);

  return {
    timestamp: new Date().toISOString(),
    model_name: modelName,
    file_path: filePath,
    language,
    health_score_ai: aiResult.score,
    health_score_baseline: baselineResult.score,
    delta: aiResult.score - baselineResult.score,
    smells_introduced: aiResult.smells.filter(s => !baselineResult.smells.includes(s)),
    smells_fixed: baselineResult.smells.filter(s => !aiResult.smells.includes(s)),
    ai_specific_smells: [],
    confidence_ai_generated: 0,
  };
}

/**
 * Aggregates all benchmark entries for a specific model into summary statistics.
 */
export function aggregateModelStats(entries: BenchmarkEntry[], modelName: string): ModelStats {
  const modelEntries = entries.filter(e => e.model_name === modelName);
  const n = modelEntries.length;

  if (n === 0) {
    return {
      model_name: modelName,
      total_scans: 0,
      avg_delta: 0,
      std_delta: 0,
      avg_health_score: 0,
      most_common_smells: [],
      baseline_pass_rate: 0,
    };
  }

  const deltas = modelEntries.map(e => e.delta);
  const allIntroduced = modelEntries.flatMap(e => e.smells_introduced);

  return {
    model_name: modelName,
    total_scans: n,
    avg_delta: mean(deltas),
    std_delta: stddev(deltas),
    avg_health_score: mean(modelEntries.map(e => e.health_score_ai)),
    most_common_smells: topN(allIntroduced, 5).map(({ item, count }) => ({ smell: item, count })),
    baseline_pass_rate: modelEntries.filter(e => e.delta >= 0).length / n,
  };
}
