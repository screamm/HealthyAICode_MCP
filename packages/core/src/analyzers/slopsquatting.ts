/**
 * slopsquatting.ts — Sprint 51–60 (supply-chain / AI-native biomarker)
 *
 * Detects `SlopsquattingRisk`: an import that *looks like* a typosquat of a popular
 * package, OR matches a known LLM-hallucination corpus, OR (opt-in) is a very-new /
 * low-trust package per a live registry lookup.
 *
 * DISTINCT from `HallucinatedPackageImport` (hallucinated-import.ts), which fires when a
 * package is entirely absent from the registry snapshot ("does not exist"). Slopsquatting
 * is the *adversarial* flavour: a package that DOES (or could) exist but is named to be
 * confused with a popular one, or is a name LLMs are known to hallucinate (which attackers
 * then register — "slopsquatting").
 *
 * References (verified 1 Jun 2026):
 *   - "Slopsquatting" coined by Seth Larson; popularised by Bar Lanyado / Lasso Security.
 *     https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks
 *   - Spracklen et al., "We Have a Package for You: A Comprehensive Analysis of Package
 *     Hallucinations by Code Generating LLMs", arXiv:2406.10279 — ~19.7% of LLM-recommended
 *     packages do not exist; 43% of hallucinations repeat across runs (registrable).
 *     https://arxiv.org/abs/2406.10279
 *
 * Design decisions:
 *   - DEFAULT OFFLINE: zero network unless `options.liveCheck === true`. The typosquat +
 *     corpus signals are fully deterministic and require only the bundled snapshots.
 *   - Detection signals (any one fires a smell):
 *       (a) Typosquat: edit-distance 1–2 (Levenshtein) OR single keyboard-adjacent
 *           substitution from a popular package name, AND not an exact match, AND not
 *           present in the caller-supplied lockfile.
 *       (b) Hallucination-corpus hit: name appears in the bundled corpus of names LLMs
 *           are documented to hallucinate.
 *       (c) [opt-in] Live registry: name returns 404, or its first-published date is
 *           < 90 days ago. Only attempted when `options.liveCheck === true` AND a
 *           `fetchPackageMeta` implementation is supplied by the caller.
 *   - Lockfile-aware: a package the project has *deliberately* installed (present in the
 *     supplied lockfile set) is never flagged — it is an intentional dependency, not a
 *     hallucinated/typosquatted suggestion.
 *   - Snapshot reuse: the popular-package list is the same bundled npm/PyPI snapshot used
 *     by hallucinated-import.ts (top ~10k npm / ~15k PyPI by download count).
 *   - Graceful fallback: any I/O error → empty popular set → no typosquat signal (corpus
 *     still works). Never throws.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Smell, Language } from '../types';

// ─── Snapshot types ──────────────────────────────────────────────────────────

interface PackageSnapshot {
  _generatedAt: string;
  packages: string[];
}

// ─── Options ─────────────────────────────────────────────────────────────────

/** Live registry metadata for one package (caller-supplied; only used when liveCheck). */
export interface PackageMeta {
  /** true if the registry has no such package (HTTP 404). */
  notFound: boolean;
  /** ISO-8601 date the package was first published, if known. */
  firstPublished?: string;
}

export interface SlopsquattingOptions {
  /**
   * Opt-in live registry verification. When true AND `fetchPackageMeta` is supplied,
   * each candidate is checked for 404 / first-published < 90 days. DEFAULT false — the
   * detector performs ZERO network I/O when this is omitted or false.
   */
  liveCheck?: boolean;
  /**
   * Caller-supplied async function returning registry metadata for a package name.
   * Only invoked when `liveCheck === true`. The analyzer never performs network I/O
   * itself — keeping it injectable preserves the offline-by-default guarantee and makes
   * the live path deterministically testable.
   */
  fetchPackageMeta?: (name: string, registry: 'npm' | 'pypi') => Promise<PackageMeta>;
  /**
   * Names the project has deliberately installed (e.g. parsed from package-lock.json /
   * poetry.lock / requirements.txt). A package present here is NEVER flagged — it is an
   * intentional dependency, not a hallucinated suggestion. Compared case-insensitively
   * (npm exact-lower; PyPI PEP-503 normalised).
   */
  lockfilePackages?: Iterable<string>;
}

