// packages/mcp-server/src/tools/architecture-report.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { analyzeArchitectureDebt, readProjectFiles } from '@healthy-ai-code/core';
import type { ModuleDebtProfile, DependencyCycle } from '@healthy-ai-code/core';
import type { GraphNode, GraphLink, GraphData } from './architecture-report-template';
import { generateHtml } from './architecture-report-template';
import { resolveSafePath } from './path-safety';

const archMaxFilesInt = z.number().int();
const archMaxFilesBase = archMaxFilesInt.min(1).max(10000);
const archMaxFilesSchema = archMaxFilesBase.default(300).describe('Maximum number of files to analyse (default: 300)');

export function registerArchitectureReport(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_architecture_report',
    {
      title: 'Architecture Report (HTML)',
      description:
        'Generates a self-contained interactive HTML file with a force-directed dependency graph. ' +
        'Visualises architectural debt: FAN-IN/OUT, circular dependencies, and Cost-of-Change severity per file. ' +
        'Works offline — no external server required. Writes the HTML report to disk.',
      inputSchema: {
        directory: z.string().describe('Absolute path to the project root directory'),
        output: z.string().optional().describe('Path for the HTML file (default: <directory>/architecture-report.html)'),
        maxFiles: archMaxFilesSchema,
        minCostOfChange: z.enum(['all', 'medium', 'high']).default('all').describe('Filter out nodes below the given severity (default: all)'),
      },
      annotations: {
        title: 'Architecture Report (HTML)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleArchitectureReport(
      args['directory'] as string,
      args['output'] as string | undefined,
      args['maxFiles'] as number,
      args['minCostOfChange'] as 'all' | 'medium' | 'high',
    ),
  );
}

const METRIC_DECIMAL_PLACES = 3;

interface BuildReportSummaryOptions {
  resolvedOutput: string;
  result: { totalModules: number; summary: { cycleCount: number; highSeverityModules: number; avgCostOfChange: number } };
  graphData: GraphData;
  fileCount: number;
  minCostOfChange: string;
}

function buildReportSummary(options: BuildReportSummaryOptions): object {
  const { resolvedOutput, result, graphData, fileCount, minCostOfChange } = options;
  return {
    outputFile: resolvedOutput,
    totalModules: result.totalModules,
    nodesInGraph: graphData.nodes.length,
    linksInGraph: graphData.links.length,
    cycleCount: result.summary.cycleCount,
    highSeverityModules: result.summary.highSeverityModules,
    avgCostOfChange: parseFloat(result.summary.avgCostOfChange.toFixed(METRIC_DECIMAL_PLACES)),
    filterApplied: minCostOfChange,
    filesAnalyzed: fileCount,
  };
}

function buildLimitedFiles(
  fileEntries: [string, { content: string; language: string }][],
): Record<string, { content: string; language: string }> {
  const limitedFiles: Record<string, { content: string; language: string }> = {};
  for (const [k, v] of fileEntries) {
    limitedFiles[k] = { content: v.content, language: v.language };
  }
  return limitedFiles;
}

async function handleArchitectureReport(
  directory: string,
  outputPath: string | undefined,
  maxFiles: number,
  minCostOfChange: 'all' | 'medium' | 'high',
) {
  try {
    const safeDirectory = resolveSafePath(directory);
    // Validate the output path too (it is written to disk). When omitted it
    // defaults inside the analysed directory, which is already validated.
    const resolvedOutput = outputPath
      ? resolveSafePath(outputPath)
      : path.join(safeDirectory, 'architecture-report.html');
    directory = safeDirectory;

    const allFiles = await readProjectFiles(directory);
    const fileEntries = Object.entries(allFiles).slice(0, maxFiles);

    if (fileEntries.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'No supported source files found in directory', directory }),
        }],
        isError: true,
      };
    }

    const limitedFiles = buildLimitedFiles(fileEntries);
    const result = await analyzeArchitectureDebt(directory, limitedFiles);
    const graphData = buildGraphData(result.modules, result.cycles, minCostOfChange);
    const html = generateHtml(graphData, directory);

    await fs.writeFile(resolvedOutput, html, 'utf-8');

    const summaryOptions: BuildReportSummaryOptions = {
      resolvedOutput,
      result,
      graphData,
      fileCount: fileEntries.length,
      minCostOfChange,
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(buildReportSummary(summaryOptions), null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message, directory }) }],
      isError: true,
    };
  }
}

