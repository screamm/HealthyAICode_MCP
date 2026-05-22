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

/**
 * Walks a directory tree, reads supported source files, and returns a map
 * of project-relative paths (forward-slash) -> { content, language }.
 */
export async function readProjectFiles(
  directory: string,
  maxFileSizeBytes = 500_000,
): Promise<Record<string, { content: string; language: Language }>> {
  const result: Record<string, { content: string; language: Language }> = {};
  await walkDir(directory, directory, maxFileSizeBytes, result);
  return result;
}

async function walkDir(
  root: string,
  dir: string,
  maxFileSizeBytes: number,
  result: Record<string, { content: string; language: Language }>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name as string;
    const fullPath = path.join(dir, name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
      await walkDir(root, fullPath, maxFileSizeBytes, result);
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const language = detectLanguage(fullPath);
      if (language === 'unsupported') continue;

      let size: number;
      try {
        const stat = await fsp.stat(fullPath);
        size = stat.size;
      } catch {
        continue;
      }
      if (size > maxFileSizeBytes) continue;

      let content: string;
      try {
        content = await fsp.readFile(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
      result[relPath] = { content, language };
    }
  }
}
