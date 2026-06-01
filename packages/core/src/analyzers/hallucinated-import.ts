/**
 * hallucinated-import.ts — Sprint 57
 *
 * Detects HallucinatedPackageImport (slopsquatting) by extracting import/require
 * statements and cross-checking against cached PyPI/npm package name snapshots.
 *
 * References:
 *   arXiv 2501.19012 — LLM tools recommend non-existent packages in 19.7 % of samples.
 *
 * Design decisions:
 *   - Regex-based import extraction (language-agnostic, no new tree-sitter grammar needed).
 *   - Offline-first: snapshot loaded once per process, cached in module scope.
 *   - Graceful fallback: if snapshot missing or unreadable → return [] (never throw).
 *   - Case-insensitive for PyPI (PEP 503 normalisation); exact-match for npm.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Smell, Language } from '../types';

// ─── Snapshot types ────────────────────────────────────────────────────────────

interface PackageSnapshot {
  _generatedAt: string;
  packages: string[];
}

// ─── Module-level caches ───────────────────────────────────────────────────────

let npmCache: Set<string> | null = null;
let pypiCache: Set<string> | null = null;

/** Maximum age (ms) before the snapshot is considered stale and a warning is emitted. */
const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const DATA_DIR = path.join(__dirname, '..', 'data');
const NPM_SNAPSHOT_PATH = path.join(DATA_DIR, 'npm-snapshot.json');
const PYPI_SNAPSHOT_PATH = path.join(DATA_DIR, 'pypi-snapshot.json');

// ─── Snapshot loader ───────────────────────────────────────────────────────────

/**
 * Load a package snapshot file and return a Set of package names.
 * Returns null on any error (missing file, parse error, etc.).
 */
function loadSnapshot(snapshotPath: string, caseInsensitive: boolean): Set<string> | null {
  try {
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const data = JSON.parse(raw) as PackageSnapshot;

    // Warn if snapshot is stale (> 30 days old)
    if (data._generatedAt) {
      const age = Date.now() - new Date(data._generatedAt).getTime();
      if (age > SNAPSHOT_MAX_AGE_MS) {
        console.warn(
          `[hallucinated-import] Package snapshot at ${snapshotPath} is older than 30 days. ` +
          `Run scripts/update-package-snapshots.mjs to refresh.`,
        );
      }
    }

    if (!Array.isArray(data.packages)) {
      return null;
    }

    const entries = caseInsensitive
      ? data.packages.map((p) => normalisePackageName(p))
      : data.packages;

    return new Set(entries);
  } catch {
    return null;
  }
}

/** Normalise a PyPI package name per PEP 503 (lowercase, replace [-_.] with -). */
function normalisePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function getNpmSnapshot(): Set<string> | null {
  if (npmCache === null) {
    npmCache = loadSnapshot(NPM_SNAPSHOT_PATH, false) ?? null;
  }
  return npmCache;
}

function getPypiSnapshot(): Set<string> | null {
  if (pypiCache === null) {
    pypiCache = loadSnapshot(PYPI_SNAPSHOT_PATH, true) ?? null;
  }
  return pypiCache;
}

// ─── Built-in / stdlib filters ─────────────────────────────────────────────────

/**
 * Node.js built-in modules (non-exhaustive but covers the common cases).
 * Imports of these should never be flagged.
 */
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // Node protocol imports: node:fs, node:path, etc. (resolved to the base name)
]);

/**
 * Python standard library modules (non-exhaustive but covers the common cases).
 * Generated from the CPython 3.12 stdlib list.
 */