function filterModulesBySeverity(
  modules: ModuleDebtProfile[],
  minCostOfChange: 'all' | 'medium' | 'high',
): ModuleDebtProfile[] {
  if (minCostOfChange === 'high') return modules.filter(m => m.costOfChangeSeverity === 'high');
  if (minCostOfChange === 'medium') return modules.filter(m => m.costOfChangeSeverity !== 'low');
  return modules;
}

function buildNodes(filtered: ModuleDebtProfile[]): GraphNode[] {
  return filtered.map(m => ({
    id: m.filePath,
    fanIn: m.fanIn,
    fanOut: m.fanOut,
    instability: parseFloat(m.instability.toFixed(METRIC_DECIMAL_PLACES)),
    severity: m.costOfChangeSeverity,
    churn: m.changeFrequency,
    inCycle: m.inCycle,
    propagationCost: parseFloat(m.propagationCost.toFixed(METRIC_DECIMAL_PLACES)),
    costOfChange: parseFloat(m.costOfChange.toFixed(METRIC_DECIMAL_PLACES)),
  }));
}

function buildLinks(nodes: GraphNode[], cycles: DependencyCycle[]): GraphLink[] {
  const links: GraphLink[] = [];
  const cycleMembers = new Set(cycles.flatMap(c => c.members));
  const linkedPairs = new Set<string>();

  const highFanOutNodes = nodes.filter(n => n.fanOut > 0).sort((a, b) => b.fanOut - a.fanOut);
  const highFanInNodes = nodes.filter(n => n.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn);

  for (const src of highFanOutNodes.slice(0, 80)) {
    const targetCount = Math.min(src.fanOut, 5, highFanInNodes.length);
    for (let i = 0; i < targetCount; i++) {
      const tgt = highFanInNodes[i];
      if (!tgt || tgt.id === src.id) continue;
      const pairKey = `${src.id}-->${tgt.id}`;
      if (linkedPairs.has(pairKey)) continue;
      linkedPairs.add(pairKey);

      const bothInCycle = cycleMembers.has(src.id) && cycleMembers.has(tgt.id);
      const strength = Math.min(1, (src.fanOut * tgt.fanIn) / 100);

      links.push({
        source: src.id,
        target: tgt.id,
        strength: parseFloat(strength.toFixed(METRIC_DECIMAL_PLACES)),
        inCycle: bothInCycle,
      });
    }
  }
  return links;
}

function buildGraphSummary(
  modules: ModuleDebtProfile[],
  filtered: ModuleDebtProfile[],
  cycles: DependencyCycle[],
): GraphData['summary'] {
  const avgCostOfChange = filtered.length > 0
    ? filtered.reduce((s, m) => s + m.costOfChange, 0) / filtered.length
    : 0;

  return {
    totalModules: modules.length,
    cycleCount: cycles.length,
    avgCostOfChange: parseFloat(avgCostOfChange.toFixed(METRIC_DECIMAL_PLACES)),
    highSeverityCount: filtered.filter(m => m.costOfChangeSeverity === 'high').length,
    mediumSeverityCount: filtered.filter(m => m.costOfChangeSeverity === 'medium').length,
    lowSeverityCount: filtered.filter(m => m.costOfChangeSeverity === 'low').length,
  };
}

function buildGraphData(
  modules: ModuleDebtProfile[],
  cycles: DependencyCycle[],
  minCostOfChange: 'all' | 'medium' | 'high',
): GraphData {
  const filtered = filterModulesBySeverity(modules, minCostOfChange);
  const nodes = buildNodes(filtered);
  const links = buildLinks(nodes, cycles);
  const summary = buildGraphSummary(modules, filtered, cycles);

  return {
    nodes,
    links,
    cycles: cycles.map(c => c.members),
    summary,
  };
}
