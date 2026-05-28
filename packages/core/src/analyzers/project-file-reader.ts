/**
 * project-file-reader.ts
 * Recursively reads source files from a directory, returning a map of
 * project-relative path -> { content, language }.
 *
 * Excludes: node_modules, dist, build, .git, coverage, .next, .cache,
 *           vendor, __pycache__, target, out, bin, obj, and any hidden
 *           directories (starting with '.').
 * Skips files > maxFileSizeBytes (default 500 KB).
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import type { Dirent } from 'fs';
import { detectLanguage } from '../language-detect';
import type { Language } from '../types';

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'coverage',
  '.next', '.cache', 'vendor', '__pycache__', 'target',
  'out', 'bin', 'obj',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.kt', '.cs', '.rs', '.go',
  '.php', '.rb', '.swift',
]);

/** Shared context for the recursive directory walk. */
interface WalkContext {
  root: string;
  maxFileSizeBytes: number;
  result: Record<string, { content: string; language: Language }>;
}

/**
 * Walks a directory tree, reads supported source files, and returns a map
 * of project-relative paths (forward-slash) -> { content, language }.
 */
export async function readProjectFiles(
  directory: string,
  maxFileSizeBytes = 500_000,
): Promise<Record<string, { content: string; language: Language }>> {
  const result: Record<string, { content: string; language: Language }> = {};
  const ctx: WalkContext = { root: directory, maxFileSizeBytes, result };
  await walkDir(ctx, directory);
  return result;
}

async function walkDir(ctx: WalkContext, dir: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    await processEntry(ctx, dir, entry);
  }
}

/** Dispatches a single directory entry to the appropriate handler. */
async function processEntry(ctx: WalkContext, dir: string, entry: Dirent): Promise<void> {
  const name = entry.name as string;
  const fullPath = path.join(dir, name);
  if (entry.isDirectory()) {
    await processSubdirectory(ctx, name, fullPath);
  } else if (entry.isFile()) {
    await processFile(ctx, name, fullPath);
  }
}

/** Recursively walks into a subdirectory if it is not excluded. */
async function processSubdirectory(ctx: WalkContext, name: string, fullPath: string): Promise<void> {
  if (IGNORE_DIRS.has(name) || name.startsWith('.')) return;
  await walkDir(ctx, fullPath);
}

/** Reads a file and adds it to the result if it is a supported source file within size limits. */
async function processFile(
  ctx: WalkContext,
  name: string,
  fullPath: string,
): Promise<void> {
  const language = resolveFileLanguage(name, fullPath);
  if (language === null) return;

  const fileData = await readFileIfWithinSizeLimit(fullPath, ctx.maxFileSizeBytes);
  if (fileData === null) return;

  const relPath = path.relative(ctx.root, fullPath).replace(/\\/g, '/');
  ctx.result[relPath] = { content: fileData, language };
}

/** Returns the detected language for a file if the extension is supported, or null otherwise. */
function resolveFileLanguage(name: string, fullPath: string): Language | null {
  const ext = path.extname(name).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;
  const language = detectLanguage(fullPath);
  if (language === 'unsupported') return null;
  return language as Language;
}

/** Reads the file content if it is within the size limit; returns null if too large or unreadable. */
async function readFileIfWithinSizeLimit(fullPath: string, maxBytes: number): Promise<string | null> {
  const size = await readFileSize(fullPath);
  if (size === null || size > maxBytes) return null;
  return readFileContent(fullPath);
}

/** Returns the file size in bytes, or null if the stat fails. */
async function readFileSize(fullPath: string): Promise<number | null> {
  try {
    const stat = await fsp.stat(fullPath);
    return stat.size;
  } catch {
    return null;
  }
}

/** Returns file content as a UTF-8 string, or null if reading fails. */
async function readFileContent(fullPath: string): Promise<string | null> {
  try {
    return await fsp.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
