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
import { resolveSafePath } from './path-safety';

type BenchmarkLanguage = 'typescript' | 'javascript' | 'python' | 'java';

interface BenchmarkArgs {
  modelName: string;
  generatedCode: string;
  referenceCode: string;
  filePath: string;
  language: string;
  historyPath: string;
}

/** Returns aggregated statistics for a specific model from the benchmark history. */
async function handleGetStats(modelName: string, historyPath: string) {
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

/** Runs a single benchmark comparison and persists it to the history file. */
async function handleRunBenchmark(bArgs: BenchmarkArgs) {
  const { modelName, generatedCode, referenceCode, filePath, language, historyPath } = bArgs;
  const runAnalysis = (code: string, fp: string) => {
    const result = analyzeCode(code, language as BenchmarkLanguage, fp);
    return { score: result.score, smells: result.smells.map(s => s.type) };
  };

  const entry = compareToBaseline(modelName, generatedCode, referenceCode, filePath, language, runAnalysis);
  await appendEntry(entry, historyPath);

  const updatedHistory = await loadHistory(historyPath);
  const stats = aggregateModelStats(updatedHistory.entries, modelName);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ benchmark_entry: entry, model_stats: stats, history_path: historyPath, summary: buildBenchmarkSummary(entry) }, null, 2),
    }],
  };
}

export function registerModelBenchmark(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_model_benchmark',
    {
      title: 'AI Model Quality Benchmark',
      description:
        'Compares AI-generated code against a human baseline. Calculates the delta in health metrics, ' +
        'tracks introduced smells, and stores results in a benchmark history file. ' +
        'Supports per-model statistics aggregation.',
      inputSchema: {
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
      annotations: {
        title: 'AI Model Quality Benchmark',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleModelBenchmark(args),
  );
}

async function handleModelBenchmark(
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const modelName = args['model_name'] as string;
  const customHistoryPath = args['history_path'] as string | undefined;

  try {
    // Validate a custom history path (it is read and written) before use.
    const historyPath = customHistoryPath ? resolveSafePath(customHistoryPath) : DEFAULT_HISTORY_PATH;
    if ((args['get_stats'] as boolean | undefined) ?? false) {
      return handleGetStats(modelName, historyPath);
    }

    return handleRunBenchmark({
      modelName,
      generatedCode: args['generated_code'] as string,
      referenceCode: args['reference_code'] as string,
      filePath: args['file_path'] as string,
      language: (args['language'] as string) ?? 'typescript',
      historyPath,
    });
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
  const comparison = entry.delta >= 0 ? 'meets or exceeds baseline quality' : 'falls below baseline quality';
  return `${entry.model_name} ${comparison}. `
    + `Health delta: ${sign}${entry.delta.toFixed(2)} `
    + `(AI: ${entry.health_score_ai.toFixed(1)}, baseline: ${entry.health_score_baseline.toFixed(1)}). `
    + `Smells introduced: ${entry.smells_introduced.length}, fixed: ${entry.smells_fixed.length}.`;
}
