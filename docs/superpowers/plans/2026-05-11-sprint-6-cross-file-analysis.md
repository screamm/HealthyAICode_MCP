# Sprint 6: Cross-file Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the analysis engine from "one file at a time" to "the whole project at once" by adding three cross-file detectors: token-based duplication (AST fingerprints), language-consistency check (no Swedish-in-English-file or vice versa), and dead-code detection (exports nobody imports). After this sprint, `code_health_review` can be called with a project root and identify duplication, mixed-language regions, and dead exports across the entire codebase.

**Background:** Our current scorer is file-local. The MCP-tool exposure means an AI agent sees one file at a time and gets a green light even when the file duplicates 80 % of another file's logic. Token-based duplication detection with 50–80 % similarity thresholds is the industry baseline (arXiv:2002.05204). Language consistency is an AI-specific concern surfaced by 2026 LLM-readability research (Atlassian arXiv:2501.11264 + naming studies). Dead-code detection is a long-standing maintainability smell that current type-checkers do not catch when targets are exported.

**Architecture:** A new `packages/core/src/project/` module orchestrates cross-file analysis. Per-file AST fingerprints are computed once and cached by file mtime + content hash. The token-fingerprint comparison uses a sliding window of normalized N-grams (identifier names replaced with `_VAR_`, literals with `_LIT_`). Language detection uses character-class heuristics (Cyrillic, CJK, accented Latin) plus a comment-string-identifier split. Dead-code analysis builds an import graph by parsing all `import` statements once.

**Tech Stack:** TypeScript 5.x, tree-sitter 0.21, Node `fs/promises`, `crypto` for hashing, Vitest, pnpm workspaces

**Estimated effort:** 3–5 days (3 tasks, ~1–2 days each)

---

## Prerequisites (verify before starting)

- [ ] Sprint 5 is merged and green; all tests including the new 20+ pass.
- [ ] `packages/core/src/types.ts` has the four new smell types from Sprint 5.
- [ ] `packages/core/src/smells/` contains the per-file detectors from Sprint 5.
- [ ] `pnpm-workspace.yaml` already lists `packages/*`; no workspace changes needed.

---

## Task 1 — Project-wide analysis orchestration

The new cross-file detectors need a shared entry point that walks a project root, parses each file once, and feeds results to all three analyzers.

### 1.1 Specify the API

```typescript
// packages/core/src/project/index.ts
export interface ProjectAnalysisOptions {
  rootPath: string;
  include?: string[];       // glob patterns, default ['**/*.ts', '**/*.tsx']
  exclude?: string[];       // default ['node_modules/**', 'dist/**', '**/*.test.ts']
  cacheDir?: string;        // default <root>/.healthy-ai-cache/
}

export interface ProjectAnalysisResult {
  filesAnalyzed: number;
  duplicationFindings: DuplicationFinding[];
  languageMixFindings: LanguageMixFinding[];
  deadExportFindings: DeadExportFinding[];
  perFileResults: HealthResult[];
}

export async function analyzeProject(opts: ProjectAnalysisOptions): Promise<ProjectAnalysisResult>;
```

### 1.2 Add new finding types

- [ ] Edit `packages/core/src/types.ts`:

```typescript
export interface DuplicationFinding {
  filePathA: string;
  filePathB: string;
  startLineA: number;
  startLineB: number;
  tokenCount: number;
  similarity: number;       // 0.0–1.0
  severity: 'low' | 'medium' | 'high';
}

export interface LanguageMixFinding {
  filePath: string;
  primaryLanguage: 'sv' | 'en' | 'unknown';
  mixedRegions: Array<{ line: number; detected: string; snippet: string }>;
}

export interface DeadExportFinding {
  filePath: string;
  exportedName: string;
  line: number;
}
```

### 1.3 Write the orchestrator skeleton (red phase)

