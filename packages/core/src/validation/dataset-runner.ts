import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { Language } from '../types';
import { pearsonCorrelation, spearmanCorrelation, computeAUROC, bootstrapAUROC, mannWhitneyU } from './correlation';

/** A single file record in a validation dataset. */
export interface BugRecord {
  /** Path to the source file (used as metadata only — code is read from `code`). */
  filePath: string;
  language: Language;
  /** Full source code of the file. */
  code: string;
  /** True when the file is known to contain at least one defect. */
  hasBug: boolean;
  /** Optional count of known defects (for regression metrics). */
  bugCount?: number;
}

/** Full validation report produced by `runValidation`. */
export interface ValidationReport {
  totalFiles: number;
  buggyFiles: number;
  cleanFiles: number;
  /** Pearson correlation between health score and clean status (1 = defect-free). */
  pearsonR: number;
  /** Spearman rank correlation. */
  spearmanRho: number;
  /**
   * Area Under the ROC Curve.
   * 0.5 = random classifier, 1.0 = perfect separation.
   * Lower health score → more likely defective.
   */
  auroc: number;
  /** Mean health score of defective files. */
  meanHealthBuggy: number;
  /** Mean health score of clean files. */
  meanHealthClean: number;
  /**
   * meanHealthClean − meanHealthBuggy.
   * Positive values indicate the scorer correctly assigns lower health to defective files.
   */
  healthSeparation: number;
  /** Human-readable interpretation of the validation result. */
  interpretation: string;
  /** Bootstrap 95% CI for AUROC (optional — computed when records.length > 0). */
  aurocBootstrapCi?: { lower: number; upper: number; mean: number };
  /** Mann-Whitney U p-value (optional — computed when records.length > 0). */
  mannWhitneyPValue?: number;
  /** Per-language AUROC breakdown (optional — computed when records.length > 0). */
  perLanguageBreakdown?: Array<{ language: string; auroc: number; count: number }>;
  /** Per-file breakdown. */
  fileResults: Array<{
    filePath: string;
    healthScore: number;
    hasBug: boolean;
    bugCount: number;
  }>;
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.cs', '.rs', '.go',
  '.php', '.rb', '.swift',
]);

/** Returns true when the directory name should be traversed (skips hidden and vendor dirs). */
function isTraversableDirectory(name: string): boolean {
  return !name.startsWith('.') && name !== 'node_modules';
}

/** Returns true when the file extension is a recognised source code extension. */
function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      // encoding: 'utf-8' ensures Dirent.name is string, not Buffer
      entries = await fs.readdir(current, { withFileTypes: true, encoding: 'utf-8' }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && isTraversableDirectory(entry.name)) {
        await walk(full);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Builds BugRecord[] from a directory by scanning source files and using
 * git log as a heuristic: files that appear in commits with "fix" or "defect"
 * in the message are marked hasBug: true.
 *
 * Falls back gracefully when git is not available (all files are marked clean).
 */
export async function buildRecordsFromDirectory(directory: string): Promise<BugRecord[]> {
  const allFiles = await collectSourceFiles(directory);
  if (allFiles.length === 0) return [];

  const buggyPaths = new Set<string>();
  try {
    const git = simpleGit(directory);
    const logOutput = await git.raw([
      'log',
      '--name-only',
      '--pretty=format:',
      '--diff-filter=M',
      '--grep=fix',
      '--grep=defect',
      '--regexp-ignore-case',
    ]);
    for (const line of logOutput.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) {
        const abs = path.resolve(directory, trimmed);
        buggyPaths.add(abs);
      }
    }
  } catch {
    // Not a git repo or git unavailable — all files treated as clean
  }

  const records: BugRecord[] = [];
  for (const filePath of allFiles) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const language = detectLanguage(filePath);
      if (language === 'unsupported') continue;
      records.push({
        filePath,
        language,
        code,
        hasBug: buggyPaths.has(filePath),
        bugCount: buggyPaths.has(filePath) ? 1 : 0,
      });
    } catch {
      // skip unreadable files
    }
  }
  return records;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function interpret(auroc: number): string {
  if (auroc >= 0.75) return 'Strong validation — the health score separates bugs well';
  if (auroc >= 0.60) return 'Moderate validation — some correlation observed';
  return 'Weak correlation — requires more data points or calibration';
}