// ─── Module-level caches ─────────────────────────────────────────────────────

let npmPopular: string[] | null = null;
let pypiPopular: string[] | null = null;

const DATA_DIR = path.join(__dirname, '..', 'data');
const NPM_SNAPSHOT_PATH = path.join(DATA_DIR, 'npm-snapshot.json');
const PYPI_SNAPSHOT_PATH = path.join(DATA_DIR, 'pypi-snapshot.json');

/** Load a snapshot's package array; [] on any error (offline-safe). */
function loadPopular(snapshotPath: string): string[] {
  try {
    if (!fs.existsSync(snapshotPath)) return [];
    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as PackageSnapshot;
    return Array.isArray(data.packages) ? data.packages : [];
  } catch {
    return [];
  }
}

function getNpmPopular(): string[] {
  if (npmPopular === null) npmPopular = loadPopular(NPM_SNAPSHOT_PATH);
  return npmPopular;
}

function getPypiPopular(): string[] {
  if (pypiPopular === null) pypiPopular = loadPopular(PYPI_SNAPSHOT_PATH);
  return pypiPopular;
}

/** Exported for tests — clears the popular-package caches. @internal */
export function resetSlopsquattingCaches(): void {
  npmPopular = null;
  pypiPopular = null;
}

// ─── Name normalisation ──────────────────────────────────────────────────────

/** Normalise a PyPI name per PEP 503 (lowercase, [-_.]+ → -). */
function normalisePypi(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Normalise an npm name (lowercase; npm is case-insensitive for new packages). */
function normaliseNpm(name: string): string {
  return name.toLowerCase();
}

// ─── Hallucination corpus ────────────────────────────────────────────────────

/**
 * Names that code-generating LLMs are documented to hallucinate, drawn from the
 * public examples in the slopsquatting / package-hallucination literature
 * (arXiv:2406.10279 and Socket/Lasso reporting). These are plausible-looking names that
 * do not correspond to the canonical popular package — exactly the names attackers
 * pre-register. Stored normalised; matched per-registry.
 *
 * Kept intentionally small and high-precision: every entry is a name reported in the
 * wild, not a speculative permutation, to avoid false positives.
 */
const NPM_HALLUCINATION_CORPUS = new Set<string>([
  'huggingface-cli',          // reported hallucinated alias of @huggingface/* tooling
  'react-native-screens-fix',
  'eslint-config-standardx',
  'jsonwebtoken-utils',
  'openai-node-sdk',          // real pkg is "openai"
  'discord.js-utils',
]);

const PYPI_HALLUCINATION_CORPUS = new Set<string>([
  'huggingface-cli',          // canonical is "huggingface-hub"
  'requests-oauth',           // canonical is "requests-oauthlib"
  'python-tensorflow',        // canonical is "tensorflow"
  'beautifulsoup',            // canonical is "beautifulsoup4"
  'sklearn-utils',
  'matplot',                  // canonical is "matplotlib"
]);

// ─── Distance helpers ────────────────────────────────────────────────────────

/**
 * Levenshtein edit distance with early-exit once it exceeds `max`.
 * Returns a value > max (specifically max + 1) as soon as the bound is provably crossed.
 */
function boundedLevenshtein(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb];
}

/**
 * QWERTY keyboard adjacency map. Used to detect a single keyboard-slip substitution
 * (e.g. "reqct" for "react" — the 'c'/'x' kind of fat-finger), which is a stronger
 * typosquat signal than an arbitrary edit-distance-1 change.
 */
const KEYBOARD_NEIGHBOURS: Record<string, string> = {
  q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'rygf', y: 'tuhg', u: 'yijh',
  i: 'uokj', o: 'iplk', p: 'ol',
  a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb',
  j: 'huikmn', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

/**
 * True if `a` and `b` differ by exactly one substitution where the substituted
 * characters are physically adjacent on a QWERTY keyboard.
 */
function isSingleKeyboardSlip(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffIdx = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (diffIdx !== -1) return false; // more than one differing position
      diffIdx = i;
    }
  }
  if (diffIdx === -1) return false; // identical
  const ca = a[diffIdx].toLowerCase();
  const cb = b[diffIdx].toLowerCase();
  return (KEYBOARD_NEIGHBOURS[ca] ?? '').includes(cb);
}