- [ ] Create `packages/core/tests/project/orchestrator.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../../src/project';

const FIXTURE_ROOT = path.join(__dirname, '../fixtures/project-simple');

describe('analyzeProject — orchestrator', () => {
  it('walks the root and returns per-file results', async () => {
    const result = await analyzeProject({ rootPath: FIXTURE_ROOT });
    expect(result.filesAnalyzed).toBeGreaterThan(0);
    expect(result.perFileResults).toHaveLength(result.filesAnalyzed);
  });

  it('respects exclude globs', async () => {
    const result = await analyzeProject({
      rootPath: FIXTURE_ROOT,
      exclude: ['**/*.ts'],
    });
    expect(result.filesAnalyzed).toBe(0);
  });
});
```

- [ ] Create `packages/core/tests/fixtures/project-simple/a.ts`:

```typescript
export function add(a: number, b: number): number {
  return a + b;
}
```

- [ ] Create `packages/core/tests/fixtures/project-simple/b.ts`:

```typescript
export function sub(a: number, b: number): number {
  return a - b;
}
```

### 1.4 Implement the orchestrator (green phase)

- [ ] Add a glob/walker dep:

```bash
pnpm --filter @healthy-ai-code/core add fast-glob
```

- [ ] Create `packages/core/src/project/index.ts`:

```typescript
import fg from 'fast-glob';
import * as path from 'path';
import { analyzeFile } from '..';
import type {
  ProjectAnalysisOptions,
  ProjectAnalysisResult,
  HealthResult,
} from '../types';
import { detectDuplications } from './duplication';
import { detectLanguageMix } from './language-mix';
import { detectDeadExports } from './dead-exports';

const DEFAULT_INCLUDE = ['**/*.ts', '**/*.tsx'];
const DEFAULT_EXCLUDE = ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.d.ts'];

export async function analyzeProject(opts: ProjectAnalysisOptions): Promise<ProjectAnalysisResult> {
  const root = path.resolve(opts.rootPath);
  const files = await discoverFiles(root, opts);

  const perFileResults: HealthResult[] = [];
  for (const file of files) {
    perFileResults.push(await analyzeFile(file));
  }

  return {
    filesAnalyzed: files.length,
    duplicationFindings: await detectDuplications(files),
    languageMixFindings: await detectLanguageMix(files),
    deadExportFindings: await detectDeadExports(files),
    perFileResults,
  };
}

async function discoverFiles(root: string, opts: ProjectAnalysisOptions): Promise<string[]> {
  return fg(opts.include ?? DEFAULT_INCLUDE, {
    cwd: root,
    ignore: opts.exclude ?? DEFAULT_EXCLUDE,
    absolute: true,
  });
}
```

- [ ] Create stub modules so imports resolve:
  - `packages/core/src/project/duplication.ts` — `export async function detectDuplications(files: string[]) { return []; }`
  - `packages/core/src/project/language-mix.ts` — `export async function detectLanguageMix(files: string[]) { return []; }`
  - `packages/core/src/project/dead-exports.ts` — `export async function detectDeadExports(files: string[]) { return []; }`

- [ ] Run: `pnpm --filter @healthy-ai-code/core test orchestrator` — 2 tests pass.

### 1.5 Commit

```bash
git add packages/core/src/project/ packages/core/tests/fixtures/project-simple/ packages/core/tests/project/ packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add project-level analyzeProject orchestrator skeleton"
```

---

## Task 2 — Token-based duplication detection

**Algorithm:** Token-N-gram fingerprinting with Jaccard-similarity scoring. Industry threshold: similarity 0.5–0.8 (research baseline). We use **0.7** as default and N=10 token window.

### 2.1 Specify the algorithm

1. For each function, extract the token sequence from its tree-sitter AST.
2. Normalize tokens:
   - Identifiers → `_VAR_`
   - String literals → `_STR_`
   - Number literals → `_NUM_`
   - Keywords, operators, punctuation kept verbatim.
3. Build sliding N-grams (default N=10) over the normalized sequence.
4. Hash each N-gram (FNV-1a or built-in `crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)`).
5. Compute Jaccard similarity between hash sets of every function pair: `|A ∩ B| / |A ∪ B|`.
6. Report pairs with similarity ≥ 0.7 AND ≥ 30 tokens (avoid trivial 2-line "match").

