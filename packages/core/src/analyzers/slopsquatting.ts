/**
 * slopsquatting.ts — Sprint 51–60 (supply-chain / AI-native biomarker), hardened.
 *
 * Detects `SlopsquattingRisk`: an import that *looks like* a typosquat of a prominent
 * package, OR matches a curated LLM-hallucination corpus, OR (opt-in) is a very-new /
 * low-trust package per a live registry lookup.
 *
 * DISTINCT from `HallucinatedPackageImport` (hallucinated-import.ts), which fires when a
 * package is entirely absent from the registry snapshot ("does not exist"). Slopsquatting
 * is the *adversarial* flavour: a package that DOES (or could) exist but is named to be
 * confused with a prominent one, or is a name LLMs are known to hallucinate (which
 * attackers then register — "slopsquatting").
 *
 * References (verified 1–2 Jun 2026):
 *   - "Slopsquatting" coined by Seth Larson; popularised by Bar Lanyado / Lasso Security.
 *     https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks
 *   - Spracklen et al., "We Have a Package for You" (USENIX Security 2025; arXiv:2406.10279)
 *     — ~19.7% of LLM-recommended packages do not exist; 43% of hallucinations repeat.
 *   - SpellBound (USENIX 2020): lexical similarity MUST be combined with a popularity
 *     signal to keep the false-positive rate low (they reached 0.5%).
 *
 * PRECISION DESIGN (the hardening):
 *   1. Typosquat matching runs ONLY against a small curated set of *prominent* packages
 *      (data/slopsquatting/prominent-targets.json), NOT the full 10k/15k popularity
 *      snapshot. Empirically, 18% of names in the full npm snapshot are within
 *      Levenshtein <=2 of another DIFFERENT real package (jest/nest, core/code,
 *      parser/parse, mysql/mysql2, openai/openapi, …). Matching the full snapshot floods
 *      the output with false positives on legitimate niche packages. Typosquat attacks
 *      target *prominent* names, so the curated target set captures the real attack
 *      surface at near-zero FP.
 *   2. Only *high-signal single-edit operations* count as a typosquat: a single
 *      keyboard-adjacent substitution, a single homoglyph substitution, a single adjacent
 *      transposition, or a single NON-NUMERIC insertion/deletion. Arbitrary two-edit
 *      changes and pure-digit insert/deletes (mysql→mysql2, sqlite→sqlite3) are rejected.
 *   3. Separator and plural variants of a prominent name are never flagged
 *      (ts-utils≡tsutils, type≡types) — these are legitimate package families.
 *   4. A small curated allow-list (KNOWN_DISTINCT_*) suppresses the handful of real
 *      packages that are genuinely one high-signal edit from a prominent target
 *      (preact/react, nest/jest, fastai/fastapi, oauthlib/authlib, …).
 *   5. A candidate present in the full popularity snapshot is never flagged — it is a real
 *      package, regardless of its similarity to a prominent name.
 *
 * Other design decisions:
 *   - DEFAULT OFFLINE: zero network unless `options.liveCheck === true` AND the caller
 *     supplies a `fetchPackageMeta`. The analyzer never performs network I/O itself.
 *   - Lockfile-aware: a package the project has *deliberately* installed (present in the
 *     supplied lockfile set) is never flagged.
 *   - Graceful fallback: any I/O error → empty data set → that signal is silently skipped
 *     (other signals still apply). Never throws.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Smell, Language } from '../types';

// ─── Snapshot / data-file types ───────────────────────────────────────────────

interface PackageSnapshot {
  _generatedAt?: string;
  packages: string[];
}

interface ProminentTargetsFile {
  npm: string[];
  pypi: string[];
}

interface CorpusEntry {
  ecosystem: string;
  package_name: string;
  pattern?: string;
  likely_real_alternative?: string | null;
}

interface CorpusFile {
  entries: CorpusEntry[];
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
let npmProminent: string[] | null = null;
let pypiProminent: string[] | null = null;
let npmCorpus: Set<string> | null = null;
let pypiCorpus: Set<string> | null = null;
// Derived, normalised lookups — cached so per-import analysis does not rebuild large Sets.
let npmPopularNormalised: Set<string> | null = null;
let pypiPopularNormalised: Set<string> | null = null;
let npmProminentNormalised: string[] | null = null;
let pypiProminentNormalised: string[] | null = null;

const DATA_DIR = path.join(__dirname, '..', 'data');
const NPM_SNAPSHOT_PATH = path.join(DATA_DIR, 'npm-snapshot.json');
const PYPI_SNAPSHOT_PATH = path.join(DATA_DIR, 'pypi-snapshot.json');
const PROMINENT_TARGETS_PATH = path.join(DATA_DIR, 'slopsquatting', 'prominent-targets.json');
const CORPUS_PATH = path.join(DATA_DIR, 'slopsquatting', 'hallucinated-corpus.json');

/** Read & JSON-parse a data file; null on any error (offline-safe). */
function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Load a snapshot's package array; [] on any error (offline-safe). */
function loadPopular(snapshotPath: string): string[] {
  const data = readJson<PackageSnapshot>(snapshotPath);
  return data && Array.isArray(data.packages) ? data.packages : [];
}