// ─── Typosquat matching ──────────────────────────────────────────────────────

/**
 * Find a popular package that `candidate` is a likely typosquat of.
 * Returns the matched popular name, or null.
 *
 * Precision controls (to keep false-positive rate low):
 *   - Skip very short names (< 4 chars): edit-distance on tiny names is noisy.
 *   - Require the candidate NOT equal any popular name (handled by caller).
 *   - Levenshtein ≤ 2 for names ≥ 6 chars; ≤ 1 for 4–5 char names.
 *   - A single keyboard-adjacent substitution always counts (any length ≥ 4).
 *   - For scoped npm names we compare the post-slash segment only.
 */
function findTyposquatTarget(candidate: string, popular: string[]): string | null {
  const bare = candidate.includes('/') ? candidate.slice(candidate.indexOf('/') + 1) : candidate;
  if (bare.length < 4) return null;

  const maxDist = bare.length >= 6 ? 2 : 1;

  for (const pop of popular) {
    const popBare = pop.includes('/') ? pop.slice(pop.indexOf('/') + 1) : pop;
    if (popBare.length < 4) continue;
    if (popBare === bare) continue; // exact match handled elsewhere

    // Strong signal: single keyboard slip.
    if (isSingleKeyboardSlip(bare, popBare)) return pop;

    // General edit distance signal.
    const d = boundedLevenshtein(bare, popBare, maxDist);
    if (d >= 1 && d <= maxDist) return pop;
  }
  return null;
}

// ─── Import extraction (reused regex strategy) ───────────────────────────────

interface ExtractedImport {
  name: string;
  line: number;
}

const PYTHON_STDLIB_PREFIXES = new Set([
  'os', 'sys', 'json', 're', 'math', 'collections', 'itertools', 'datetime',
  'pathlib', 'typing', 'asyncio', 'functools', 'logging', 'subprocess', 'random',
  'time', 'unittest', 'abc', 'enum', 'io', 'csv', 'sqlite3', 'http', 'urllib',
  'hashlib', 'hmac', 'base64', 'struct', 'socket', 'threading', 'multiprocessing',
  'dataclasses', 'contextlib', 'argparse', 'copy', 'pickle', 'tempfile', 'shutil',
  'glob', 'warnings', 'inspect', 'traceback', 'string', 'decimal', 'fractions',
  'statistics', 'secrets', 'uuid', 'xml', 'html', 'email', 'ssl', 'ipaddress',
]);

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'crypto', 'dns',
  'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'process',
  'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty',
  'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

function extractPythonImports(code: string): ExtractedImport[] {
  const lines = code.split('\n');
  const out: ExtractedImport[] = [];
  const IMPORT_RE = /^\s*import\s+([\w.]+)/;
  const FROM_IMPORT_RE = /^\s*from\s+(\.*)(\w[\w.]*)\s+import/;
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const im = IMPORT_RE.exec(line);
    if (im) {
      const top = im[1].split('.')[0];
      if (!PYTHON_STDLIB_PREFIXES.has(top) && !seen.has(top)) {
        seen.add(top);
        out.push({ name: top, line: i + 1 });
      }
      continue;
    }
    const fm = FROM_IMPORT_RE.exec(line);
    if (fm && fm[1].length === 0) {
      const top = fm[2].split('.')[0];
      if (!PYTHON_STDLIB_PREFIXES.has(top) && !seen.has(top)) {
        seen.add(top);
        out.push({ name: top, line: i + 1 });
      }
    }
  }
  return out;
}

