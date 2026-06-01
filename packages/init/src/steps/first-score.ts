/**
 * Step: run a first health score on the current working directory.
 *
 * Selects up to 5 TypeScript/JavaScript/Python/Java files in the cwd
 * (deterministic: sorted by relative path, shallowest-first) and scores each.
 * Returns a summary without emitting source code — only the numeric scores
 * and category bands.
 *
 * Uses @healthy-ai-code/core's analyzeFile() directly (no MCP round-trip)
 * so it works offline and in CI before the MCP server is registered.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileSummary {
  /** Relative path from cwd — never an absolute path. */
  relativePath: string;
  score: number;
  category: 'green' | 'yellow' | 'red';
  smellCount: number;
}

export interface FirstScoreResult {
  files: FileSummary[];
  averageScore: number;
  overallBand: 'green' | 'yellow' | 'red';
  elapsedMs: number;
  /** How many source files were found before we capped at MAX_FILES. */
  totalFound: number;
}

const MAX_FILES = 5;
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.java']);

/** Finds source files in `dir` up to `limit`, sorted by path depth then name. */
function findSourceFiles(dir: string, limit: number): string[] {
  const results: string[] = [];
  const queue = [dir];

  while (queue.length > 0 && results.length < limit * 4) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    // Sort: files first (by name), then dirs — gives shallowest results first.
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isFile() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  return results.slice(0, limit);
}

function band(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 9.0) return 'green';
  if (score >= 6.0) return 'yellow';
  return 'red';
}

export async function runFirstScore(opts: {
  cwd?: string;
}): Promise<FirstScoreResult> {
  const cwd = opts.cwd ?? process.cwd();
  const startMs = Date.now();

  // Dynamic import so the heavy tree-sitter binaries load only when needed.
  // Wrapped in try/catch so a native binding incompatibility (e.g. tree-sitter
  // ESM-only binding on Node 24 CJS interop) returns an empty result rather
  // than throwing, keeping the installer resilient.
  type AnalyzeFn = (filePath: string) => Promise<{ score: number; smells: unknown[] }>;
  let analyzeFile: AnalyzeFn | null = null;
  try {
    const core = await import('@healthy-ai-code/core');
    analyzeFile = core.analyzeFile as AnalyzeFn;
  } catch {
    // Native bindings unavailable — return empty result.
    return {
      files: [],
      averageScore: 10,
      overallBand: 'green',
      elapsedMs: Date.now() - startMs,
      totalFound: 0,
    };
  }

  const allFiles = findSourceFiles(cwd, MAX_FILES * 8);
  const totalFound = allFiles.length;
  const selected = allFiles.slice(0, MAX_FILES);

  const summaries: FileSummary[] = [];

  for (const absPath of selected) {
    try {
      const result = await analyzeFile!(absPath);
      summaries.push({
        relativePath: path.relative(cwd, absPath),
        score: result.score,
        category: band(result.score),
        smellCount: result.smells.length,
      });
    } catch {
      // Skip unreadable / unsupported files silently.
    }
  }

  const elapsedMs = Date.now() - startMs;

  if (summaries.length === 0) {
    return {
      files: [],
      averageScore: 10,
      overallBand: 'green',
      elapsedMs,
      totalFound,
    };
  }

  const averageScore =
    summaries.reduce((acc, f) => acc + f.score, 0) / summaries.length;

  return {
    files: summaries,
    averageScore,
    overallBand: band(averageScore),
    elapsedMs,
    totalFound,
  };
}
