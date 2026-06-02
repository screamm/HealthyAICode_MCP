import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectLanguage, runValidation, loadDefects4JFromJson, createSyntheticBenchmark } from '@healthy-ai-code/core';
import type { BugRecord, ValidationReport } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

const execFileAsync = promisify(execFile);

export function registerValidateDataset(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_validate_against_dataset',
    {
      title: 'Validate Against Bug Dataset',
      description: [
        'Validates that the health score correlates with known bugs.',
        'Three modes:',
        '  1. useSyntheticBenchmark: true  — use the built-in TypeScript benchmark (5 buggy + 5 clean)',
        '  2. datasetPath                  — load Defects4J-format JSON with buggy/clean code pairs',
        '  3. directory                    — analyse a directory and heuristically label buggy files via git log',
        'Returns AUROC, Pearson r, Spearman ρ, mean separation, and an interpretation.',
      ].join('\n'),
      inputSchema: {
        datasetPath: z.string().optional().describe('Path to a Defects4J-format JSON file'),
        useSyntheticBenchmark: z
          .boolean()
          .default(false)
          .describe('Run the built-in benchmark (5 buggy + 5 clean TypeScript functions)'),
        directory: z
          .string()
          .optional()
          .describe(
            'Analyse all source files in the directory; git log is used as a proxy: files in commits with "fix" or "bug" in the message are labelled buggy',
          ),
      },
      annotations: {
        title: 'Validate Against Bug Dataset',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleValidateDataset(args),
  );
}

async function handleValidateDataset(args: Record<string, unknown>) {
  try {
    const records = await buildRecords(args);
    if (records.length === 0) {
      return emptyRecordsError();
    }

    const report = runValidation(records);
    const output = formatReport(report, args);

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
}

function emptyRecordsError() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { error: 'No files to validate. Provide datasetPath, useSyntheticBenchmark: true, or directory.' },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

async function buildRecords(args: Record<string, unknown>): Promise<BugRecord[]> {
  if (args['useSyntheticBenchmark'] === true) {
    return createSyntheticBenchmark();
  }

  if (typeof args['datasetPath'] === 'string' && args['datasetPath'].length > 0) {
    return await loadDefects4JFromJson(resolveSafePath(args['datasetPath']));
  }

  if (typeof args['directory'] === 'string' && args['directory'].length > 0) {
    return await buildRecordsFromDirectory(resolveSafePath(args['directory']));
  }

  return [];
}

/**
 * Heuristic: use git log to find files in commits whose messages contain
 * defect-indicator keywords. Files matching those commits are flagged hasBug: true.
 * All other readable source files in the directory are flagged hasBug: false.
 */
async function buildRecordsFromDirectory(directory: string): Promise<BugRecord[]> {
  const allFiles = await collectSourceFiles(directory);
  if (allFiles.length === 0) return [];

  const buggyPaths = await detectBuggyFiles(directory);
  return readFileRecords(allFiles, buggyPaths);
}

/** Run git log to identify files touched in defect-fixing commits. */
async function detectBuggyFiles(directory: string): Promise<Set<string>> {
  const buggyPaths = new Set<string>();
  try {
    const { stdout: logOutput } = await execFileAsync('git', [
      '-C', directory,
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
      if (trimmed) buggyPaths.add(path.resolve(directory, trimmed));
    }
  } catch {
    // Not a git repo or git not available — all files treated as clean
  }
  return buggyPaths;
}

/** Read each source file and build BugRecord entries. */
async function readFileRecords(
  allFiles: string[],
  buggyPaths: Set<string>,
): Promise<BugRecord[]> {
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

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.cs', '.rs', '.go',
  '.php', '.rb', '.swift',
]);

/** Recursively collect all source files in a directory. */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  await walkDirectory(dir, results);
  return results;
}

/** Process a single directory entry during a walk. */
async function processDirectoryEntry(
  entry: { name: string; isDirectory: () => boolean; isFile: () => boolean },
  current: string,
  results: string[],
): Promise<void> {
  const name = String(entry.name);
  const full = path.join(current, name);
  if (entry.isDirectory()) {
    if (!name.startsWith('.') && name !== 'node_modules') {
      await walkDirectory(full, results);
    }
  } else if (entry.isFile()) {
    const ext = path.extname(name).toLowerCase();
    if (SOURCE_EXTENSIONS.has(ext)) results.push(full);
  }
}

async function walkDirectory(current: string, results: string[]): Promise<void> {
  let rawEntries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    rawEntries = await fs.readdir(current, { withFileTypes: true }) as typeof rawEntries;
  } catch {
    return;
  }
  for (const entry of rawEntries) {
    await processDirectoryEntry(entry, current, results);
  }
}

/** Attach optional statistical fields to the output object if present. */
function attachOptionalFields(output: Record<string, unknown>, report: ValidationReport): void {
  if (report.aurocBootstrapCi) {
    output.aurocBootstrapCi = {
      lower: round(report.aurocBootstrapCi.lower),
      upper: round(report.aurocBootstrapCi.upper),
      mean: round(report.aurocBootstrapCi.mean),
    };
  }

  if (report.mannWhitneyPValue !== undefined) {
    output.mannWhitneyPValue = round(report.mannWhitneyPValue);
  }

  if (report.perLanguageBreakdown && report.perLanguageBreakdown.length > 0) {
    output.perLanguageBreakdown = report.perLanguageBreakdown.map(b => ({
      language: b.language,
      auroc: round(b.auroc),
      count: b.count,
    }));
  }
}

function formatReport(
  report: ValidationReport,
  args: Record<string, unknown>,
): object {
  const mode = detectMode(args);

  const output: Record<string, unknown> = {
    mode,
    summary: {
      totalFiles: report.totalFiles,
      buggyFiles: report.buggyFiles,
      cleanFiles: report.cleanFiles,
    },
    metrics: {
      auroc: round(report.auroc),
      pearsonR: round(report.pearsonR),
      spearmanRho: round(report.spearmanRho),
      meanHealthBuggy: round(report.meanHealthBuggy),
      meanHealthClean: round(report.meanHealthClean),
      healthSeparation: round(report.healthSeparation),
    },
    interpretation: report.interpretation,
    recommendation: buildRecommendation(report),
    fileResults: report.fileResults.map(f => ({
      filePath: f.filePath,
      healthScore: round(f.healthScore),
      hasBug: f.hasBug,
      bugCount: f.bugCount,
    })),
  };

  attachOptionalFields(output, report);

  return output;
}

function detectMode(args: Record<string, unknown>): string {
  if (args.useSyntheticBenchmark === true) return 'synthetic_benchmark';
  if (typeof args.datasetPath === 'string') return 'defects4j_dataset';
  return 'directory_heuristic';
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function buildRecommendation(report: ValidationReport): string {
  if (report.totalFiles === 0) {
    return 'No files were analysed.';
  }
  if (report.auroc >= 0.75) {
    return (
      `The health score works well as a bug predictor (AUROC ${round(report.auroc)}). ` +
      'Continue using the thresholds from the calibration loader.'
    );
  }
  if (report.auroc >= 0.60) {
    return (
      `Some correlation detected (AUROC ${round(report.auroc)}). ` +
      'Consider running code_health_calibration_status to fine-tune the weights.'
    );
  }
  return (
    `Low AUROC (${round(report.auroc)}) — the dataset may be too small or the smells are not calibrated. ` +
    'Add more data points or run code_health_calibration_status.'
  );
}