function getNpmPopular(): string[] {
  if (npmPopular === null) npmPopular = loadPopular(NPM_SNAPSHOT_PATH);
  return npmPopular;
}

function getPypiPopular(): string[] {
  if (pypiPopular === null) pypiPopular = loadPopular(PYPI_SNAPSHOT_PATH);
  return pypiPopular;
}

/** Load the curated prominent-targets file; [] on any error. */
function loadProminent(): { npm: string[]; pypi: string[] } {
  const data = readJson<ProminentTargetsFile>(PROMINENT_TARGETS_PATH);
  return {
    npm: data && Array.isArray(data.npm) ? data.npm : [],
    pypi: data && Array.isArray(data.pypi) ? data.pypi : [],
  };
}

function getNpmProminent(): string[] {
  if (npmProminent === null) npmProminent = loadProminent().npm;
  return npmProminent;
}

function getPypiProminent(): string[] {
  if (pypiProminent === null) pypiProminent = loadProminent().pypi;
  return pypiProminent;
}

/**
 * Build the per-registry hallucination corpus from the curated JSON, EXCLUDING any entry
 * whose name collides with a real popular package (e.g. `llama-cpp-python`, which is a
 * real PyPI package despite a corpus note about a hallucinated variant). Stored normalised.
 */
function loadCorpus(): { npm: Set<string>; pypi: Set<string> } {
  const npm = new Set<string>();
  const pypi = new Set<string>();
  const data = readJson<CorpusFile>(CORPUS_PATH);
  if (!data || !Array.isArray(data.entries)) return { npm, pypi };

  const npmPopularSet = new Set(getNpmPopular().map(normaliseNpm));
  const pypiPopularSet = new Set(getPypiPopular().map(normalisePypi));

  for (const e of data.entries) {
    if (!e || typeof e.package_name !== 'string') continue;
    // Only npm/pypi entries are actionable here; other ecosystems are out of scope.
    if (e.ecosystem === 'npm') {
      const norm = normaliseNpm(bareName(e.package_name));
      if (norm.length === 0) continue;
      if (npmPopularSet.has(norm)) continue; // real package — never treat as hallucination
      npm.add(norm);
    } else if (e.ecosystem === 'pypi') {
      const norm = normalisePypi(bareName(e.package_name));
      if (norm.length === 0) continue;
      if (pypiPopularSet.has(norm)) continue; // real package — never treat as hallucination
      pypi.add(norm);
    }
  }
  return { npm, pypi };
}

function getNpmCorpus(): ReadonlySet<string> {
  if (npmCorpus === null) {
    const loaded = loadCorpus();
    npmCorpus = loaded.npm;
    pypiCorpus = loaded.pypi;
  }
  return npmCorpus;
}

function getPypiCorpus(): ReadonlySet<string> {
  if (pypiCorpus === null) {
    const loaded = loadCorpus();
    npmCorpus = loaded.npm;
    pypiCorpus = loaded.pypi;
  }
  return pypiCorpus;
}

