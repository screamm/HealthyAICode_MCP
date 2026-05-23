// packages/mcp-server/src/tools/model-benchmark.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  analyzeCode,
  compareToBaseline,
  aggregateModelStats,
  loadHistory,
  appendEntry,
  getModelStats,
  DEFAULT_HISTORY_PATH,
} from '@healthy-ai-code/core';
import type { BenchmarkEntry } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerModelBenchmark(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_model_benchmark',
    'Compares AI-generated code against a human baseline. '
    + 'Calculates delta in health metrics, tracks introduced smells and '
    + 'stores results in benchmark history. Supports per-model statistics aggregation.',
    {
      model_name: z.string().describe('AI model name, e.g. "claude-sonnet-4-6"'),
      generated_code: z.string().describe('The AI-generated code to evaluate'),
      reference_code: z.string().describe('Human-written reference code (baseline)'),
      file_path: z.string().describe('Reference path for history file metadata'),
      language: z.enum(['typescript', 'javascript', 'python', 'java']),
      get_stats: z.boolean().default(false)
        .describe('If true: return aggregated statistics for the model instead of a single benchmark'),
      history_path: z.string().optional()
        .describe('Custom path to history file (default: benchmarks/ai-model-quality-history.json)'),
    },
    async (args) => handleModelBenchmark(args),
  );
}

async function handleModelBenchmark(
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const modelName = args.model_name as string;
  const generatedCode = args.generated_code as string;
  const referenceCode = args.reference_code as string;
  const filePath = args.file_path as string;
  const language = (args.language as string) ?? 'typescript';
  const getStats = (args.get_stats as boolean | undefined) ?? false;
  const historyPath = (args.history_path as string | undefined) ?? DEFAULT_HISTORY_PATH;

  try {
    if (getStats) {
      // Return aggregated model stats
      const entries = await getModelStats(modelName, historyPath);
      const history = await loadHistory(historyPath);
      const stats = aggregateModelStats(history.entries, modelName);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ model_name: modelName, stats, total_entries: entries.length }, null, 2),
        }],
      };
    }

    // Run benchmark comparison
    const runAnalysis = (code: string, fp: string) => {
      const result = analyzeCode(
        code,
        language as 'typescript' | 'javascript' | 'python' | 'java',
        fp,
      );
      return {
        score: result.score,
        smells: result.smells.map(s => s.type),
      };
    };

    const entry = compareToBaseline(
      modelName,
      generatedCode,
      referenceCode,
      filePath,
      language,
      runAnalysis,
    );

    // Persist to history
    await appendEntry(entry, historyPath);

    // Load updated aggregates for response
    const updatedHistory = await loadHistory(historyPath);
    const stats = aggregateModelStats(updatedHistory.entries, modelName);

    const result = {
      benchmark_entry: entry,
      model_stats: stats,
      history_path: historyPath,
      summary: buildBenchmarkSummary(entry),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, model_name: modelName }) }],
      isError: true,
    };
  }
}

function buildBenchmarkSummary(entry: BenchmarkEntry): string {
  const sign = entry.delta >= 0 ? '+' : '';
  const comparison = entry.delta >= 0
    ? 'meets or exceeds baseline quality'
    : 'falls below baseline quality';
  return `${entry.model_name} ${comparison}. `
    + `Health delta: ${sign}${entry.delta.toFixed(2)} `
    + `(AI: ${entry.health_score_ai.toFixed(1)}, baseline: ${entry.health_score_baseline.toFixed(1)}). `
    + `Smells introduced: ${entry.smells_introduced.length}, fixed: ${entry.smells_fixed.length}.`;
}