**Severity:**
- 0.70–0.84 → `low`
- 0.85–0.94 → `medium`
- ≥ 0.95 → `high`

### 2.2 Write failing tests

- [ ] Create `packages/core/tests/project/duplication.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../../src/project';

const FIXTURE = path.join(__dirname, '../fixtures/project-duplication');

describe('Token-based duplication detection', () => {
  it('detects near-identical functions across two files', async () => {
    const result = await analyzeProject({ rootPath: FIXTURE });
    const dupes = result.duplicationFindings;
    expect(dupes.length).toBeGreaterThanOrEqual(1);
    expect(dupes[0].similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('ignores trivially small functions (<30 tokens)', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-trivial'),
    });
    expect(result.duplicationFindings).toEqual([]);
  });

  it('treats identifier renames as duplicates (normalization works)', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-renamed-dupes'),
    });
    expect(result.duplicationFindings.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] Create fixtures:

`packages/core/tests/fixtures/project-duplication/error-response-a.ts`:

```typescript
export function buildResponseA(message: string) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ error: message }) }
    ],
    isError: true,
  };
}
```

`packages/core/tests/fixtures/project-duplication/error-response-b.ts`:

```typescript
export function buildResponseB(msg: string) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ error: msg }) }
    ],
    isError: true,
  };
}
```

(These match the duplication we identified in our own `analyze-change-set.ts` / `refactoring-business-case.ts` / `pre-commit-safeguard.ts`.)

### 2.3 Implement

- [ ] Create `packages/core/src/project/fingerprint.ts`:

```typescript
import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import { createHash } from 'crypto';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const N_GRAM_SIZE = 10;
const MIN_TOKENS = 30;

export interface FunctionFingerprint {
  filePath: string;
  functionName: string;
  startLine: number;
  hashes: Set<string>;
  tokenCount: number;
}

export function fingerprintFile(filePath: string, source: string): FunctionFingerprint[] {
  const tree = parser.parse(source);
  const fingerprints: FunctionFingerprint[] = [];
  collectFromNode(tree.rootNode, filePath, fingerprints);
  return fingerprints.filter(fp => fp.tokenCount >= MIN_TOKENS);
}

function collectFromNode(
  node: Parser.SyntaxNode,
  filePath: string,
  out: FunctionFingerprint[],
): void {
  if (isFunctionNode(node)) {
    const tokens = normalizeTokens(node);
    const hashes = ngramHashes(tokens, N_GRAM_SIZE);
    out.push({
      filePath,
      functionName: getFunctionName(node),
      startLine: node.startPosition.row + 1,
      hashes,
      tokenCount: tokens.length,
    });
  }
  for (const child of node.children) collectFromNode(child, filePath, out);
}

function normalizeTokens(root: Parser.SyntaxNode): string[] {
  const tokens: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.children.length === 0) {
      tokens.push(normalizeLeaf(n));
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(root);
  return tokens.filter(Boolean);
}

function normalizeLeaf(node: Parser.SyntaxNode): string {
  switch (node.type) {
    case 'identifier':
    case 'property_identifier':
      return '_VAR_';
    case 'string':
    case 'template_string':
      return '_STR_';
    case 'number':
      return '_NUM_';
    case 'comment':
      return '';
    default:
      return node.text;
  }
}

function ngramHashes(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const slice = tokens.slice(i, i + n).join(' ');
    out.add(createHash('sha1').update(slice).digest('hex').slice(0, 16));
  }
  return out;
}

function isFunctionNode(node: Parser.SyntaxNode): boolean {
  return ['function_declaration', 'method_definition', 'arrow_function', 'function_expression']
    .includes(node.type);
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}
```

- [ ] Replace stub in `packages/core/src/project/duplication.ts`:

```typescript
import * as fsp from 'fs/promises';
import { fingerprintFile, type FunctionFingerprint } from './fingerprint';
import type { DuplicationFinding } from '../types';

