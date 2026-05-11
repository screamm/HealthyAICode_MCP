import fg from 'fast-glob';
import * as path from 'path';
import { analyzeFile } from '..';
import type { HealthResult } from '../types';
import { detectDuplications } from './duplication';
import { detectLanguageMix } from './language-mix';
import { detectDeadExports } from './dead-exports';

export interface DuplicationFinding {
  filePathA: string;
  filePathB: string;
  startLineA: number;
  startLineB: number;
  tokenCount: number;
  similarity: number;       // 0.0–1.0
  severity: 'low' | 'medium' | 'high';
}

export interface LanguageMixFinding {
  filePath: string;
  primaryLanguage: 'sv' | 'en' | 'unknown';
  mixedRegions: Array<{ line: number; detected: string; snippet: string }>;
}

export interface DeadExportFinding {
  filePath: string;
  exportedName: string;
  line: number;
}

export interface ProjectAnalysisOptions {
  rootPath: string;
  include?: string[];       // glob patterns, default ['**/*.ts', '**/*.tsx']
  exclude?: string[];       // default ['node_modules/**', 'dist/**', '**/*.test.ts']
  cacheDir?: string;        // default <root>/.healthy-ai-cache/
}

export interface ProjectAnalysisResult {
  filesAnalyzed: number;
  duplicationFindings: DuplicationFinding[];
  languageMixFindings: LanguageMixFinding[];
  deadExportFindings: DeadExportFinding[];
  perFileResults: HealthResult[];
}

const DEFAULT_INCLUDE = ['**/*.ts', '**/*.tsx'];
const DEFAULT_EXCLUDE = ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.d.ts'];

export async function analyzeProject(opts: ProjectAnalysisOptions): Promise<ProjectAnalysisResult> {
  const root = path.resolve(opts.rootPath);
  const files = await discoverFiles(root, opts);

  const perFileResults: HealthResult[] = [];
  for (const file of files) {
    perFileResults.push(await analyzeFile(file));
  }

  return {
    filesAnalyzed: files.length,
    duplicationFindings: await detectDuplications(files),
    languageMixFindings: await detectLanguageMix(files),
    deadExportFindings: await detectDeadExports(files),
    perFileResults,
  };
}

async function discoverFiles(root: string, opts: ProjectAnalysisOptions): Promise<string[]> {
  return fg(opts.include ?? DEFAULT_INCLUDE, {
    cwd: root,
    ignore: opts.exclude ?? DEFAULT_EXCLUDE,
    absolute: true,
  });
}