/** Exported for tests — clears all data caches. @internal */
export function resetSlopsquattingCaches(): void {
  npmPopular = null;
  pypiPopular = null;
  npmProminent = null;
  pypiProminent = null;
  npmCorpus = null;
  pypiCorpus = null;
  npmPopularNormalised = null;
  pypiPopularNormalised = null;
  npmProminentNormalised = null;
  pypiProminentNormalised = null;
}

function getNpmPopularNormalised(): Set<string> {
  if (npmPopularNormalised === null) {
    npmPopularNormalised = new Set(getNpmPopular().map(normaliseNpm));
  }
  return npmPopularNormalised;
}

function getPypiPopularNormalised(): Set<string> {
  if (pypiPopularNormalised === null) {
    pypiPopularNormalised = new Set(getPypiPopular().map(normalisePypi));
  }
  return pypiPopularNormalised;
}

function getNpmProminentNormalised(): string[] {
  if (npmProminentNormalised === null) {
    npmProminentNormalised = getNpmProminent().map(normaliseNpm);
  }
  return npmProminentNormalised;
}

function getPypiProminentNormalised(): string[] {
  if (pypiProminentNormalised === null) {
    pypiProminentNormalised = getPypiProminent().map(normalisePypi);
  }
  return pypiProminentNormalised;
}

// ─── Name normalisation ──────────────────────────────────────────────────────

/** Strip an npm scope or sub-path to the bare segment used for distance comparison. */
function bareName(name: string): string {
  return name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
}

/** Normalise a PyPI name per PEP 503 (lowercase, [-_.]+ → -). */
function normalisePypi(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Normalise an npm name (lowercase; npm is case-insensitive for new packages). */
function normaliseNpm(name: string): string {
  return name.toLowerCase();
}

/** Collapse all separators — used to recognise hyphen/underscore/dot variants as equal. */
function collapseSeparators(name: string): string {
  return name.replace(/[-_.]/g, '');
}

/** Drop a single trailing plural 's' — used to recognise plural variants as equal. */
function depluralise(name: string): string {
  return name.endsWith('s') ? name.slice(0, -1) : name;
}

// ─── Known-distinct allow-list ─────────────────────────────────────────────────

/**
 * Real packages that are genuinely a single high-signal edit away from a prominent target
 * but are legitimate, well-known, distinct packages. Without this list they would be the
 * only residual false positives. Each entry is a real package on its registry as of
 * 2026-06-02. Stored normalised; matched per-registry.
 */
const NPM_KNOWN_DISTINCT = new Set<string>([
  'preact',     // ~ react
  'nest',       // ~ jest (and @nestjs/*)
  'core',       // ~ cors / code
  'axis',       // ~ axios
  'prism',      // ~ prisma
  'query',      // ~ jquery
  'rambda',     // ~ ramda (real, faster ramda alternative)
  'vuex',       // ~ vue
  'ttypescript', // ~ typescript (real transformer-enabled tsc wrapper)
  'globo',      // ~ glob
  'nodaemon',   // ~ nodemon
]);

const PYPI_KNOWN_DISTINCT = new Set<string>([
  'fastai',         // ~ fastapi
  'oauthlib',       // ~ authlib
  'pyaml',          // ~ pyyaml (real distinct YAML lib)
  'pyyml',          // ~ pyyaml
  'torchx',         // ~ torch
  'ipytest',        // ~ pytest
  'ctransformers',  // ~ transformers
  'openapi',        // ~ openai
  'grequests',      // ~ requests (real gevent-based requests)
]);

// ─── High-signal single-edit typosquat detection ──────────────────────────────

/**
 * QWERTY keyboard adjacency map. Used to detect a single keyboard-slip substitution
 * (e.g. "reqct" for "react"), which is a strong, deliberate-looking typosquat signal.
 */
const KEYBOARD_NEIGHBOURS: Record<string, string> = {
  q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'rygf', y: 'tuhg', u: 'yijh',
  i: 'uokj', o: 'iplk', p: 'ol',
  a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb',
  j: 'huikmn', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

/** Common visual / numeric homoglyph substitutions used by typosquat attackers. */
const HOMOGLYPHS: Record<string, string> = {
  '0': 'o', o: '0', '1': 'l', l: '1', i: '1', '5': 's', s: '5',
};

type TyposquatOp = 'keyslip' | 'homoglyph' | 'transpose' | 'indel';

/**
 * Classify the single edit (if any) that turns `a` into `b` as a high-signal typosquat
 * operation. Returns the operation kind, or null if `a`→`b` is not a single high-signal
 * edit. The accepted operations are deliberately narrow to maximise precision:
 *   - keyslip:   one substitution where the two chars are physically adjacent on QWERTY.
 *   - homoglyph: one substitution between visually-confusable chars (0/o, 1/l/i, 5/s).
 *   - transpose: one swap of two *adjacent* characters.
 *   - indel:     one inserted/deleted character that is NOT a digit (digits commonly
 *                distinguish legitimate package families, e.g. sqlite/sqlite3).
 * A plain non-adjacent single substitution (e.g. jest→nest, core→code) is NOT accepted —
 * those collide heavily with legitimate distinct packages.
 */
function classifyTyposquatOp(a: string, b: string): TyposquatOp | null {
  if (a === b) return null;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return null;

  if (la === lb) {
    const diffs: number[] = [];
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) diffs.push(i);
    }
    if (diffs.length === 1) {
      const ca = a[diffs[0]];
      const cb = b[diffs[0]];
      if ((KEYBOARD_NEIGHBOURS[ca] ?? '').includes(cb)) return 'keyslip';
      if (HOMOGLYPHS[ca] === cb || HOMOGLYPHS[cb] === ca) return 'homoglyph';
      return null; // plain substitution — too noisy
    }
    if (
      diffs.length === 2 &&
      diffs[1] === diffs[0] + 1 &&
      a[diffs[0]] === b[diffs[1]] &&
      a[diffs[1]] === b[diffs[0]]
    ) {
      return 'transpose';
    }
    return null;
  }

  // Length differs by exactly one: a single insertion or deletion.
  const longer = la > lb ? a : b;
  const shorter = la > lb ? b : a;
  let i = 0;
  let j = 0;
  let skips = 0;
  let editChar = '';
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i++;
      j++;
    } else {
      editChar = longer[i];
      i++;
      skips++;
      if (skips > 1) return null;
    }
  }
  if (skips === 0) editChar = longer[longer.length - 1]; // trailing edit
  if (/[0-9]/.test(editChar)) return null; // numeric edit — legitimate family distinction
  return 'indel';
}

