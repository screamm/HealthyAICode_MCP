// packages/mcp-server/src/tools/architecture-debt.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeArchitectureDebt, readProjectFiles } from '@healthy-ai-code/core';
import type { ModuleDebtProfile, DependencyCycle } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

// --- Configuration constants ---
const DEFAULT_MAX_FILES = 1000;
const MAX_FILES_LIMIT = 10000;
const DEFAULT_DEPTH = 'file' as const;
const DEFAULT_LANGUAGE = 'all' as const;

const directorySchema = z.string().describe('Absolut sokvaeg till projektets rotkatalog');
const languageBase = z.enum(['typescript', 'javascript', 'python', 'all']).default(DEFAULT_LANGUAGE);
const languageSchema = languageBase.describe('Sprak att analysera (default: all)');
const depthBase = z.enum(['file', 'module']).default(DEFAULT_DEPTH);
const depthSchema = depthBase.describe('Granularitet (default: file)');
const maxFilesInt = z.number().int();
const maxFilesBounded = maxFilesInt.min(1).max(MAX_FILES_LIMIT);
const maxFilesWithDefault = maxFilesBounded.default(DEFAULT_MAX_FILES);
const maxFilesSchema = maxFilesWithDefault.describe('Maxantal filer att analysera (default: 1000)');

const ARCHITECTURE_DEBT_SCHEMA = {
  directory: directorySchema,
  language: languageSchema,
  depth: depthSchema,
  maxFiles: maxFilesSchema,
};

export function registerArchitectureDebt(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_architecture_debt',
    'Analyserar arkitekturella skulder pa modulniva: FAN-IN/OUT, Propagation Cost (transitiv paverkan), cykliska beroenden via Tarjan SCC och Cost-of-Change score per fil.',
    ARCHITECTURE_DEBT_SCHEMA,
    async (args) => handleArchitectureDebt({
      directory: args.directory as string,
      language: args.language as string,
      depth: args.depth as 'file' | 'module',
      maxFiles: args.maxFiles as number,
    }),
  );
}

function mapModuleProfile(m: ModuleDebtProfile) {
  return {
    file: m.filePath,
    costOfChange: parseFloat(m.costOfChange.toFixed(3)),
    severity: m.costOfChangeSeverity,
    fanIn: m.fanIn,
    fanOut: m.fanOut,
    propagationCost: `${(m.propagationCost * 100).toFixed(1)}%`,
    inCycle: m.inCycle,
    changeFrequency: m.changeFrequency,
  };
}

function mapCycle(c: DependencyCycle) {
  return {
    members: c.members,
    size: c.size,
    severity: c.severity,
  };
}

interface FileFilterOptions {
  language: string;
  maxFiles: number;
}

type FileMap = Record<string, { content: string; language: string }>;

function filterAndLimitFiles(
  fileEntries: [string, { content: string; language: string }][],
  opts: FileFilterOptions,
): FileMap {
  const filtered = opts.language === 'all'
    ? fileEntries
    : fileEntries.filter(([, v]) => v.language === opts.language);

  const limited = filtered.slice(0, opts.maxFiles);
  const limitedFiles: FileMap = {};
  for (const [k, v] of limited) {
    limitedFiles[k] = { content: v.content, language: v.language };
  }
  return limitedFiles;
}

async function resolveAndFilterFiles(
  directory: string,
  opts: FileFilterOptions,
): Promise<{ error: string } | FileMap> {
  const allFiles = await readProjectFiles(directory);
  const fileEntries = Object.entries(allFiles);

  if (fileEntries.length === 0) {
    return { error: 'No supported source files found in directory' };
  }

  const limitedFiles = filterAndLimitFiles(fileEntries, opts);

  if (Object.keys(limitedFiles).length === 0) {
    return { error: `No files found for language: ${opts.language}` };
  }

  return limitedFiles;
}

async function buildArchitectureDebtBody(
  directory: string,
  limitedFiles: FileMap,
) {
  const result = await analyzeArchitectureDebt(directory, limitedFiles);
  return {
    directory: result.directory,
    totalModules: result.totalModules,
    filesAnalyzed: Object.keys(limitedFiles).length,
    summary: result.summary,
    topCostlyModules: result.topCostlyModules.map(mapModuleProfile),
    cycles: result.cycles.map(mapCycle),
    allModules: result.modules.map(mapModuleProfile),
  };
}

interface ArchitectureDebtOptions {
  directory: string;
  language: string;
  maxFiles: number;
  depth: 'file' | 'module';
}

async function handleArchitectureDebt(options: ArchitectureDebtOptions) {
  const { directory, language, maxFiles } = options;
  const opts: FileFilterOptions = { language, maxFiles };
  try {
    const filesOrError = await resolveAndFilterFiles(directory, opts);

    if ('error' in filesOrError) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: filesOrError.error, directory }),
        }],
        isError: true,
      };
    }

    const body = await buildArchitectureDebtBody(directory, filesOrError);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message, directory }) }],
      isError: true,
    };
  }
}