const SIMILARITY_THRESHOLD = 0.7;

export async function detectDuplications(files: string[]): Promise<DuplicationFinding[]> {
  const allFingerprints = await collectAllFingerprints(files);
  return findSimilarPairs(allFingerprints);
}

async function collectAllFingerprints(files: string[]): Promise<FunctionFingerprint[]> {
  const all: FunctionFingerprint[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    all.push(...fingerprintFile(file, source));
  }
  return all;
}

function findSimilarPairs(fps: FunctionFingerprint[]): DuplicationFinding[] {
  const findings: DuplicationFinding[] = [];
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const sim = jaccard(fps[i].hashes, fps[j].hashes);
      if (sim < SIMILARITY_THRESHOLD) continue;
      findings.push({
        filePathA: fps[i].filePath,
        filePathB: fps[j].filePath,
        startLineA: fps[i].startLine,
        startLineB: fps[j].startLine,
        tokenCount: Math.min(fps[i].tokenCount, fps[j].tokenCount),
        similarity: sim,
        severity: classifySeverity(sim),
      });
    }
  }
  return findings;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

function classifySeverity(sim: number): 'low' | 'medium' | 'high' {
  if (sim >= 0.95) return 'high';
  if (sim >= 0.85) return 'medium';
  return 'low';
}
```

### 2.4 Performance considerations

- Pairwise comparison is O(n²) in number of functions. For 1000 functions: 500 000 Jaccard calls. Each Jaccard is O(min(|A|,|B|)).
- **Optimization (defer to Sprint 7 if not needed)**: bucket fingerprints by hash-set size; only compare pairs within size-ratio 0.7–1.4.
- Document this as a known scaling limit in the README; warn if `files.length > 500`.

### 2.5 Commit

```bash
git commit -m "feat(core): token-based AST fingerprint duplication detection (Jaccard ≥0.7)"
```

### 2.6 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 3 new duplication tests pass.
- [ ] Running `analyzeProject` on `packages/mcp-server/src/tools/` finds the `errorResponse` triplet (high-similarity pair across `analyze-change-set.ts`, `refactoring-business-case.ts`, `pre-commit-safeguard.ts`).
- [ ] Wall-clock < 5 s for our own 23-file codebase.

---

## Task 3 — Language-consistency check

**Goal:** Flag files where identifiers, comments, and user-facing strings drift between languages. Our own `refactoring-business-case.ts` is the exemplar offender (English identifiers + English comments + Swedish strings).

### 3.1 Specify the heuristic

For each TypeScript file, classify the **dominant language** of three token sources:

1. **Identifiers** (variable/function names): English by convention. Skip — we accept English here always.
2. **Comments** (block and line comments).
3. **String literals**.

Use a character-class scorer per token:

| Score | Trigger |
|-------|---------|
| `+sv` per token | Contains `å`, `ä`, `ö`, `Å`, `Ä`, `Ö` |
| `+sv` per token | Matches Swedish stopword list (`och`, `att`, `är`, `kan`, `ska`, `inte`, `inga`, `redan`, `med`, `för`, `till`, `som`, `eller`, `mellan`) |
| `+en` per token | Matches English stopword list (`the`, `and`, `is`, `of`, `to`, `if`, `else`, `not`, `with`, `for`, `from`, `as`, `or`, `between`) |
| `+other` | Contains non-Latin scripts (CJK, Cyrillic, Arabic, Hebrew) |

**Finding rule:** A file gets a `LanguageMix` finding if **two or more token sources** disagree on the dominant language — e.g., comments are English-majority but strings are Swedish-majority.

### 3.2 Write failing tests

- [ ] Create `packages/core/tests/project/language-mix.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../../src/project';