/**
 * Find a prominent package that `candidate` is a likely typosquat of.
 * Returns { target, op } or null.
 *
 * Precision controls:
 *   - Candidate must be >= 4 chars (edit distance on tiny names is noise).
 *   - Candidate must NOT be a separator-variant or plural-variant of the target.
 *   - The single edit must be a high-signal typosquat operation (see classifyTyposquatOp).
 *   - Matching is against the curated *prominent* set only, never the full snapshot.
 *   - Scoped npm names compare on their post-slash bare segment.
 */
function findTyposquatTarget(
  candidate: string,
  prominent: string[],
): { target: string; op: TyposquatOp } | null {
  const c = bareName(candidate);
  if (c.length < 4) return null;
  const cCollapsed = collapseSeparators(c);
  const cDepluralised = depluralise(c);

  for (const target of prominent) {
    const t = bareName(target);
    if (t === c) continue;
    if (Math.abs(t.length - c.length) > 1) continue;
    // Legitimate family variants are never typosquats.
    if (cCollapsed === collapseSeparators(t)) continue;
    if (cDepluralised === depluralise(t)) continue;
    const op = classifyTyposquatOp(c, t);
    if (op) return { target, op };
  }
  return null;
}

// ─── Import extraction ─────────────────────────────────────────────────────────

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
  op: TyposquatOp,
  line: number,
  registry: 'npm' | 'PyPI',
): Smell {
  const opLabel: Record<TyposquatOp, string> = {
    keyslip: 'keyboard-adjacent substitution',
    homoglyph: 'visually-confusable character substitution',
    transpose: 'adjacent character transposition',
    indel: 'single inserted/dropped character',
  };
  return {
    type: 'SlopsquattingRisk',
    severity: 'high',
    line,
    description:
      `Import "${candidate}" is a single ${opLabel[op]} away from the prominent ${registry} ` +
      `package "${target}". Slopsquatting attackers register names that look like — or that ` +
      `LLMs hallucinate in place of — prominent packages (arXiv:2406.10279).`,
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

// ─── Registry context ──────────────────────────────────────────────────────────

interface RegistryContext {
  registryKey: 'npm' | 'pypi';
  registryLabel: 'npm' | 'PyPI';
  normalise: (name: string) => string;
  popularNormalised: Set<string>;
  prominentNormalised: string[];
  corpus: ReadonlySet<string>;
  knownDistinct: ReadonlySet<string>;
  extract: (code: string) => ExtractedImport[];
}

/** Resolves registry-specific helpers for a supported language, or null if unsupported. */
function registryContext(language: Language): RegistryContext | null {
  const isPython = language === 'python';
  const isTsJs = language === 'typescript' || language === 'javascript';
  if (!isPython && !isTsJs) return null;

  if (isPython) {
    return {
      registryKey: 'pypi',
      registryLabel: 'PyPI',
      normalise: normalisePypi,
      popularNormalised: getPypiPopularNormalised(),
      prominentNormalised: getPypiProminentNormalised(),
      corpus: getPypiCorpus(),
      knownDistinct: PYPI_KNOWN_DISTINCT,
      extract: extractPythonImports,
    };
  }
  return {
    registryKey: 'npm',
    registryLabel: 'npm',
    normalise: normaliseNpm,
    popularNormalised: getNpmPopularNormalised(),
    prominentNormalised: getNpmProminentNormalised(),
    corpus: getNpmCorpus(),
    knownDistinct: NPM_KNOWN_DISTINCT,
    extract: extractTsJsImports,
  };
}

/**
 * Decide the offline verdict for a single normalised import name. Returns a typosquat
 * match, a corpus hit, or null. Centralised so the offline and live paths agree exactly
 * on what is "already resolved offline".
 */
function classifyOffline(
  norm: string,
  ctx: RegistryContext,
  lockfile: Set<string>,
): { kind: 'corpus' } | { kind: 'typosquat'; target: string; op: TyposquatOp } | null {
  // Deliberate dependency — never flagged.
  if (lockfile.has(norm)) return null;
  // Exact match against a real popular package — definitely legitimate, never flagged.
  if (ctx.popularNormalised.has(norm)) return null;
  // Known-distinct real package that merely resembles a prominent name — never flagged.
  if (ctx.knownDistinct.has(norm)) return null;

  // (b) Hallucination-corpus hit (highest precision — exact, documented name).
  if (ctx.corpus.has(norm)) return { kind: 'corpus' };

  // (a) Typosquat distance to a prominent package.
  const t = findTyposquatTarget(norm, ctx.prominentNormalised);
  if (t) return { kind: 'typosquat', target: t.target, op: t.op };

  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Synchronous, ZERO-network slopsquatting detection (typosquat + hallucination-corpus
 * signals only). This is the entry point wired into the per-file `analyzeCode` pipeline,
 * since that pipeline is synchronous and must never perform network I/O.
 *
 * The opt-in live-registry path lives in the async {@link detectSlopsquatting}.
 *
 * @param code     Source code string.
 * @param language Detected language — only typescript/javascript/python are analysed.
 * @param _filePath File path (informational).
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

  const smells: Smell[] = [];
  for (const imp of ctx.extract(code)) {
    const norm = ctx.normalise(imp.name);
    const verdict = classifyOffline(norm, ctx, lockfile);
    if (verdict === null) continue;
    if (verdict.kind === 'corpus') {
      smells.push(buildCorpusSmell(imp.name, imp.line, ctx.registryLabel));
    } else {
      smells.push(
        buildTyposquatSmell(imp.name, verdict.target, verdict.op, imp.line, ctx.registryLabel),
      );
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
  const flaggedLines = new Set(smells.map((s) => s.line));

  for (const imp of ctx.extract(code)) {
    const norm = ctx.normalise(imp.name);
    // Skip anything already resolved offline (lockfile / popular / known-distinct /
    // corpus / typosquat) and any line already flagged.
    if (lockfile.has(norm)) continue;
    if (ctx.popularNormalised.has(norm)) continue;
    if (ctx.knownDistinct.has(norm)) continue;
    if (classifyOffline(norm, ctx, lockfile) !== null) continue;
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
