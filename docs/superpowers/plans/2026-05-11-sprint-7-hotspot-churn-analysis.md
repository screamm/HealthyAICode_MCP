# Sprint 7: Hotspot & Churn Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move our scorer from "snapshot-of-now" to "snapshot-with-historical-context" by adding three temporal/compound detectors: (1) hotspot analysis combining commit frequency with structural complexity, (2) Brain Method detection as a compound smell combining LOC + cyclomatic + cognitive + nesting + centrality, and (3) test-coverage proximity tying source files to their adjacent `*.test.ts` files. After this sprint, our analyzer answers the question CodeScene built their business on: *"Which files in your repo are both complex AND changed often AND under-tested — i.e., the ones most likely to break under AI-assisted refactoring?"*

**Background:** Adam Tornhill's peer-reviewed January-2026 paper (arXiv:2601.02200) shows that CodeHealth correlates with semantic preservation after AI refactoring. CodeScene's signature insight has always been *hotspots* — multiplying code complexity by change frequency to identify the 5 % of files that account for 80 % of risk. We currently identify zero hotspots because we have no git integration in the per-file scorer (`diff/git.ts` is for changeset diffs against a base branch, not historical churn). Brain Method is a compound smell — none of its individual components are problematic on their own, but the combination signals a function that has accumulated too many responsibilities. Test-coverage proximity is a cheap heuristic that requires no test runner instrumentation: if `foo.ts` exists and `foo.test.ts` exists in the conventional location, we have *some* coverage signal even without line-level data.

**Architecture:** Three new modules under `packages/core/src/temporal/` (hotspot, brain-method, test-proximity). Hotspot analysis runs `git log --follow --format='%H' -- <file>` per file to count commits within a configurable time window (default: last 12 months). The Brain Method detector is a *combinator* that runs after the per-function analyzers and computes a compound score. Test-proximity walks the file tree, builds a `source → test` adjacency map, and emits a smell when a source file has no test neighbour AND has at least one exported function.

**Tech Stack:** TypeScript 5.x, simple-git 3.22 (already in deps), tree-sitter, Vitest, Node `fs/promises`, pnpm workspaces

**Estimated effort:** 5–8 days (3 tasks, ~2 days each, plus integration & documentation)

---

## Prerequisites (verify before starting)

- [ ] Sprint 6 is merged and green; `analyzeProject` exists and works on our own repo.
- [ ] `packages/core/src/project/index.ts` exposes `ProjectAnalysisOptions` and `ProjectAnalysisResult`.
- [ ] `simple-git` is already a dependency (added in Sprint 2).
- [ ] Git is installed on the host running the analyzer (assumed for an MCP code-health tool, but document the requirement).
- [ ] The repo we analyze must be a git repository (`git rev-parse --is-inside-work-tree`).

---

## Task 1 — Hotspot detection (commits × complexity)

### 1.1 Specify the algorithm

For each source file `f` in the project:

1. Run `git log --follow --since="<window>" --format=%H -- <f>` to get commit count `C(f)`.
2. Read the existing `analyzeFile(f).metrics.maxFunctionLength + .cyclomaticComplexity + .cognitiveComplexity` to derive a complexity score `K(f)`.
3. Compute hotspot score: `H(f) = C(f) × K(f)`.
4. Sort all files by `H(f)` descending; take the top N (default 10) and any file in the top **10 %** of the distribution.

**Hotspot smell** is attached to the file with:
- Severity `high` if `H(f)` is in top 1 %.
- Severity `medium` if in top 5 %.
- Severity `low` if in top 10 %.

Time window default: `'12 months'`. Configurable via `ProjectAnalysisOptions.hotspotWindow`.

### 1.2 Update finding type & options

- [ ] Edit `packages/core/src/types.ts`:

```typescript
export interface HotspotFinding {
  filePath: string;
  commitCount: number;
  complexityScore: number;
  hotspotScore: number;
  severity: 'low' | 'medium' | 'high';
  rankPercentile: number;  // 0–100
}

export interface ProjectAnalysisOptions {
  rootPath: string;
  include?: string[];
  exclude?: string[];
  cacheDir?: string;
  hotspotWindow?: string;      // NEW — git --since= argument, default '12 months'
  hotspotTopN?: number;        // NEW — default 10
}

export interface ProjectAnalysisResult {
  …  // existing fields
  hotspotFindings: HotspotFinding[];   // NEW
}
```

### 1.3 Write failing tests

- [ ] Create `packages/core/tests/temporal/hotspot.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';
import { analyzeProject } from '../../src/project';

const FIXTURE_ROOT = path.join(__dirname, '../fixtures/project-hotspot-tmp');

beforeAll(async () => {
  await fsp.rm(FIXTURE_ROOT, { recursive: true, force: true });
  await fsp.mkdir(FIXTURE_ROOT, { recursive: true });

  const git = simpleGit(FIXTURE_ROOT);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'test');

  // Hot file: complex AND changed many times.
  for (let i = 0; i < 20; i++) {
    await fsp.writeFile(path.join(FIXTURE_ROOT, 'hot.ts'),
      `export function f(x: number): number {\n` +
      Array.from({ length: i + 5 }, (_, j) => `  if (x === ${j}) return ${j};`).join('\n') +
      `\n  return -1;\n}`,
      'utf-8',
    );
    await git.add('hot.ts');
    await git.commit(`change ${i}`);
  }

  // Cold file: simple, never changes after initial commit.
  await fsp.writeFile(path.join(FIXTURE_ROOT, 'cold.ts'),
    `export function g(x: number): number { return x + 1; }`, 'utf-8');
  await git.add('cold.ts');
  await git.commit('cold initial');
});

describe('Hotspot detection', () => {
  it('marks the hot file as a hotspot', async () => {
    const result = await analyzeProject({ rootPath: FIXTURE_ROOT });
    const hot = result.hotspotFindings.find(h => h.filePath.endsWith('hot.ts'));
    expect(hot).toBeDefined();
    expect(hot!.commitCount).toBeGreaterThanOrEqual(15);
    expect(hot!.severity).toMatch(/medium|high/);
  });

  it('does not mark the cold file as a hotspot', async () => {
    const result = await analyzeProject({ rootPath: FIXTURE_ROOT });
    expect(result.hotspotFindings.find(h => h.filePath.endsWith('cold.ts'))).toBeUndefined();
  });

  it('respects hotspotWindow option', async () => {
    const result = await analyzeProject({ rootPath: FIXTURE_ROOT, hotspotWindow: '1 second' });
    // With a 1-second window after the test setup, no commits should fall inside.
    expect(result.hotspotFindings).toEqual([]);
  });
});
```

### 1.4 Implement

- [ ] Create `packages/core/src/temporal/hotspot.ts`:

```typescript
import simpleGit, { type SimpleGit } from 'simple-git';
import * as path from 'path';
import type { HealthResult, HotspotFinding, MetricBreakdown } from '../types';

const DEFAULT_WINDOW = '12 months';
const TOP_N_DEFAULT = 10;

export async function detectHotspots(
  rootPath: string,
  perFileResults: HealthResult[],
  window: string = DEFAULT_WINDOW,
  topN: number = TOP_N_DEFAULT,
): Promise<HotspotFinding[]> {
  const git = simpleGit(rootPath);
  if (!(await git.checkIsRepo())) return [];

  const scored: Array<{ filePath: string; commitCount: number; complexity: number; hotspotScore: number }> = [];

  for (const file of perFileResults) {
    const relPath = path.relative(rootPath, file.filePath);
    const commitCount = await countCommits(git, relPath, window);
    if (commitCount === 0) continue;
    const complexity = complexityScore(file.metrics);
    scored.push({
      filePath: file.filePath,
      commitCount,
      complexity,
      hotspotScore: commitCount * complexity,
    });
  }

  scored.sort((a, b) => b.hotspotScore - a.hotspotScore);

  return scored.slice(0, Math.max(topN, Math.ceil(scored.length * 0.1))).map((s, idx) => ({
    filePath: s.filePath,
    commitCount: s.commitCount,
    complexityScore: s.complexity,
    hotspotScore: s.hotspotScore,
    severity: classifyHotspotSeverity(idx, scored.length),
    rankPercentile: Math.round((idx / Math.max(scored.length, 1)) * 100),
  }));
}

async function countCommits(git: SimpleGit, relPath: string, window: string): Promise<number> {
  try {
    const log = await git.log({
      file: relPath,
      '--follow': null,
      '--since': window,
      '--format': '%H',
    } as any);
    return log.total;
  } catch {
    return 0;
  }
}

function complexityScore(m: MetricBreakdown): number {
  return m.cyclomaticComplexity + m.cognitiveComplexity + Math.log10(Math.max(m.totalLines, 1));
}

function classifyHotspotSeverity(idx: number, total: number): 'low' | 'medium' | 'high' {
  const pct = idx / Math.max(total, 1);
  if (pct < 0.01) return 'high';
  if (pct < 0.05) return 'medium';
  return 'low';
}
```

- [ ] Edit `packages/core/src/project/index.ts` — wire hotspot detection into `analyzeProject`:

```typescript
import { detectHotspots } from '../temporal/hotspot';

…
  const hotspotFindings = await detectHotspots(
    root,
    perFileResults,
    opts.hotspotWindow,
    opts.hotspotTopN,
  );
  return {
    …,
    hotspotFindings,
  };
```

### 1.5 Commit

```bash
git add packages/core/src/temporal/hotspot.ts \
        packages/core/src/types.ts \
        packages/core/src/project/index.ts \
        packages/core/tests/temporal/hotspot.test.ts
git commit -m "feat(core): detect hotspots via commits × complexity (CodeScene-style)"
```

### 1.6 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 3 new hotspot tests pass.
- [ ] `analyzeProject` on our own repo identifies hot files (likely candidates: `analyzers/typescript.ts` was modified multiple times in Sprint 2 + Sprint 5).
- [ ] When the project is not a git repo, `hotspotFindings` is empty (no error).

---

## Task 2 — Brain Method (compound smell)

### 2.1 Specify the algorithm

