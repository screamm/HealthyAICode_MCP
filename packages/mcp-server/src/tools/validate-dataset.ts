import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectLanguage, runValidation, loadDefects4JFromJson, createSyntheticBenchmark } from '@healthy-ai-code/core';
import type { BugRecord, ValidationReport } from '@healthy-ai-code/core';

const execFileAsync = promisify(execFile);

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerValidateDataset(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_validate_against_dataset',
    [
      'Validerar att hälsopoängen korrelerar med kända buggar.',
      'Tre lägen:',
      '  1. useSyntheticBenchmark: true  — använd inbyggt TypeScript-benchmark (5 buggy + 5 clean)',
      '  2. datasetPath                  — ladda Defects4J-format JSON med buggy/clean kodpar',
      '  3. directory                    — analysera en katalog och heuristik-märk bugg-filer via git log',
      'Returnerar AUROC, Pearson-r, Spearman-ρ, medelvärdes-separation och tolkning.',
    ].join('\n'),
    {
      datasetPath: z.string().optional().describe('Sökväg till Defects4J-format JSON-fil'),
      useSyntheticBenchmark: z
        .boolean()
        .default(false)
        .describe('Kör inbyggt benchmark (5 buggy + 5 clean TypeScript-funktioner)'),
      directory: z
        .string()
        .optional()
        .describe(
          'Analysera alla källfiler i katalogen; git log används som proxy: filer med "fix" eller "bug" i commit-meddelanden märks som buggy',
        ),
    },
    async (args) => handleValidateDataset(args),
  );
}

async function handleValidateDataset(args: Record<string, unknown>) {
  try {
    const records = await buildRecords(args);
    if (records.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error:
                  'Inga filer att validera. Ange datasetPath, useSyntheticBenchmark: true, eller directory.',
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
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

async function buildRecords(args: Record<string, unknown>): Promise<BugRecord[]> {
  if (args.useSyntheticBenchmark === true) {
    return createSyntheticBenchmark();
  }

  if (typeof args.datasetPath === 'string' && args.datasetPath.length > 0) {
    return await loadDefects4JFromJson(args.datasetPath);
  }

  if (typeof args.directory === 'string' && args.directory.length > 0) {
    return await buildRecordsFromDirectory(args.directory);
  }

  return [];
}

/**
 * Heuristic: use `simple-git` to list files that appear in commits whose
 * messages contain "fix" or "bug". These are marked hasBug: true.
 * All other readable source files in the directory are marked hasBug: false.
 */
async function buildRecordsFromDirectory(directory: string): Promise<BugRecord[]> {
  const allFiles = await collectSourceFiles(directory);
  if (allFiles.length === 0) return [];

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
      if (trimmed) {
        const abs = path.resolve(directory, trimmed);
        buggyPaths.add(abs);
      }
    }
  } catch {
    // Not a git repo or git not available — all files treated as clean
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

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.cs', '.rs', '.go',
  '.php', '.rb', '.swift',
]);

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawEntries: any[];
    try {
      rawEntries = await fs.readdir(current, { withFileTypes: true }) as any[];
    } catch {
      return;
    }
    for (const entry of rawEntries) {
      const name = String(entry.name);
      const full = path.join(current, name);
      if (entry.isDirectory()) {
        if (!name.startsWith('.') && name !== 'node_modules') {
          await walk(full);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          results.push(full);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

function formatReport(
  report: ValidationReport,
  args: Record<string, unknown>,
): object {
  const mode =
    args.useSyntheticBenchmark === true
      ? 'synthetic_benchmark'
      : typeof args.datasetPath === 'string'
        ? 'defects4j_dataset'
        : 'directory_heuristic';

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

  return output;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function buildRecommendation(report: ValidationReport): string {
  if (report.totalFiles === 0) {
    return 'Inga filer analyserades.';
  }
  if (report.auroc >= 0.75) {
    return (
      `Hälsopoängen fungerar väl som bugg-prediktor (AUROC ${round(report.auroc)}). ` +
      'Fortsätt använda tröskelvärden från calibration-loader.'
    );
  }
  if (report.auroc >= 0.60) {
    return (
      `Viss korrelation detekterad (AUROC ${round(report.auroc)}). ` +
      'Överväg att köra code_health_calibration_status för att finjustera vikter.'
    );
  }
  return (
    `Låg AUROC (${round(report.auroc)}) — dataset kan vara för litet eller smells inte kalibrerade. ` +
    'Lägg till fler datapunkter eller kör code_health_calibration_status.'
  );
}