/** Empty report returned when no records are provided. */
function buildEmptyReport(): ValidationReport {
  return {
    totalFiles: 0,
    buggyFiles: 0,
    cleanFiles: 0,
    pearsonR: 0,
    spearmanRho: 0,
    auroc: 0.5,
    meanHealthBuggy: 0,
    meanHealthClean: 0,
    healthSeparation: 0,
    interpretation: interpret(0.5),
    fileResults: [],
  };
}

/** Analyzes each record and returns per-file health results. */
function buildFileResults(
  records: BugRecord[],
): ValidationReport['fileResults'] {
  return records.map(record => {
    const result = analyzeCode(record.code, record.language, record.filePath);
    return {
      filePath: record.filePath,
      healthScore: result.score,
      hasBug: record.hasBug,
      bugCount: record.bugCount ?? (record.hasBug ? 1 : 0),
    };
  });
}

/** Computes aggregate correlation and AUROC statistics from file results. */
function computeAggregateStats(
  fileResults: ValidationReport['fileResults'],
  records: BugRecord[],
) {
  const scores = fileResults.map(r => r.healthScore);
  // Encode hasBug as binary label for correlation (1 = defect-free, so higher health ~ defect-free)
  const cleanLabels = fileResults.map(r => (r.hasBug ? 0 : 1));
  const bugLabels = fileResults.map(r => r.hasBug);

  const buggyScores = fileResults.filter(r => r.hasBug).map(r => r.healthScore);
  const cleanScores = fileResults.filter(r => !r.hasBug).map(r => r.healthScore);

  const auroc = computeAUROC(scores, bugLabels);
  const aurocBoot = bootstrapAUROC(scores, bugLabels);
  const mw = mannWhitneyU(scores, bugLabels);

  return {
    scores,
    bugLabels,
    buggyScores,
    cleanScores,
    pearsonR: pearsonCorrelation(scores, cleanLabels),
    spearmanRho: spearmanCorrelation(scores, cleanLabels),
    auroc,
    meanHealthBuggy: mean(buggyScores),
    meanHealthClean: mean(cleanScores),
    healthSeparation: mean(cleanScores) - mean(buggyScores),
    aurocBootstrapCi: { lower: aurocBoot.lower, upper: aurocBoot.upper, mean: aurocBoot.mean },
    mannWhitneyPValue: mw.pValue,
    perLanguageBreakdown: computePerLanguageBreakdown(records, fileResults),
  };
}

/**
 * Runs the core validation pipeline:
 * 1. Analyzes every BugRecord with `analyzeCode`.
 * 2. Computes correlation and AUROC between health scores and defect labels.
 * 3. Returns a `ValidationReport`.
 *
 * An empty `records` array returns a zero-filled report without throwing.
 */
export function runValidation(records: BugRecord[]): ValidationReport {
  if (records.length === 0) return buildEmptyReport();

  const fileResults = buildFileResults(records);
  const stats = computeAggregateStats(fileResults, records);

  return {
    totalFiles: fileResults.length,
    buggyFiles: stats.buggyScores.length,
    cleanFiles: stats.cleanScores.length,
    pearsonR: stats.pearsonR,
    spearmanRho: stats.spearmanRho,
    auroc: stats.auroc,
    meanHealthBuggy: stats.meanHealthBuggy,
    meanHealthClean: stats.meanHealthClean,
    healthSeparation: stats.healthSeparation,
    interpretation: interpret(stats.auroc),
    aurocBootstrapCi: stats.aurocBootstrapCi,
    mannWhitneyPValue: stats.mannWhitneyPValue,
    perLanguageBreakdown: stats.perLanguageBreakdown,
    fileResults,
  };
}

function computePerLanguageBreakdown(
  records: BugRecord[],
  fileResults: ValidationReport['fileResults'],
): Array<{ language: string; auroc: number; count: number }> {
  const langGroups = new Map<string, { scores: number[]; labels: boolean[] }>();

  for (let i = 0; i < records.length; i++) {
    const lang = records[i].language;
    if (!langGroups.has(lang)) {
      langGroups.set(lang, { scores: [], labels: [] });
    }
    const group = langGroups.get(lang)!;
    group.scores.push(fileResults[i].healthScore);
    group.labels.push(records[i].hasBug);
  }

  const breakdown: Array<{ language: string; auroc: number; count: number }> = [];
  for (const [language, data] of langGroups) {
    const buggyCount = data.labels.filter(Boolean).length;
    const cleanCount = data.labels.filter((l) => !l).length;
    if (buggyCount > 0 && cleanCount > 0) {
      breakdown.push({
        language,
        auroc: computeAUROC(data.scores, data.labels),
        count: data.labels.length,
      });
    }
  }

  return breakdown;
}