Brain Method (CodeScene's signature compound smell) flags a function as too central / too god-like when **multiple** structural factors are simultaneously high. We use a weighted-sum normalization:

```
brain_score = 0.30 × clamp(lines / 100, 0, 1)
            + 0.25 × clamp(cyclomatic / 25, 0, 1)
            + 0.25 × clamp(cognitive / 30, 0, 1)
            + 0.10 × clamp(nesting / 6, 0, 1)
            + 0.10 × clamp(centrality / max_centrality_in_file, 0, 1)
```

Where `centrality(f)` = (number of times `f` is called from other functions in the same file) + (number of functions `f` calls from the same file).

**Smell triggers** when `brain_score ≥ 0.55` AND **at least three** of the five factors are above their individual half-thresholds.

Severity:
- `0.55–0.69` → `medium`
- `0.70–0.84` → `high`
- `≥ 0.85` → `critical`

### 2.2 Add finding type

- [ ] Edit `packages/core/src/types.ts` — add `'BrainMethod'` to `SmellType`.

### 2.3 Write failing tests

- [ ] Create `packages/core/tests/temporal/brain-method.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';

describe('BrainMethod detection', () => {
  it('flags a single function that is large, complex, and deeply nested', () => {
    const lines: string[] = ['export function godFunction(x: number): number {'];
    for (let i = 0; i < 60; i++) {
      lines.push(`  if (x === ${i}) {`);
      lines.push(`    for (let j = 0; j < ${i}; j++) {`);
      lines.push(`      if (j % 2 === 0) { x += 1; } else { x -= 1; }`);
      lines.push(`    }`);
      lines.push(`  }`);
    }
    lines.push('  return x;');
    lines.push('}');
    const code = lines.join('\n');
    const result = analyzeCode(code, 'typescript');
    expect(result.smells.some(s => s.type === 'BrainMethod')).toBe(true);
  });

  it('does NOT flag short helper functions even if cyclomatic complexity is high', () => {
    const code = `
      function helper(x: number): number {
        return x > 0 && x < 10 || x > 100 && x < 1000 ? 1 : 0;
      }
    `;
    const result = analyzeCode(code, 'typescript');
    expect(result.smells.some(s => s.type === 'BrainMethod')).toBe(false);
  });

  it('does NOT flag a clean function', () => {
    const code = `export function add(a: number, b: number): number { return a + b; }`;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'BrainMethod')).toBe(false);
  });
});
```

### 2.4 Implement

- [ ] Create `packages/core/src/smells/brain-method.ts`:

```typescript
import Parser from 'tree-sitter';
import type { FunctionResult, Smell } from '../types';

interface Weights {
  lines: number;
  cyclomatic: number;
  cognitive: number;
  nesting: number;
  centrality: number;
}

const WEIGHTS: Weights = {
  lines: 0.30,
  cyclomatic: 0.25,
  cognitive: 0.25,
  nesting: 0.10,
  centrality: 0.10,
};

const THRESHOLDS = {
  lines: 100,
  cyclomatic: 25,
  cognitive: 30,
  nesting: 6,
};

const SMELL_THRESHOLD = 0.55;
const MIN_HIGH_FACTORS = 3;

export function detectBrainMethods(
  functions: FunctionResult[],
  ast: Parser.SyntaxNode,
): Smell[] {
  const centralityMap = buildCentralityMap(ast, functions);
  const maxCentrality = Math.max(1, ...centralityMap.values());

  const smells: Smell[] = [];
  for (const fn of functions) {
    const factors = {
      lines: clamp01(fn.length / THRESHOLDS.lines),
      cyclomatic: clamp01(fn.cyclomaticComplexity / THRESHOLDS.cyclomatic),
      cognitive: clamp01(fn.cognitiveComplexity / THRESHOLDS.cognitive),
      nesting: clamp01(fn.nestingDepth / THRESHOLDS.nesting),
      centrality: clamp01((centralityMap.get(fn.name) ?? 0) / maxCentrality),
    };

    const score = WEIGHTS.lines * factors.lines
                + WEIGHTS.cyclomatic * factors.cyclomatic
                + WEIGHTS.cognitive * factors.cognitive
                + WEIGHTS.nesting * factors.nesting
                + WEIGHTS.centrality * factors.centrality;

    const highCount = Object.values(factors).filter(v => v > 0.5).length;

    if (score >= SMELL_THRESHOLD && highCount >= MIN_HIGH_FACTORS) {
      smells.push({
        type: 'BrainMethod',
        severity: classifySeverity(score),
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' är en Brain Method (brain_score=${score.toFixed(2)}) — central, lång och komplex`,
        suggestion: `Bryt upp '${fn.name}'; varje av de ${highCount} höga faktorerna pekar mot en separat ansvarspunkt`,
      });
    }
  }
  return smells;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function classifySeverity(score: number): 'medium' | 'high' | 'critical' {
  if (score >= 0.85) return 'critical';
  if (score >= 0.70) return 'high';
  return 'medium';
}

