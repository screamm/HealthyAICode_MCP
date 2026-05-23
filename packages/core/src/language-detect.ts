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
  '.rs': 'rust',
  '.go': 'go',
  '.php': 'php',
  '.phtml': 'php',
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.swift': 'swift',
  // Tier B — new languages (Sprint 25 gap fix)
  '.dart': 'dart',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.scala': 'scala',
  // Tier B languages
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.lua': 'lua',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.r': 'r',
  '.R': 'r',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.edn': 'clojure',
  // Tier C languages
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.dockerfile': 'dockerfile',
  '.tf': 'hcl',
  '.tfvars': 'hcl',
  '.mk': 'makefile',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.toml': 'toml',
};

/**
 * Basename map for files without extensions (e.g. Dockerfile, Makefile).
 */
const BASENAME_MAP: Record<string, Language> = {
  'dockerfile': 'dockerfile',
  'makefile': 'makefile',
  'gnumakefile': 'makefile',
};

/**
 * Detects the programming language of a file based on its extension or basename.
 * Handles both Unix-style (/) and Windows-style (\) path separators.
 *
 * @param filePath - The file path (absolute or relative)
 * @returns The detected language or 'unsupported' if not recognized
 */
export function detectLanguage(filePath: string): Language {
  // Normalize Windows paths to Unix-style for consistent handling
  const normalizedPath = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalizedPath).toLowerCase();

  // Check extension first (case-sensitive for .r vs .R)
  const extOriginal = path.extname(filePath);
  if (extOriginal && EXTENSION_MAP[extOriginal]) return EXTENSION_MAP[extOriginal];
  if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];

  // Fall back to basename match for extensionless files (Dockerfile, Makefile)
  const base = path.basename(normalizedPath).toLowerCase();
  return BASENAME_MAP[base] ?? 'unsupported';
}