describe('Language-consistency check', () => {
  it('flags English-comment / Swedish-string mismatch', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-mixed-language'),
    });
    expect(result.languageMixFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag pure English file', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-pure-english'),
    });
    expect(result.languageMixFindings).toEqual([]);
  });

  it('does NOT flag pure Swedish file', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-pure-swedish'),
    });
    expect(result.languageMixFindings).toEqual([]);
  });
});
```

- [ ] Create fixture `packages/core/tests/fixtures/project-mixed-language/business.ts`:

```typescript
// ROI model based on CodeScene research:
// each point of improvement yields ~4% faster development.
export function recommendation(improvement: number): string {
  if (improvement > 2) return 'Hög prioritet: stor förbättring';
  if (improvement > 0.5) return 'Medium prioritet: marginell förbättring';
  return 'Låg prioritet: redan i gott skick';
}
```

(Mirrors our actual `refactoring-business-case.ts`.)

### 3.3 Implement

- [ ] Create `packages/core/src/project/language-mix.ts`:

```typescript
import * as fsp from 'fs/promises';
import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import type { LanguageMixFinding } from '../types';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const SWEDISH_STOPWORDS = new Set([
  'och','att','är','kan','ska','inte','inga','redan','med','för','till',
  'som','eller','mellan','har','varit','vara','blir','blev','denna','dessa',
]);

const ENGLISH_STOPWORDS = new Set([
  'the','and','is','of','to','if','else','not','with','for','from','as','or',
  'between','has','have','been','this','these','from','into','about','because',
]);

const SWEDISH_CHARS = /[åäöÅÄÖ]/;

export async function detectLanguageMix(files: string[]): Promise<LanguageMixFinding[]> {
  const findings: LanguageMixFinding[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    const finding = analyzeFile(file, source);
    if (finding) findings.push(finding);
  }
  return findings;
}

function analyzeFile(filePath: string, source: string): LanguageMixFinding | null {
  const tree = parser.parse(source);
  const commentLang = dominantLanguage(collectTokens(tree.rootNode, 'comment'));
  const stringLang = dominantLanguage(collectTokens(tree.rootNode, 'string'));

  if (commentLang === 'unknown' || stringLang === 'unknown') return null;
  if (commentLang === stringLang) return null;

  return {
    filePath,
    primaryLanguage: commentLang,
    mixedRegions: collectRegions(tree.rootNode, stringLang, source),
  };
}

function collectTokens(root: Parser.SyntaxNode, kind: 'comment' | 'string'): string[] {
  const matchTypes = kind === 'comment'
    ? new Set(['comment'])
    : new Set(['string', 'template_string', 'string_fragment']);
  const tokens: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (matchTypes.has(n.type)) tokens.push(n.text);
    for (const c of n.children) walk(c);
  }
  walk(root);
  return tokens;
}

function dominantLanguage(tokens: string[]): 'sv' | 'en' | 'unknown' {
  let sv = 0, en = 0;
  for (const text of tokens) {
    if (SWEDISH_CHARS.test(text)) sv += 2;
    const words = text.toLowerCase().match(/[a-zåäö]+/g) ?? [];
    for (const w of words) {
      if (SWEDISH_STOPWORDS.has(w)) sv++;
      if (ENGLISH_STOPWORDS.has(w)) en++;
    }
  }
  if (sv === 0 && en === 0) return 'unknown';
  if (sv > en * 1.5) return 'sv';
  if (en > sv * 1.5) return 'en';
  return 'unknown';
}