function buildCentralityMap(root: Parser.SyntaxNode, functions: FunctionResult[]): Map<string, number> {
  const names = new Set(functions.map(f => f.name));
  const calls = new Map<string, number>();

  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'call_expression') {
      const callee = n.childForFieldName('function')?.text;
      if (callee && names.has(callee)) {
        calls.set(callee, (calls.get(callee) ?? 0) + 1);
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return calls;
}
```

- [ ] Wire into `analyzeTypeScript`:

```typescript
import { detectBrainMethods } from '../smells/brain-method';

export function analyzeTypeScript(code: string, filePath = '<inline>') {
  const tree = parser.parse(code);
  const functions = collectFunctions(tree.rootNode);
  …
  const smells = [
    …existing detectors,
    ...detectBrainMethods(functions, tree.rootNode),
  ];
  return { functions, metrics, smells };
}
```

### 2.5 Add scoring weight

```typescript
BrainMethod: { medium: 1.2, high: 2.5, critical: 4.0 },
```

(Heavy weight: a brain method is the single most impactful smell to refactor.)

### 2.6 Commit

```bash
git commit -m "feat(core): detect Brain Method as weighted-sum compound smell"
```

### 2.7 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 3 new brain-method tests pass.
- [ ] Running on our own refactored files (all under 30 lines per function) returns no Brain Method smells.
- [ ] Running on a deliberate 60-branch fixture returns a `BrainMethod` smell with at least severity `medium`.

---

## Task 3 — Test-coverage proximity

### 3.1 Specify the heuristic

For each source file `f` in the project:

1. Look up the conventional test paths:
   - Sibling: `<dir>/<name>.test.ts`, `<dir>/<name>.spec.ts`
   - Adjacent dir: `<root>/tests/<relative>/<name>.test.ts`, `<root>/__tests__/<name>.test.ts`
2. If the source file has at least one exported function AND no test file exists in *any* of the conventional locations, emit a `TestCoverageProximity` finding.
3. Severity:
   - `low` if the file is small (<50 LOC) and has 1–2 exports
   - `medium` if 3–5 exports
   - `high` if ≥6 exports OR file is in `core/src/`

This is **coverage proximity**, not actual line/branch coverage — we explicitly do not run the test runner. The signal is *"this file lacks the conventional adjacent test file"*, which is a strong predictor of low coverage in the codebases this tool targets.

### 3.2 Add finding type

- [ ] Edit `packages/core/src/types.ts`:

```typescript
export interface TestProximityFinding {
  filePath: string;
  exportCount: number;
  searchedPaths: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface ProjectAnalysisResult {
  …
  testProximityFindings: TestProximityFinding[];
}
```

### 3.3 Write failing tests

- [ ] Create `packages/core/tests/temporal/test-proximity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { analyzeProject } from '../../src/project';

describe('Test-coverage proximity', () => {
  it('flags source files without an adjacent test file', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-no-tests'),
    });
    expect(result.testProximityFindings.length).toBeGreaterThan(0);
  });

  it('does NOT flag files that have an adjacent test', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-with-tests'),
    });
    const findings = result.testProximityFindings.map(f => path.basename(f.filePath));
    expect(findings).not.toContain('covered.ts');
  });

  it('finds tests in tests/ subtree', async () => {
    // Source: project/src/foo.ts; test: project/tests/foo.test.ts
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-tests-subtree'),
    });
    expect(result.testProximityFindings).toEqual([]);
  });

  it('does NOT flag files with zero exports', async () => {
    const result = await analyzeProject({
      rootPath: path.join(__dirname, '../fixtures/project-no-exports'),
    });
    expect(result.testProximityFindings).toEqual([]);
  });
});
```

### 3.4 Implement

- [ ] Create `packages/core/src/temporal/test-proximity.ts`:

```typescript
import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import type { TestProximityFinding } from '../types';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

export async function detectTestProximity(
  rootPath: string,
  files: string[],
): Promise<TestProximityFinding[]> {
  const sourceFiles = files.filter(f => !isTestFile(f));
  const testFileSet = new Set(files.filter(isTestFile).map(f => path.resolve(f)));

  const findings: TestProximityFinding[] = [];
  for (const file of sourceFiles) {
    const exportCount = await countExports(file);
    if (exportCount === 0) continue;

    const candidates = candidateTestPaths(rootPath, file);
    const hasTest = candidates.some(p => testFileSet.has(path.resolve(p)));
    if (hasTest) continue;

    findings.push({
      filePath: file,
      exportCount,
      searchedPaths: candidates,
      severity: classifySeverity(file, exportCount),
    });
  }
  return findings;
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(file);
}