const PYTHON_STDLIB = new Set([
  '__future__', '_thread', 'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat',
  'asyncio', 'asyncore', 'atexit', 'audioop', 'base64', 'bdb', 'binascii',
  'binhex', 'bisect', 'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk',
  'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys',
  'compileall', 'concurrent', 'configparser', 'contextlib', 'contextvars',
  'copy', 'copyreg', 'cProfile', 'csv', 'ctypes', 'curses', 'dataclasses',
  'datetime', 'dbm', 'decimal', 'difflib', 'dis', 'doctest', 'email', 'encodings',
  'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
  'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext',
  'glob', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib',
  'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress',
  'itertools', 'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging',
  'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap',
  'modulefinder', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers',
  'operator', 'optparse', 'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle',
  'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib', 'poplib', 'posix',
  'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile',
  'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib',
  'resource', 'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors',
  'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr',
  'socket', 'socketserver', 'spwd', 'sqlite3', 'sre_compile', 'sre_constants',
  'sre_parse', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny',
  'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading',
  'time', 'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace',
  'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing',
  'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings',
  'wave', 'weakref', 'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xdrlib',
  'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo',
  // Common sub-packages that appear as top-level imports
  'typing_extensions', 'pathlib', 'contextlib', 'dataclasses', 'functools',
]);

// ─── Import extractors ─────────────────────────────────────────────────────────

interface ExtractedImport {
  name: string;
  line: number;
}

/**
 * Extract top-level package names from Python source code.
 * Handles:
 *   import foo
 *   import foo.bar            → top-level name is "foo"
 *   from foo import bar       → top-level name is "foo"
 *   from foo.bar import baz   → top-level name is "foo"
 * Filters out relative imports (.foo, ..foo) and stdlib modules.
 */
function extractPythonImports(code: string): ExtractedImport[] {
  const lines = code.split('\n');
  const imports: ExtractedImport[] = [];

  // import foo  /  import foo.bar  /  import foo as f
  const IMPORT_RE = /^\s*import\s+([\w.]+)/;
  // from foo import ...  /  from foo.bar import ...
  const FROM_IMPORT_RE = /^\s*from\s+(\.*)(\w[\w.]*)\s+import/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const importMatch = IMPORT_RE.exec(line);
    if (importMatch) {
      // Take only the top-level package name (before the first dot)
      const topLevel = importMatch[1].split('.')[0];
      if (!PYTHON_STDLIB.has(topLevel)) {
        imports.push({ name: topLevel, line: i + 1 });
      }
      continue;
    }

    const fromMatch = FROM_IMPORT_RE.exec(line);
    if (fromMatch) {
      const dots = fromMatch[1]; // relative prefix ('.', '..', etc.)
      const modName = fromMatch[2];
      if (dots.length === 0) {
        // Absolute import: take top-level package
        const topLevel = modName.split('.')[0];
        if (!PYTHON_STDLIB.has(topLevel)) {
          imports.push({ name: topLevel, line: i + 1 });
        }
      }
      // Relative imports are skipped (they are internal to the project)
    }
  }

  return imports;
}

/**
 * Extract package names from TypeScript/JavaScript source code.
 * Handles:
 *   import ... from 'foo'
 *   import ... from 'foo/bar'   → top-level name is "foo"
 *   import ... from '@scope/pkg' → keep the full scoped name
 *   require('foo')
 *   require('foo/bar')          → top-level name is "foo"
 * Filters out:
 *   - Relative imports (./foo, ../foo)
 *   - Node.js built-ins
 *   - node: protocol imports
 */