function extractTsJsImports(code: string): ExtractedImport[] {
  const out: ExtractedImport[] = [];
  const seen = new Set<string>();
  const IMPORT_FROM_RE = /\bimport\b[^'"]*?from\s+['"]([^'"]+)['"]/g;
  const BARE_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;
  const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  function processSpecifier(specifier: string, line: number): void {
    if (specifier.startsWith('./') || specifier.startsWith('../')) return;
    if (specifier.startsWith('node:')) return;
    let pkg: string;
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      pkg = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    } else {
      pkg = specifier.split('/')[0];
    }
    if (NODE_BUILTINS.has(pkg)) return;
    if (!seen.has(pkg)) {
      seen.add(pkg);
      out.push({ name: pkg, line });
    }
  }

  function scan(re: RegExp): void {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const lineNum = code.slice(0, m.index).split('\n').length;
      processSpecifier(m[1], lineNum);
    }
  }

  scan(IMPORT_FROM_RE);
  scan(BARE_IMPORT_RE);
  scan(REQUIRE_RE);
  scan(DYNAMIC_IMPORT_RE);
  out.sort((a, b) => a.line - b.line);
  return out;
}

// ─── Smell builders ──────────────────────────────────────────────────────────

function buildTyposquatSmell(
  candidate: string,
  target: string,
  line: number,
  registry: 'npm' | 'PyPI',
): Smell {
  return {
    type: 'SlopsquattingRisk',
    severity: 'high',
    line,
    description:
      `Import "${candidate}" closely resembles the popular ${registry} package "${target}" ` +
      `(typosquat distance ≤ 2). Slopsquatting attackers register names that look like — or ` +
      `that LLMs hallucinate in place of — popular packages (arXiv:2406.10279).`,
    suggestion:
      `Confirm you meant "${target}", not "${candidate}". If "${candidate}" is intentional, ` +
      `add it to your lockfile so this check treats it as a deliberate dependency.`,
  };
}

function buildCorpusSmell(candidate: string, line: number, registry: 'npm' | 'PyPI'): Smell {
  return {
    type: 'SlopsquattingRisk',
    severity: 'high',
    line,
    description:
      `Import "${candidate}" matches a documented LLM package-hallucination on ${registry}. ` +
      `Such names are pre-registered by slopsquatting attackers (arXiv:2406.10279; Socket/Lasso).`,
    suggestion:
      `Verify "${candidate}" is the package you intend before installing — it is a name code-` +
      `generating models commonly invent. Prefer the canonical package and pin it in your lockfile.`,
  };
}