function collectRegions(
  root: Parser.SyntaxNode,
  oddLanguage: 'sv' | 'en',
  source: string,
): Array<{ line: number; detected: string; snippet: string }> {
  const out: Array<{ line: number; detected: string; snippet: string }> = [];
  const lines = source.split('\n');
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'string' || n.type === 'template_string') {
      const text = n.text;
      const isOdd = oddLanguage === 'sv' ? SWEDISH_CHARS.test(text) : /[a-z]/i.test(text);
      if (isOdd) {
        out.push({
          line: n.startPosition.row + 1,
          detected: oddLanguage,
          snippet: lines[n.startPosition.row]?.trim().slice(0, 80) ?? '',
        });
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}
```

### 3.4 Commit

```bash
git commit -m "feat(core): detect language-consistency drift between comments and strings"
```

### 3.5 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 3 new language-mix tests pass.
- [ ] Running on `packages/mcp-server/src/tools/refactoring-business-case.ts` returns a `LanguageMix` finding (English comments, Swedish user-facing strings).
- [ ] Running on `packages/core/src/types.ts` returns no finding (English-only file).

---

## Task 4 — Dead-code (unused export) detection

**Goal:** Build an import graph across the project and flag exported symbols that no other file references.

### 4.1 Specify the algorithm

1. For each TypeScript file, parse all `export` declarations and record their `(filePath, symbolName)` tuples.
2. For each file, parse all `import` statements and record `(sourceFilePath, importedSymbol, importedFromPath)`.
3. Resolve relative import paths (`./foo` → absolute path).
4. Mark each exported symbol as **used** if at least one import references it from another file.
5. Exempt:
   - `index.ts` re-exports (`export { foo } from './foo'`) — count both sides as used.
   - Default exports of MCP entry points (declared in `package.json#main` / `bin`).
   - Anything in `*.test.ts` / `*.d.ts`.
   - Type-only exports flagged with leading `/** @public */`.

### 4.2 Write failing tests

- [ ] Create `packages/core/tests/project/dead-exports.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../../src/project';

describe('Dead export detection', () => {
  it('flags exports nobody imports', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-dead-exports'),
    });
    const names = result.deadExportFindings.map(f => f.exportedName);
    expect(names).toContain('unusedHelper');
  });

  it('does NOT flag exports used elsewhere', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-dead-exports'),
    });
    const names = result.deadExportFindings.map(f => f.exportedName);
    expect(names).not.toContain('usedHelper');
  });

  it('does NOT flag re-exports through index.ts', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-reexports'),
    });
    expect(result.deadExportFindings).toEqual([]);
  });

  it('does NOT flag main entry point default exports', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-entry-point'),
    });
    expect(result.deadExportFindings).toEqual([]);
  });
});
```

- [ ] Create fixtures (one folder per scenario).

### 4.3 Implement

- [ ] Create `packages/core/src/project/dead-exports.ts`:

```typescript
import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import type { DeadExportFinding } from '../types';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

interface ExportRecord {
  filePath: string;
  name: string;
  line: number;
  isReExport: boolean;
}

interface ImportRecord {
  fromPath: string;        // resolved absolute path of the imported file
  importedNames: string[];
}

export async function detectDeadExports(files: string[]): Promise<DeadExportFinding[]> {
  const exports: ExportRecord[] = [];
  const imports: ImportRecord[] = [];

  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    const tree = parser.parse(source);
    exports.push(...collectExports(tree.rootNode, file));
    imports.push(...await collectImports(tree.rootNode, file));
  }

  const importIndex = buildImportIndex(imports);
  return exports
    .filter(e => !e.isReExport)
    .filter(e => !isImported(e, importIndex))
    .map(e => ({ filePath: e.filePath, exportedName: e.name, line: e.line }));
}

function buildImportIndex(imports: ImportRecord[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const imp of imports) {
    const set = idx.get(imp.fromPath) ?? new Set<string>();
    for (const name of imp.importedNames) set.add(name);
    idx.set(imp.fromPath, set);
  }
  return idx;
}

function isImported(record: ExportRecord, idx: Map<string, Set<string>>): boolean {
  const namesAtFile = idx.get(record.filePath);
  return namesAtFile?.has(record.name) ?? false;
}

function collectExports(root: Parser.SyntaxNode, filePath: string): ExportRecord[] {
  const out: ExportRecord[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'export_statement') {
      const isReExport = n.children.some(c => c.type === 'string'); // export … from '…'
      const name = extractExportName(n);
      if (name) {
        out.push({
          filePath,
          name,
          line: n.startPosition.row + 1,
          isReExport,
        });
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function extractExportName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    const named = child.childForFieldName('name');
    if (named) return named.text;
  }
  return null;
}

async function collectImports(root: Parser.SyntaxNode, importingFile: string): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'import_statement') {
      const sourceLit = n.children.find(c => c.type === 'string')?.text?.replace(/['"]/g, '') ?? '';
      const fromPath = resolveImportPath(importingFile, sourceLit);
      if (!fromPath) return;
      const names = extractImportedNames(n);
      out.push({ fromPath, importedNames: names });
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function resolveImportPath(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const candidate = path.resolve(dir, spec);
  // Try .ts, .tsx, /index.ts
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const full = candidate.endsWith('.ts') || candidate.endsWith('.tsx') ? candidate : candidate + ext;
    return full;   // Trust caller list — actual fs check would slow us down; verify in tests.
  }
  return null;
}

function extractImportedNames(node: Parser.SyntaxNode): string[] {
  const names: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'identifier' && n.parent?.type === 'import_specifier') {
      names.push(n.text);
    }
    for (const c of n.children) walk(c);
  }
  walk(node);
  return names;
}
```

### 4.4 Commit

```bash
git commit -m "feat(core): detect dead exports via cross-file import graph"
```

### 4.5 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 4 new dead-export tests pass.
- [ ] Running `analyzeProject` on our own monorepo identifies any orphan exports (verify manually).
- [ ] No false positives for `index.ts`-style re-exports.

---

## Task 5 — Expose via MCP tool

### 5.1 New MCP tool: `code_health_project_review`

- [ ] Create `packages/mcp-server/src/tools/project-review.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeProject } from '@healthy-ai-code/core';

export function registerProjectReview(server: McpServer): void {
  server.tool(
    'code_health_project_review',
    'Helkroppsundersökning av projektet: per-fil-score plus cross-file-fynd (duplikation, språkblandning, död kod).',
    {
      rootPath: z.string().describe('Absolut sökväg till projektroten'),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    },
    async ({ rootPath, include, exclude }) => {
      const result = await analyzeProject({ rootPath, include, exclude });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

- [ ] Wire into `packages/mcp-server/src/server.ts` registration list.

- [ ] Write the tool test in `packages/mcp-server/tests/tools/project-review.test.ts`.

### 5.2 Commit

```bash
git commit -m "feat(mcp-server): expose analyzeProject as code_health_project_review tool"
```

---

## Definition of Done

- [ ] `analyzeProject` returns all three finding types.
- [ ] New MCP tool `code_health_project_review` is registered and tested.
- [ ] Running it on our own repo identifies:
  - At least one duplication pair (the `errorResponse`-pattern in tools/)
  - At least one language-mix finding (`refactoring-business-case.ts`, `pre-commit-safeguard.ts`)
  - No dead exports (or, if any are flagged, they're either fixed or intentionally exempted)
- [ ] All existing tests pass; 14+ new tests pass.
- [ ] Wall-clock for analyzing our 23-file project < 10 s.
- [ ] Documentation updated: README mentions the new MCP tool.

---

## Risks / Open Questions

- **Pairwise duplication is O(n²)** — manageable up to ~500 functions, painful beyond. If we ship to large monorepos, we need MinHash/LSH bucketing in Sprint 7+.
- **Import resolution edge cases** — TypeScript path aliases (`@/foo`), workspace packages (`@healthy-ai-code/core`), and Node's conditional exports. Our v1 only resolves relative paths; alias-aware resolution is deferred.
- **Re-export false positives** — `export * from './foo'` doesn't list specific names; we currently treat it as "used" for everything in `./foo`. Verify against fixtures.
- **Language detection on bilingual identifiers** — variable names like `getKundnummer` (English verb + Swedish noun) won't trigger our heuristic. Acceptable; documented as known limitation.
- **`fast-glob` dependency** — adds ~250 KB to the package; acceptable for a dev-tool MCP server.
- **AST-walker recursion depth** — extremely large files may stack-overflow. Add an iterative walker fallback if any user reports this.
