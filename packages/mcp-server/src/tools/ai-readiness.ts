// packages/mcp-server/src/tools/ai-readiness.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import fg from 'fast-glob';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, analyzeAIReadiness, type AIReadinessFile } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['ts', 'tsx'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  python: ['py'],
  java: ['java'],
  kotlin: ['kt'],
  csharp: ['cs'],
  rust: ['rs'],
  go: ['go'],
  php: ['php'],
  ruby: ['rb'],
  swift: ['swift'],
};

const directorySchema = z.string().describe('Absolute path to the directory to analyse');
const languageEnum = z.enum(['typescript', 'javascript', 'python', 'java', 'kotlin', 'csharp', 'rust', 'go', 'php', 'ruby', 'swift']);
const languageSchema = languageEnum.optional().describe('Primary language to filter files on. Default: typescript.');
const maxFilesNum = z.number().int();
const maxFilesBounded = maxFilesNum.min(1).max(500);
const maxFilesWithDefault = maxFilesBounded.default(200);
const maxFilesSchema = maxFilesWithDefault.describe('Maximum number of files to analyse (default 200)');

const AI_READINESS_SCHEMA = {
  directory: directorySchema,
  language: languageSchema,
  maxFiles: maxFilesSchema,
};

interface AIReadinessOptions {
  directory: string;
  language: string;
  maxFiles: number;
}

export function registerAIReadiness(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_ai_readiness',
    {
      title: 'AI-Readiness Score',
      description:
        'Computes an AI-Readiness Score (0-10) for a directory. A composite metric of how well a ' +
        'codebase suits AI-assisted development: naming clarity, type coverage, context-window fit, ' +
        'doc signal, and modularity. Returns the score, a per-dimension breakdown, AI blockers, and a short summary.',
      inputSchema: AI_READINESS_SCHEMA,
      annotations: {
        title: 'AI-Readiness Score',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleAIReadiness({
      directory: args['directory'] as string,
      language: (args['language'] as string | undefined) ?? 'typescript',
      maxFiles: (args['maxFiles'] as number | undefined) ?? 200,
    }),
  );
}

async function discoverFiles(directory: string, exts: string[], maxFiles: number): Promise<string[]> {
  const normalized = directory.replace(/\\/g, '/');
  const pattern = `${normalized}/**/*.{${exts.join(',')}}`;
  const filePaths = await fg(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    absolute: true,
    onlyFiles: true,
  });
  return filePaths.slice(0, maxFiles);
}

interface FunctionSlice {
  content: string;
  startLine: number;
  length: number;
}

function extractFunctionContent(slice: FunctionSlice): string {
  const lines = slice.content.split('\n');
  const fromIdx = Math.max(0, slice.startLine - 1);
  const toIdx = Math.min(lines.length, fromIdx + Math.max(1, slice.length));
  return lines.slice(fromIdx, toIdx).join('\n');
}

/** Lacking a direct doc-coverage ratio on HealthResult, infer from LowDocCoverage smells. */
function estimateDocCoverageRatio(smellCount: number, functionCount: number): number {
  if (functionCount === 0) return 1;
  // Conservative heuristic: assume 0.7 ratio absent specific signal.
  // If the file produced any smells at all, drop slightly. Real per-file
  // doc-coverage ratio could be wired through later.
  return smellCount === 0 ? 0.8 : 0.6;
}

interface ReadinessFileContext {
  filePath: string;
  directory: string;
  language: string;
}

async function buildReadinessFile(ctx: ReadinessFileContext): Promise<AIReadinessFile | null> {
  const { filePath: fp, directory, language } = ctx;
  try {
    const content = await fs.readFile(fp, 'utf-8');
    const health = await analyzeFile(fp);
    const avgCC = health.functions.length === 0
      ? 0
      : health.functions.reduce((acc, fn) => acc + fn.cognitiveComplexity, 0) / health.functions.length;
    const functionsForFit = health.functions.map(fn => ({
      name: fn.name,
      startLine: fn.line,
      endLine: fn.line + fn.length,
      content: extractFunctionContent({ content, startLine: fn.line, length: fn.length }),
    }));
    const docCoverageRatio = estimateDocCoverageRatio(health.smells.length, health.functions.length);
    return {
      path: path.relative(directory, fp),
      content,
      language,
      functions: functionsForFit,
      cognitiveComplexity: avgCC,
      docCoverageRatio,
    };
  } catch {
    return null;
  }
}

interface ErrorContext {
  message: string;
  directory: string;
  language: string;
}

function errorResponse(ctx: ErrorContext) {
  const { message, directory, language } = ctx;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message, directory, language }) }],
    isError: true,
  };
}

async function handleAIReadiness(
  opts: AIReadinessOptions,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const { language, maxFiles } = opts;
  try {
    const exts = LANGUAGE_EXTENSIONS[language];
    if (!exts) {
      return errorResponse({ message: `Unsupported language: ${language}`, directory: opts.directory, language });
    }

    const directory = resolveSafePath(opts.directory);
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return errorResponse({ message: `Not a directory: ${directory}`, directory, language });
    }

    const limited = await discoverFiles(directory, exts, maxFiles);

    const maybeFiles = await Promise.all(
      limited.map(fp => buildReadinessFile({ filePath: fp, directory, language })),
    );
    const files: AIReadinessFile[] = maybeFiles.filter((f): f is AIReadinessFile => f !== null);

    const result = analyzeAIReadiness(files);
    const body = {
      directory,
      language,
      filesAnalyzed: files.length,
      score: result.score,
      dimensions: result.dimensions,
      aiBlockers: result.aiBlockers,
      summary: result.summary,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse({ message, directory: opts.directory, language });
  }
}