async function countExports(filePath: string): Promise<number> {
  const source = await fsp.readFile(filePath, 'utf-8');
  const tree = parser.parse(source);
  let count = 0;
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'export_statement') count++;
    for (const c of n.children) walk(c);
  }
  walk(tree.rootNode);
  return count;
}

function candidateTestPaths(rootPath: string, sourceFile: string): string[] {
  const ext = path.extname(sourceFile);
  const base = path.basename(sourceFile, ext);
  const dir = path.dirname(sourceFile);
  const rel = path.relative(rootPath, sourceFile).replace(/\.tsx?$/, '');

  return [
    path.join(dir, `${base}.test${ext}`),
    path.join(dir, `${base}.spec${ext}`),
    path.join(rootPath, 'tests', `${rel}.test.ts`),
    path.join(rootPath, '__tests__', `${path.basename(rel)}.test.ts`),
    // packages/<pkg>/tests/<rel-from-src>/...
    path.join(packageRoot(sourceFile), 'tests', relFromSrc(sourceFile)),
  ];
}

function packageRoot(file: string): string {
  let dir = path.dirname(file);
  while (dir !== path.parse(dir).root) {
    if (path.basename(dir) === 'src') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return path.dirname(file);
}

function relFromSrc(file: string): string {
  const pkg = packageRoot(file);
  const srcPath = path.join(pkg, 'src');
  const rel = path.relative(srcPath, file).replace(/\.tsx?$/, '');
  return `${rel}.test.ts`;
}

function classifySeverity(filePath: string, exportCount: number): 'low' | 'medium' | 'high' {
  if (exportCount >= 6) return 'high';
  if (filePath.includes(`${path.sep}core${path.sep}src${path.sep}`)) return 'high';
  if (exportCount >= 3) return 'medium';
  return 'low';
}
```

- [ ] Wire into `analyzeProject`:

```typescript
import { detectTestProximity } from '../temporal/test-proximity';
…
const testProximityFindings = await detectTestProximity(root, allFiles);
```

Note: `allFiles` should include test files (we need them in the set to recognize them), so adjust glob defaults: don't exclude `**/*.test.ts` from project-wide walk; only exclude them from per-file scoring.

### 3.5 Commit

```bash
git commit -m "feat(core): detect test-coverage proximity via conventional .test.ts adjacency"
```

### 3.6 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 4 new test-proximity tests pass.
- [ ] Running on our own repo identifies any `core/src/` file lacking a `core/tests/.../<name>.test.ts` (likely candidates: none — every file has a test).
- [ ] Configurable via future option `disableTestProximity: true` for projects that use non-conventional test placement.

---

## Task 4 — Expose hotspot data via MCP tool

### 4.1 Update `code_health_project_review` output

- [ ] Edit `packages/mcp-server/src/tools/project-review.ts` (from Sprint 6) — the response now naturally includes `hotspotFindings`, `testProximityFindings`. No code changes needed because we forward the entire `ProjectAnalysisResult`.

### 4.2 New tool: `code_health_hotspots`

A focused tool when the agent only cares about the top hotspots — saves token-budget vs the full project review.

- [ ] Create `packages/mcp-server/src/tools/hotspots.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeProject } from '@healthy-ai-code/core';

export function registerHotspots(server: McpServer): void {
  server.tool(
    'code_health_hotspots',
    'Returnerar topp-N hotspots i ett projekt: filer som är både komplexa och ofta-ändrade.',
    {
      rootPath: z.string().describe('Absolut sökväg till projektroten'),
      topN: z.number().int().min(1).max(50).default(10),
      window: z.string().default('12 months').describe('Tidsperiod, t.ex. "6 months" eller "30 days"'),
    },
    async ({ rootPath, topN, window }) => {
      const result = await analyzeProject({
        rootPath,
        hotspotTopN: topN,
        hotspotWindow: window,
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ hotspots: result.hotspotFindings }, null, 2),
        }],
      };
    }
  );
}
```

- [ ] Register in `server.ts`.
- [ ] Write test in `tests/tools/hotspots.test.ts`.

### 4.3 Commit

```bash
git commit -m "feat(mcp-server): add code_health_hotspots tool returning top-N hotspots"
```

---

## Task 5 — Performance budget & caching

Running git per file is the slowest part. For a 500-file project, that's 500 `git log` invocations.

### 5.1 Implement a process-level cache

- [ ] Add a hash key `<commit-hash-of-HEAD>:<file-rel-path>` → `commitCount`. Persist to `<root>/.healthy-ai-cache/hotspots.json`. Invalidate when HEAD moves.

- [ ] Optional: switch to a single `git log --name-only --since=... --pretty=format:'%H'` invocation and parse on our side — O(1) git calls regardless of project size.

### 5.2 Benchmark

- [ ] Add `packages/core/tests/benchmarks/hotspot-perf.bench.ts`:

```typescript
import { bench, describe } from 'vitest';
import { analyzeProject } from '../../src/project';

describe('hotspot perf', () => {
  bench('our own repo (23 files)', async () => {
    await analyzeProject({ rootPath: path.resolve(__dirname, '../../../..') });
  }, { time: 30000 });
});
```

Target: < 5 s on 23-file repo; < 30 s on 500-file repo.

### 5.3 Commit

```bash
git commit -m "perf(core): cache hotspot commit counts keyed by HEAD"
```

---

## Definition of Done

- [ ] All 3 new finding types are implemented, tested, weighted (where applicable), and surfaced through `analyzeProject`.
- [ ] Two new MCP tools (`code_health_hotspots`) registered alongside the Sprint-6 `code_health_project_review`.
- [ ] Existing 258+ tests still pass; 13+ new tests pass.
- [ ] Running `analyzeProject` on our own repo:
  - Identifies the actual hotspots (the analyzers we churned in Sprint 2 + Sprint 5).
  - Finds no Brain Method smells (we refactored everything under 30 lines).
  - Finds no test-proximity smells (every source file has a `.test.ts` neighbor).
- [ ] Performance budget met: < 5 s for our 23-file repo.
- [ ] Documentation: README has a "Hotspot analysis" section with an example.

---

## Risks / Open Questions

- **Git binary required** — the analyzer now hard-depends on `git` being on PATH. The MCP-server should detect missing git and degrade gracefully (return empty `hotspotFindings` with a warning) rather than crash.
- **Shallow clones** — CI environments often clone with `--depth=1`, which kills all hotspot signal. Detect this (`git rev-list --count HEAD` < 5 ?) and warn.
- **File rename detection** — `git log --follow` is heuristic. For renamed files, our commit count may be off. Acceptable for v1.
- **Brain Method on non-TS files** — Java/Python/C# analyzers don't yet pass an AST root to a brain-method detector. Sprint 7 implements only TS; cross-language Brain Method is deferred.
- **Centrality is in-file only** — a function that is called heavily *across* files (e.g., a utility `formatDate` everywhere) won't get a centrality boost. Cross-file centrality requires the Sprint 6 import-graph; reusing it is a follow-up.
- **Test-proximity false negatives** — projects with co-located tests via Storybook (`*.stories.ts`), Cypress (`*.cy.ts`), or contract tests will not be detected. Document the supported patterns and let the option list grow over time.
- **Hotspot cache invalidation** — keyed on HEAD only; doesn't catch un-committed work. Acceptable; the tool is meant for project-level posture, not in-progress changes.
- **CodeScene direct comparison** — once Sprint 7 ships we will have meaningful biomarker coverage (~10 of CodeScene's 25). Document the remaining gap (e.g. Developer Congestion, Complex Code by Former Contributors, Coupling) as future-work candidates for Sprint 8+.
