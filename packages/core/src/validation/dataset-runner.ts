import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { Language } from '../types';
import { pearsonCorrelation, spearmanCorrelation, computeAUROC } from './correlation';

/** A single file record in a validation dataset. */
export interface BugRecord {
  /** Path to the source file (used as metadata only — code is read from `code`). */
  filePath: string;
  language: Language;
  /** Full source code of the file. */
  code: string;
  /** True when the file is known to contain at least one bug. */
  hasBug: boolean;
  /** Optional count of known bugs (for regression metrics). */
  bugCount?: number;
}

/** Full validation report produced by `runValidation`. */
export interface ValidationReport {
  totalFiles: number;
  buggyFiles: number;
  cleanFiles: number;
  /** Pearson correlation between health score and bug-free status (1 = bug-free). */
  pearsonR: number;
  /** Spearman rank correlation. */
  spearmanRho: number;
  /**
   * Area Under the ROC Curve.
   * 0.5 = random classifier, 1.0 = perfect separation.
   * Lower health score → more likely buggy.
   */
  auroc: number;
  /** Mean health score of buggy files. */
  meanHealthBuggy: number;
  /** Mean health score of clean files. */
  meanHealthClean: number;
  /**
   * meanHealthClean − meanHealthBuggy.
   * Positive values indicate the scorer correctly assigns lower health to buggy files.
   */
  healthSeparation: number;
  /** Human-readable interpretation of the validation result. */
  interpretation: string;
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
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(full);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          results.push(full);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Builds BugRecord[] from a directory by scanning source files and using
 * git log as a heuristic: files that appear in commits with "fix" or "bug"
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
      '--grep=bug',
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
  if (auroc >= 0.75) return 'Stark validering — hälsopoängen separerar buggar väl';
  if (auroc >= 0.60) return 'Måttlig validering — viss korrelation observerad';
  return 'Svag korrelation — kräver fler datapunkter eller kalibrering';
}

/**
 * Runs the core validation pipeline:
 * 1. Analyzes every BugRecord with `analyzeCode`.
 * 2. Computes correlation and AUROC between health scores and bug labels.
 * 3. Returns a `ValidationReport`.
 *
 * An empty `records` array returns a zero-filled report without throwing.
 */
export function runValidation(records: BugRecord[]): ValidationReport {
  if (records.length === 0) {
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

  const fileResults = records.map(record => {
    const result = analyzeCode(record.code, record.language, record.filePath);
    return {
      filePath: record.filePath,
      healthScore: result.score,
      hasBug: record.hasBug,
      bugCount: record.bugCount ?? (record.hasBug ? 1 : 0),
    };
  });

  const scores = fileResults.map(r => r.healthScore);
  // Encode hasBug as binary label for correlation (1 = bug-free, so higher health ~ bug-free)
  const cleanLabels = fileResults.map(r => (r.hasBug ? 0 : 1));
  const bugLabels = fileResults.map(r => r.hasBug);

  const pearsonR = pearsonCorrelation(scores, cleanLabels);
  const spearmanRho = spearmanCorrelation(scores, cleanLabels);
  const auroc = computeAUROC(scores, bugLabels);

  const buggyScores = fileResults.filter(r => r.hasBug).map(r => r.healthScore);
  const cleanScores = fileResults.filter(r => !r.hasBug).map(r => r.healthScore);

  const meanHealthBuggy = mean(buggyScores);
  const meanHealthClean = mean(cleanScores);
  const healthSeparation = meanHealthClean - meanHealthBuggy;

  return {
    totalFiles: fileResults.length,
    buggyFiles: buggyScores.length,
    cleanFiles: cleanScores.length,
    pearsonR,
    spearmanRho,
    auroc,
    meanHealthBuggy,
    meanHealthClean,
    healthSeparation,
    interpretation: interpret(auroc),
    fileResults,
  };
}