function extractTsJsImports(code: string): ExtractedImport[] {
  const lines = code.split('\n');
  const imports: ExtractedImport[] = [];

  // static import: import ... from 'specifier'  or  import 'specifier'
  const IMPORT_FROM_RE = /\bimport\b[^'"]*?from\s+['"]([^'"]+)['"]/g;
  const BARE_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;
  // require('specifier')
  const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // dynamic import('specifier')
  const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const seen = new Set<string>();

  function processSpecifier(specifier: string, line: number): void {
    // Skip relative imports
    if (specifier.startsWith('./') || specifier.startsWith('../')) return;
    // Skip node: protocol
    if (specifier.startsWith('node:')) return;

    // Resolve top-level package name
    let pkgName: string;
    if (specifier.startsWith('@')) {
      // Scoped package: take @scope/name
      const parts = specifier.split('/');
      pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    } else {
      // Un-scoped: take the first path segment
      pkgName = specifier.split('/')[0];
    }

    // Skip Node.js builtins
    if (NODE_BUILTINS.has(pkgName)) return;

    // Deduplicate within the file
    if (!seen.has(pkgName)) {
      seen.add(pkgName);
      imports.push({ name: pkgName, line });
    }
  }

  function scanRegex(re: RegExp): void {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      // Compute 1-indexed line number from match position
      const lineNum = code.slice(0, m.index).split('\n').length;
      processSpecifier(m[1], lineNum);
    }
  }

  scanRegex(IMPORT_FROM_RE);
  scanRegex(BARE_IMPORT_RE);
  scanRegex(REQUIRE_RE);
  scanRegex(DYNAMIC_IMPORT_RE);

  // Preserve line order: sort by line number
  imports.sort((a, b) => a.line - b.line);

  // Remove duplicate line entries (multi-regex can produce them)
  const dedupedByLine: ExtractedImport[] = [];
  const lineNameSeen = new Set<string>();
  for (const imp of imports) {
    const key = `${imp.line}:${imp.name}`;
    if (!lineNameSeen.has(key)) {
      lineNameSeen.add(key);
      dedupedByLine.push(imp);
    }
  }

  return dedupedByLine;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect potentially hallucinated package imports in source code.
 *
 * For each third-party import that is not found in the cached npm/PyPI snapshot,
 * emits a HallucinatedPackageImport smell.
 *
 * Behaviour when snapshot is missing: returns [] (offline-safe fallback).
 *
 * @param code     Source code string.
 * @param language Detected language — only typescript/javascript/python are checked.
 * @param filePath File path (for informational context in descriptions).
 * @returns        Array of Smell objects, one per unrecognised package.
 */
export function detectHallucinatedImports(
  code: string,
  language: Language,
  filePath: string,
): Smell[] {
  const smells: Smell[] = [];

  if (language === 'python') {
    const snapshot = getPypiSnapshot();
    if (snapshot === null) return [];

    const imports = extractPythonImports(code);
    for (const imp of imports) {
      const normalised = normalisePackageName(imp.name);
      if (!snapshot.has(normalised)) {
        smells.push(buildSmell(imp.name, imp.line, 'python', filePath));
      }
    }
  } else if (language === 'typescript' || language === 'javascript') {
    const snapshot = getNpmSnapshot();
    if (snapshot === null) return [];

    const imports = extractTsJsImports(code);
    for (const imp of imports) {
      if (!snapshot.has(imp.name)) {
        smells.push(buildSmell(imp.name, imp.line, language, filePath));
      }
    }
  }
  // Other languages are not checked (imports have different semantics or
  // we lack a reliable registry snapshot).

  return smells;
}

/** Build a HallucinatedPackageImport Smell for a package name not in the snapshot. */
function buildSmell(
  packageName: string,
  line: number,
  language: string,
  filePath: string,
): Smell {
  const registry = language === 'python' ? 'PyPI' : 'npm';
  return {
    type: 'HallucinatedPackageImport',
    severity: 'high',
    line,
    description:
      `Package "${packageName}" not found in cached ${registry} registry snapshot — ` +
      `potential slopsquatting risk. LLM tools recommend non-existent packages in ~20 % ` +
      `of generated code samples (arXiv 2501.19012).`,
    suggestion:
      `Verify that "${packageName}" is a real, published ${registry} package before ` +
      `installing. Check ${registry === 'PyPI' ? 'https://pypi.org/project/' + packageName : 'https://www.npmjs.com/package/' + packageName}. ` +
      `If the package is genuinely new or the snapshot is stale, run ` +
      `scripts/update-package-snapshots.mjs to refresh the registry cache.`,
  };
}

/**
 * Exported for testing: allow tests to inject a custom snapshot path via
 * resetting the module-level caches. Call resetSnapshotCaches() before
 * each test that uses a custom snapshot.
 *
 * @internal
 */
export function resetSnapshotCaches(): void {
  npmCache = null;
  pypiCache = null;
}
