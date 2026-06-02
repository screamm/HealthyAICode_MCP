import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { glob } from 'fast-glob';
import {
  analyzeBusFactor,
  analyzeSprintCongestion,
  analyzeKnowledgeLossIndex,
} from '@healthy-ai-code/core';
import type {
  BusFactorResult,
  SprintCongestionResult,
  KnowledgeLossIndexResult,
} from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

const maxFilesInt = z.number().int();
const maxFilesBase = maxFilesInt.min(1).max(500);
const maxFilesSchema = maxFilesBase.default(100).describe('Maximum number of files to analyse (default 100)');

const schema = {
  projectPath: z.string().describe('Absolute path to the project git root directory'),
  filePattern: z.string().default('**/*.{ts,js,py}').describe('Glob pattern for files to analyse'),
  maxFiles: maxFilesSchema,
  includeSprintCongestion: z.boolean().default(true).describe('Include 14-day sprint congestion analysis'),
  includeKnowledgeLossIndex: z.boolean().default(true).describe('Include inactive-contributor ratio via git blame'),
};

const GLOB_IGNORE = ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'];

interface BusFactorOptions {
  projectPath: string;
  filePattern: string;
  maxFiles: number;
  includeSprintCongestion: boolean;
  includeKnowledgeLossIndex: boolean;
}

function parseBusFactorOptions(args: Record<string, unknown>): BusFactorOptions {
  return {
    projectPath: args['projectPath'] as string,
    filePattern: (args['filePattern'] as string | undefined) ?? '**/*.{ts,js,py}',
    maxFiles: (args['maxFiles'] as number | undefined) ?? 100,
    includeSprintCongestion: (args['includeSprintCongestion'] as boolean | undefined) ?? true,
    includeKnowledgeLossIndex: (args['includeKnowledgeLossIndex'] as boolean | undefined) ?? true,
  };
}

export function registerBusFactor(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_bus_factor',
    {
      title: 'Bus Factor & Knowledge Risk',
      description:
        'Analyses bus factor, sprint-level developer congestion, and knowledge loss index for a project. ' +
        'Uses Shannon entropy to measure knowledge concentration and identifies files at risk if key contributors leave.',
      inputSchema: schema,
      annotations: {
        title: 'Bus Factor & Knowledge Risk',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleBusFactor(parseBusFactorOptions(args)),
  );
}

interface AnalysisResults {
  busFactorResults: BusFactorResult[];
  sprintResults: SprintCongestionResult[];
  kliResults: KnowledgeLossIndexResult[];
}

/** Resolve files from the glob pattern, capped at maxFiles. */
async function resolveFiles(opts: BusFactorOptions): Promise<string[] | null> {
  const allFiles = await glob(opts.filePattern, {
    cwd: opts.projectPath,
    ignore: GLOB_IGNORE,
    absolute: true,
  });
  const files = allFiles.slice(0, opts.maxFiles);
  return files.length === 0 ? null : files;
}

/** Run all three analysis passes in parallel. */
async function runAnalyses(opts: BusFactorOptions, files: string[]): Promise<AnalysisResults> {
  const [busFactorResults, sprintResults, kliResults] = await Promise.all([
    Promise.all(files.map(f => analyzeBusFactor(opts.projectPath, f))),
    opts.includeSprintCongestion
      ? Promise.all(files.map(f => analyzeSprintCongestion(opts.projectPath, f)))
      : Promise.resolve([] as SprintCongestionResult[]),
    opts.includeKnowledgeLossIndex
      ? Promise.all(files.map(f => analyzeKnowledgeLossIndex(opts.projectPath, f)))
      : Promise.resolve([] as KnowledgeLossIndexResult[]),
  ]);
  return { busFactorResults, sprintResults, kliResults };
}

/** Format the sorted at-risk file rows. */
function formatRiskFiles(atRiskFiles: BusFactorResult[]) {
  const sortedRisk = [...atRiskFiles].sort((a, b) => {
    if (a.busFactorEstimate !== b.busFactorEstimate) return a.busFactorEstimate - b.busFactorEstimate;
    return a.normalizedEntropy - b.normalizedEntropy;
  });

  return sortedRisk.map(r => ({
    file: r.filePath,
    busFactorEstimate: r.busFactorEstimate,
    uniqueContributors: r.uniqueContributors,
    normalizedEntropy: r.normalizedEntropy,
    dominantContributor: r.contributors[0]?.email ?? 'unknown',
    dominantShare: r.contributors[0]
      ? (r.contributors[0].commitShare * 100).toFixed(0) + '%'
      : 'n/a',
    severity: r.smell?.severity ?? 'none',
  }));
}

interface BusFactorBodyInput {
  projectPath: string;
  files: string[];
  results: AnalysisResults;
}

/** Build the response body from analysis results. */
function buildBusFactorBody(input: BusFactorBodyInput): object {
  const { projectPath, files, results } = input;
  const { busFactorResults, sprintResults, kliResults } = results;
  const atRiskFiles = busFactorResults.filter(r => r.isAtRisk);
  const congestedFiles = sprintResults.filter(r => r.isCongestedSprint);
  const orphanedFiles = kliResults.filter(r => r.isOrphaned);

  return {
    projectPath,
    analyzedFiles: files.length,
    summary: {
      atRiskFiles: atRiskFiles.length,
      congestedFiles: congestedFiles.length,
      orphanedFiles: orphanedFiles.length,
    },
    riskFiles: formatRiskFiles(atRiskFiles),
    congestedFiles: congestedFiles.map(r => ({
      file: r.filePath,
      activeContributors: r.activeContributors,
      activeEmails: r.activeEmails,
      severity: r.smell?.severity ?? 'medium',
    })),
    orphanedFiles: orphanedFiles.map(r => ({
      file: r.filePath,
      knowledgeLossRatio: (r.knowledgeLossRatio * 100).toFixed(0) + '%',
      inactiveLines: r.inactiveLines,
      totalLines: r.totalLines,
      severity: r.smell?.severity ?? 'high',
    })),
  };
}

async function handleBusFactor(opts: BusFactorOptions) {
  try {
    // Validate the project path (NUL bytes / workspace jail) before any fs/git access.
    opts = { ...opts, projectPath: resolveSafePath(opts.projectPath) };
    const files = await resolveFiles(opts);
    if (!files) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `No files matched pattern "${opts.filePattern}" in ${opts.projectPath}` }),
        }],
        isError: true,
      };
    }

    const { busFactorResults, sprintResults, kliResults } = await runAnalyses(opts, files);

    const analysisResults: AnalysisResults = { busFactorResults, sprintResults, kliResults };
    const body = buildBusFactorBody({ projectPath: opts.projectPath, files, results: analysisResults });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
