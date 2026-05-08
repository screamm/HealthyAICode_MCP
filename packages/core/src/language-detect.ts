import * as path from 'path';
import type { Language } from './types';

const EXTENSION_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
};

/**
 * Detects the programming language of a file based on its extension.
 * Handles both Unix-style (/) and Windows-style (\) path separators.
 *
 * @param filePath - The file path (absolute or relative)
 * @returns The detected language or 'unsupported' if not recognized
 */
export function detectLanguage(filePath: string): Language {
  // Normalize Windows paths to Unix-style for consistent handling
  const normalizedPath = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalizedPath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unsupported';
}
