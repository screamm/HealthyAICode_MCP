import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { glob } from 'fast-glob';
import {
  analyzeBusFactor,
  analyzeSprintCongestion,
  analyzeKnowledgeLossIndex,
} from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

const schema = {
  projectPath: z.string().describe('Absolute path to the project git root directory'),
  filePattern: z.string().default('**/*.{ts,js,py}').describe('Glob pattern for files to analyse'),
  maxFiles: z.number().int().min(1).max(500).default(100).describe('Maximum number of files to analyse (default 100)'),
  includeSprintCongestion: z.boolean().default(true).describe('Include 14-day sprint congestion analysis'),
  includeKnowledgeLossIndex: z.boolean().default(true).describe('Include inactive-contributor ratio via git blame'),
};

export function registerBusFactor(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_bus_factor',
    'Analyses bus factor, sprint-level developer congestion, and knowledge loss index for a project. ' +
    'Uses Shannon entropy to measure knowledge concentration and identifies files at risk if key contributors leave.',
    schema,
    async (args) => handleBusFactor(
      args.projectPath as string,
      (args.filePattern as string | undefined) ?? '**/*.{ts,js,py}',
      (args.maxFiles as number | undefined) ?? 100,
      (args.includeSprintCongestion as boolean | undefined) ?? true,
      (args.includeKnowledgeLossIndex as boolean | undefined) ?? true,
    ),
  );
}

async function handleBusFactor(
  projectPath: string,
  filePattern: string,
  maxFiles: number,
  includeSprintCongestion: boolean,
  includeKnowledgeLossIndex: boolean,
) {
  try {
    const allFiles = await glob(filePattern, {
      cwd: projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
      absolute: true,
    });

    const files = allFiles.slice(0, maxFiles);
    if (files.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `No files matched pattern "${filePattern}" in ${projectPath}` }),
        }],
        isError: true,
      };
    }

    // Run bus factor analysis on all files in parallel
    const busFactorResults = await Promise.all(
      files.map(f => analyzeBusFactor(projectPath, f)),
    );

    // Optionally run sprint congestion and KLI
    const sprintResults = includeSprintCongestion
      ? await Promise.all(files.map(f => analyzeSprintCongestion(projectPath, f)))
      : [];

    const kliResults = includeKnowledgeLossIndex
      ? await Promise.all(files.map(f => analyzeKnowledgeLossIndex(projectPath, f)))
      : [];

    // Build response
    const atRiskFiles = busFactorResults.filter(r => r.isAtRisk);
    const congestedFiles = sprintResults.filter(r => r.isCongestedSprint);
    const orphanedFiles = kliResults.filter(r => r.isOrphaned);

    // Sort at-risk files: busFactorEstimate ascending (1 = worst), then entropy ascending
    const sortedRisk = [...atRiskFiles].sort((a, b) => {
      if (a.busFactorEstimate !== b.busFactorEstimate) return a.busFactorEstimate - b.busFactorEstimate;
      return a.normalizedEntropy - b.normalizedEntropy;
    });

    const body = {
      projectPath,
      analyzedFiles: files.length,
      summary: {
        atRiskFiles: atRiskFiles.length,
        congestedFiles: congestedFiles.length,
        orphanedFiles: orphanedFiles.length,
      },
      riskFiles: sortedRisk.map(r => ({
        file: r.filePath,
        busFactorEstimate: r.busFactorEstimate,
        uniqueContributors: r.uniqueContributors,
        normalizedEntropy: r.normalizedEntropy,
        dominantContributor: r.contributors[0]?.email ?? 'unknown',
        dominantShare: r.contributors[0]
          ? (r.contributors[0].commitShare * 100).toFixed(0) + '%'
          : 'n/a',
        severity: r.smell?.severity ?? 'none',
      })),
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
