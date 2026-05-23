// packages/core/src/ai-audit/benchmark-store.ts
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { BenchmarkHistory, BenchmarkEntry } from './types';

export const DEFAULT_HISTORY_PATH = path.resolve(
  __dirname, '../../../../benchmarks/ai-model-quality-history.json',
);

export async function loadHistory(historyPath = DEFAULT_HISTORY_PATH): Promise<BenchmarkHistory> {
  try {
    const raw = await fsp.readFile(historyPath, 'utf-8');
    return JSON.parse(raw) as BenchmarkHistory;
  } catch {
    return { schema_version: '1.0', entries: [] };
  }
}

export async function appendEntry(
  entry: BenchmarkEntry,
  historyPath = DEFAULT_HISTORY_PATH,
): Promise<void> {
  const history = await loadHistory(historyPath);
  history.entries.push(entry);
  await fsp.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

export async function getModelStats(
  modelName: string,
  historyPath = DEFAULT_HISTORY_PATH,
): Promise<BenchmarkEntry[]> {
  const history = await loadHistory(historyPath);
  return history.entries.filter(e => e.model_name === modelName);
}