function buildLiveSmell(
  candidate: string,
  line: number,
  registry: 'npm' | 'PyPI',
  reason: '404' | 'new',
): Smell {
  const why =
    reason === '404'
      ? `is not currently published on ${registry} (registry returned 404)`
      : `was first published < 90 days ago on ${registry}`;
  return {
    type: 'SlopsquattingRisk',
    severity: 'high',
    line,
    description:
      `Import "${candidate}" ${why} — a low-trust signal consistent with a slopsquatting / ` +
      `freshly-registered hallucinated package (arXiv:2406.10279).`,
    suggestion:
      `Treat "${candidate}" with caution: confirm provenance and maintainer reputation before ` +
      `installing. New or absent packages are the primary slopsquatting attack surface.`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Resolves registry-specific helpers for a supported language, or null if unsupported. */
function registryContext(language: Language): {
  registryKey: 'npm' | 'pypi';
  registryLabel: 'npm' | 'PyPI';
  normalise: (name: string) => string;
  popular: string[];
  popularNormalised: Set<string>;
  corpus: ReadonlySet<string>;
  extract: (code: string) => ExtractedImport[];
} | null {
  const isPython = language === 'python';
  const isTsJs = language === 'typescript' || language === 'javascript';
  if (!isPython && !isTsJs) return null;

  const normalise = isPython ? normalisePypi : normaliseNpm;
  const popular = isPython ? getPypiPopular() : getNpmPopular();
  return {
    registryKey: isPython ? 'pypi' : 'npm',
    registryLabel: isPython ? 'PyPI' : 'npm',
    normalise,
    popular,
    popularNormalised: new Set(popular.map(normalise)),
    corpus: isPython ? PYPI_HALLUCINATION_CORPUS : NPM_HALLUCINATION_CORPUS,
    extract: isPython ? extractPythonImports : extractTsJsImports,
  };
}

/**
 * Synchronous, ZERO-network slopsquatting detection (typosquat + hallucination-corpus
 * signals only). This is the entry point wired into the per-file `analyzeCode` pipeline,
 * since that pipeline is synchronous and must never perform network I/O.
 *
 * The opt-in live-registry path lives in the async {@link detectSlopsquatting}.
 *
 * @param code     Source code string.
 * @param language Detected language — only typescript/javascript/python are analysed.
 * @param filePath File path (informational).
 * @param options  Optional lockfile configuration (live-check options are ignored here).
 */
export function detectSlopsquattingOffline(
  code: string,
  language: Language,
  _filePath: string,
  options: Pick<SlopsquattingOptions, 'lockfilePackages'> = {},
): Smell[] {
  const ctx = registryContext(language);
  if (ctx === null) return [];

  const lockfile = new Set<string>();
  if (options.lockfilePackages) {
    for (const p of options.lockfilePackages) lockfile.add(ctx.normalise(p));
  }

  const popularNormalised = ctx.popular.map(ctx.normalise);
  const imports = ctx.extract(code);
  const smells: Smell[] = [];

  for (const imp of imports) {
    const norm = ctx.normalise(imp.name);

    // Deliberate dependency — never flagged.
    if (lockfile.has(norm)) continue;
    // Exact match against a popular package — definitely legitimate, never flagged.
    if (ctx.popularNormalised.has(norm)) continue;

    // (b) Hallucination-corpus hit (highest precision — exact, documented name).
    if (ctx.corpus.has(norm)) {
      smells.push(buildCorpusSmell(imp.name, imp.line, ctx.registryLabel));
      continue;
    }

    // (a) Typosquat distance to a popular package.
    const target = findTyposquatTarget(norm, popularNormalised);
    if (target) {
      smells.push(buildTyposquatSmell(imp.name, target, imp.line, ctx.registryLabel));
    }
  }

  return smells;
}

/**
 * Detect `SlopsquattingRisk` smells in source code.
 *
 * OFFLINE BY DEFAULT: performs no network I/O unless `options.liveCheck === true` AND a
 * `fetchPackageMeta` implementation is supplied. The offline signals (typosquat + corpus)
 * are computed by {@link detectSlopsquattingOffline}; this async wrapper adds the opt-in
 * live-registry path on top.
 *
 * @param code     Source code string.
 * @param language Detected language — only typescript/javascript/python are analysed.
 * @param filePath File path (informational).
 * @param options  Optional live-check / lockfile configuration.
 */
export async function detectSlopsquatting(
  code: string,
  language: Language,
  filePath: string,
  options: SlopsquattingOptions = {},
): Promise<Smell[]> {
  const ctx = registryContext(language);
  if (ctx === null) return [];

  // Offline signals first (typosquat + corpus). These never reach the live fetcher.
  const smells = detectSlopsquattingOffline(code, language, filePath, options);

  // (c) [opt-in] live registry verification — ONLY with explicit opt-in + fetcher.
  if (options.liveCheck !== true || typeof options.fetchPackageMeta !== 'function') {
    return smells;
  }

  const lockfile = new Set<string>();
  if (options.lockfilePackages) {
    for (const p of options.lockfilePackages) lockfile.add(ctx.normalise(p));
  }
  const popularNormalised = ctx.popular.map(ctx.normalise);
  const flaggedLines = new Set(smells.map((s) => s.line));

  for (const imp of ctx.extract(code)) {
    const norm = ctx.normalise(imp.name);
    // Skip anything already resolved offline (lockfile / popular / corpus / typosquat).
    if (lockfile.has(norm)) continue;
    if (ctx.popularNormalised.has(norm)) continue;
    if (ctx.corpus.has(norm)) continue;
    if (findTyposquatTarget(norm, popularNormalised)) continue;
    if (flaggedLines.has(imp.line)) continue;

    try {
      const meta = await options.fetchPackageMeta(imp.name, ctx.registryKey);
      if (meta.notFound) {
        smells.push(buildLiveSmell(imp.name, imp.line, ctx.registryLabel, '404'));
      } else if (meta.firstPublished) {
        const ageMs = Date.now() - new Date(meta.firstPublished).getTime();
        if (ageMs >= 0 && ageMs < 90 * 24 * 60 * 60 * 1000) {
          smells.push(buildLiveSmell(imp.name, imp.line, ctx.registryLabel, 'new'));
        }
      }
    } catch {
      // Network/fetcher failure is non-fatal: offline signals already applied.
    }
  }

  return smells;
}
