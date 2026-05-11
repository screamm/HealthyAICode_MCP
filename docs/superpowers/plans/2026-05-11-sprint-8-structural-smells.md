# Sprint 8: Structural Code Smells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new per-file, AST-detectable code smells that require no git history and no cross-file graph: ComplexConditional (nested ternaries + deep boolean chains), MessageChain (excessive dot-call chaining), DataClumps (repeated parameter groups within a file), and SATD (Self-Admitted Technical Debt via comment keyword scanning). After this sprint our biomarker count reaches **20**, closing the mid-range gap to CodeScene.

**Background (30-search research round, 2026-05-11):**

- **ComplexConditional** — SonarQube TS rule `no-nested-ternary` always flags nested ternaries (severity: Bug). Boolean chains with >3 `&&`/`||` operators are flagged by SonarQube Cognitive Complexity increments. Research: *Sonar Blog 2025, "Stop nesting ternaries in JavaScript."*
- **MessageChain** — Fowler: a chain longer than `a.b().c()` signals Law-of-Demeter violation and hidden coupling. Detection threshold: member-call chain depth ≥ 4. Research: *luzkan.github.io/smells/message-chain*; LinearB Blog 2024.
- **DataClumps** — Fowler: ≥3 parameters appearing together in multiple function signatures suggest a missing abstraction. A 2023 IntelliJ plugin achieves <1 s live detection via AST. Research: *Springer ICSE 2024 "Advancing Code Smell Detection."*
- **SATD** — TODO/FIXME/HACK comment scanning has ≈90 % precision (2024 survey arXiv:2312.15020). A Jan-2026 paper (arXiv:2601.07786) finds Design Debt is now the dominant GenAI-induced SATD category. We add severity tiers.

**Architecture:** All four detectors live in `packages/core/src/smells/` beside the existing `detector.ts`. Each exports a single `detect*(node, source)` function returning `Smell[]`. The `detectSmells` orchestrator calls them after existing detectors.

**Tech Stack:** TypeScript 5.x, tree-sitter (existing), Vitest, pnpm workspaces

**Estimated effort:** 1–2 days (4 small, self-contained tasks)

---

## Prerequisites (verify before starting)

- [ ] Sprint 7 is merged and green; all 258 tests pass.
- [ ] `packages/core/src/smells/detector.ts` exposes `detectSmells(tree, source, filePath)`.
- [ ] `packages/core/src/types.ts` has the `Smell` interface with `type`, `severity`, `description`, `suggestion`.

---

## Task 1 — ComplexConditional smell

### 1.1 Algorithm

Two independent sub-rules, each emitting a separate `Smell`:

**Sub-rule A: Nested Ternary** — Walk AST for `ternary_expression` nodes. Flag any whose `consequent` or `alternate` child is itself a `ternary_expression`. Severity: `high`.

**Sub-rule B: Boolean Chain Overload** — Walk for `binary_expression` nodes with operator `&&` or `||`. Count total logical operators in the top-level expression chain. Flag if count > 3. Severity: `medium`.

Threshold sources: SonarQube TS rule (always flag nested ternaries), ESLint `complexity` default (chain > 3).

### 1.2 Implementation

- [ ] Create `packages/core/src/smells/complex-conditional.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const TERNARY = 'ternary_expression';
const BINARY = 'binary_expression';
const LOGICAL_OPS = new Set(['&&', '||']);
const BOOLEAN_CHAIN_THRESHOLD = 3;

export function detectComplexConditional(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (node.type === TERNARY) checkNestedTernary(node, acc);
  if (node.type === BINARY) checkBoolChain(node, acc);
  for (const child of node.children) visitAll(child, acc);
}

function checkNestedTernary(node: SyntaxNode, acc: Smell[]): void {
  const c = node.childForFieldName('consequence');
  const a = node.childForFieldName('alternative');
  if (c?.type === TERNARY || a?.type === TERNARY) {
    acc.push({
      type: 'ComplexConditional',
      severity: 'high',
      description: 'Nested ternary operator makes logic extremely hard to read.',
      suggestion: 'Extract to named variables or use if/else blocks.',
      line: node.startPosition.row + 1,
    });
  }
}

function logicalOpCount(node: SyntaxNode): number {
  if (node.type !== BINARY) return 0;
  const op = node.childForFieldName('operator')?.text ?? '';
  if (!LOGICAL_OPS.has(op)) return 0;
  return 1 + logicalOpCount(node.child(0)!) + logicalOpCount(node.child(2)!);
}

function isChainRoot(node: SyntaxNode): boolean {
  const parentOp = node.parent?.childForFieldName?.('operator')?.text ?? '';
  return !LOGICAL_OPS.has(parentOp);
}

function checkBoolChain(node: SyntaxNode, acc: Smell[]): void {
  if (!isChainRoot(node)) return;
  const ops = logicalOpCount(node);
  if (ops > BOOLEAN_CHAIN_THRESHOLD) {
    acc.push({
      type: 'ComplexConditional',
      severity: 'medium',
      description: `Boolean expression has ${ops} logical operators — hard to parse mentally.`,
      suggestion: 'Extract sub-conditions into named boolean variables.',
      line: node.startPosition.row + 1,
    });
  }
}
```

### 1.3 Tests

- [ ] Create `packages/core/tests/smells/complex-conditional.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectComplexConditional } from '../../src/smells/complex-conditional';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('ComplexConditional', () => {
  it('flags nested ternary as high', () => {
    const tree = parse('const x = a ? b ? 1 : 2 : 3;');
    expect(detectComplexConditional(tree).some(s => s.severity === 'high')).toBe(true);
  });

  it('flags boolean chain > 3 as medium', () => {
    const tree = parse('if (a && b && c && d) {}');
    expect(detectComplexConditional(tree).some(s => s.severity === 'medium')).toBe(true);
  });

  it('does not flag simple ternary', () => {
    expect(detectComplexConditional(parse('const x = a ? b : c;'))).toHaveLength(0);
  });

  it('does not flag short boolean chain', () => {
    expect(detectComplexConditional(parse('if (a && b) {}'))).toHaveLength(0);
  });
});
```

### 1.4 Wire into orchestrator

- [ ] Edit `packages/core/src/smells/detector.ts` — add import and call:
  ```typescript
  import { detectComplexConditional } from './complex-conditional';
  // inside detectSmells():
  ...detectComplexConditional(tree.rootNode),
  ```

---

## Task 2 — MessageChain smell

### 2.1 Algorithm

A **message chain** is consecutive member-access-plus-call: `a.foo().bar().baz()`. Represented in the AST as nested `call_expression` nodes where the `function` child is a `member_expression`.

**Detection:**
1. Walk AST for `call_expression` nodes.
2. Unwrap the call chain (follow `function → member_expression → object → call_expression`) counting depth.
3. Flag any chain with depth ≥ `CHAIN_THRESHOLD = 4`.
4. Flag only the outermost call to avoid duplicates.

**Threshold rationale:** Fluent builders like `expect().toBe()` have depth 2–3. Depth ≥ 4 reliably signals Law-of-Demeter violations (luzkan.github.io; LinearB 2024).

### 2.2 Implementation

- [ ] Create `packages/core/src/smells/message-chain.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const CHAIN_THRESHOLD = 4;

export function detectMessageChain(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (node.type === 'call_expression' && isChainRoot(node)) {
    const depth = chainDepth(node);
    if (depth >= CHAIN_THRESHOLD) {
      acc.push({
        type: 'MessageChain',
        severity: 'medium',
        description: `Method chain of depth ${depth} — violates Law of Demeter and hides dependencies.`,
        suggestion: 'Introduce intermediate variables or delegate to a helper.',
        line: node.startPosition.row + 1,
      });
    }
  }
  for (const child of node.children) visitAll(child, acc);
}

function isChainRoot(node: SyntaxNode): boolean {
  const p = node.parent;
  if (!p) return true;
  if (p.type === 'member_expression' && p.parent?.type === 'call_expression') return false;
  return true;
}

function chainDepth(node: SyntaxNode): number {
  if (node.type !== 'call_expression') return 0;
  const fn = node.childForFieldName('function');
  if (fn?.type !== 'member_expression') return 1;
  return 1 + chainDepth(fn.childForFieldName('object')!);
}
```

### 2.3 Tests

- [ ] Create `packages/core/tests/smells/message-chain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectMessageChain } from '../../src/smells/message-chain';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('MessageChain', () => {
  it('flags chain of depth 4', () => {
    const tree = parse('a.b().c().d().e();');
    expect(detectMessageChain(tree).some(s => s.type === 'MessageChain')).toBe(true);
  });

  it('does not flag chain of depth 3', () => {
    expect(detectMessageChain(parse('a.b().c().d();'))).toHaveLength(0);
  });

  it('does not flag test fluent interface', () => {
    expect(detectMessageChain(parse('expect(x).toBe(1);'))).toHaveLength(0);
  });
});
```

### 2.4 Wire into orchestrator

- [ ] Edit `packages/core/src/smells/detector.ts`:
  ```typescript
  import { detectMessageChain } from './message-chain';
  // inside detectSmells():
  ...detectMessageChain(tree.rootNode),
  ```

---

## Task 3 — DataClumps smell

### 3.1 Algorithm

A **data clump** (Fowler) is ≥3 parameters appearing together in multiple function signatures, suggesting a missing abstraction.

**Detection (intra-file):**
1. Collect all function/method parameter name-sets from the AST (only groups of ≥ `CLUMP_SIZE = 3` names).
2. For each pair of parameter groups, compute the intersection.
3. If intersection ≥ `CLUMP_SIZE` and that same group appears in ≥ `MIN_OCCURRENCES = 2` signatures → DataClumps smell.
4. Report once per unique clump key (deduplicated by sorted parameter names).

### 3.2 Implementation

- [ ] Create `packages/core/src/smells/data-clumps.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const CLUMP_SIZE = 3;
const MIN_OCCURRENCES = 2;
const PARAM_LIST_NODES = new Set(['formal_parameters', 'parameter_list']);

interface ParamGroup { names: Set<string>; line: number }

export function detectDataClumps(tree: SyntaxNode): Smell[] {
  const groups = collectGroups(tree);
  return groups.length < MIN_OCCURRENCES ? [] : findClumps(groups);
}

function collectGroups(node: SyntaxNode): ParamGroup[] {
  const result: ParamGroup[] = [];
  walkForParams(node, result);
  return result;
}

function walkForParams(node: SyntaxNode, acc: ParamGroup[]): void {
  if (PARAM_LIST_NODES.has(node.type)) {
    const names = new Set<string>();
    for (const child of node.namedChildren) {
      const id = child.type === 'identifier' ? child.text
        : child.childForFieldName?.('pattern')?.text ?? '';
      if (id && !id.startsWith('_')) names.add(id);
    }
    if (names.size >= CLUMP_SIZE) acc.push({ names, line: node.startPosition.row + 1 });
  }
  for (const child of node.children) walkForParams(child, acc);
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter(x => b.has(x)));
}

function findClumps(groups: ParamGroup[]): Smell[] {
  const smells: Smell[] = [];
  const reported = new Set<string>();
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const common = intersect(groups[i].names, groups[j].names);
      if (common.size < CLUMP_SIZE) continue;
      const key = [...common].sort().join(',');
      if (reported.has(key)) continue;
      reported.add(key);
      smells.push({
        type: 'DataClumps',
        severity: 'medium',
        description: `Parameters [${[...common].join(', ')}] appear together in multiple signatures — missing abstraction.`,
        suggestion: 'Extract these parameters into a dedicated interface or type.',
        line: groups[i].line,
      });
    }
  }
  return smells;
}
```

### 3.3 Tests

- [ ] Create `packages/core/tests/smells/data-clumps.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectDataClumps } from '../../src/smells/data-clumps';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('DataClumps', () => {
  it('flags three shared params across two functions', () => {
    const src = `
      function a(x: number, y: number, z: number) {}
      function b(x: number, y: number, z: number, extra: string) {}
    `;
    expect(detectDataClumps(parse(src)).some(s => s.type === 'DataClumps')).toBe(true);
  });

  it('does not flag when only two params match', () => {
    const src = `
      function a(x: number, y: number) {}
      function b(x: number, y: number) {}
    `;
    expect(detectDataClumps(parse(src))).toHaveLength(0);
  });

  it('does not flag when clump appears only once', () => {
    const src = `
      function a(x: number, y: number, z: number) {}
      function b(a: string, b: string, c: string) {}
    `;
    expect(detectDataClumps(parse(src))).toHaveLength(0);
  });
});
```

### 3.4 Wire into orchestrator

- [ ] Edit `packages/core/src/smells/detector.ts`:
  ```typescript
  import { detectDataClumps } from './data-clumps';
  // inside detectSmells():
  ...detectDataClumps(tree.rootNode),
  ```

---

## Task 4 — SATD (Self-Admitted Technical Debt) smell

### 4.1 Algorithm

SATD detection scans **comment nodes** in the AST for keywords that signal technical debt. Industry baseline precision ≈90 % (arXiv:2312.15020 systematic review, 2024). A Jan-2026 paper (arXiv:2601.07786) shows GenAI-induced Design Debt is now the dominant SATD category.

**Keyword tiers:**

| Tier | Keywords | Severity |
|------|----------|----------|
| 1 | `HACK`, `XXX`, `BUG` | `critical` |
| 2 | `FIXME`, `BROKEN` | `high` |
| 3 | `TODO`, `TEMP`, `WORKAROUND`, `KLUDGE` | `medium` |
| 4 | `SMELL`, `REFACTOR` | `low` |

**Rules:**
- Case-insensitive, word-boundary match (regex `\b(KEYWORD)\b`) to avoid false positives (`"today"` ≠ `"TODO"`).
- Scan `comment`, `line_comment`, `block_comment` AST nodes.
- One smell per comment — highest tier wins.

### 4.2 Implementation

Note: `text.match(pattern)` is used (not regex `.exec`) to stay within this project's preferred API style.

- [ ] Create `packages/core/src/smells/satd.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const COMMENT_NODES = new Set(['comment', 'line_comment', 'block_comment']);

type Tier = { pattern: RegExp; severity: Smell['severity']; label: string };

const TIERS: Tier[] = [
  { pattern: /\b(HACK|XXX|BUG)\b/i,                   severity: 'critical', label: 'Critical debt' },
  { pattern: /\b(FIXME|BROKEN)\b/i,                   severity: 'high',     label: 'Must-fix debt' },
  { pattern: /\b(TODO|TEMP|WORKAROUND|KLUDGE)\b/i,    severity: 'medium',   label: 'Technical debt' },
  { pattern: /\b(SMELL|REFACTOR)\b/i,                 severity: 'low',      label: 'Refactoring note' },
];

export function detectSATD(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (COMMENT_NODES.has(node.type)) checkComment(node, acc);
  for (const child of node.children) visitAll(child, acc);
}

function checkComment(node: SyntaxNode, acc: Smell[]): void {
  const text = node.text;
  for (const { pattern, severity, label } of TIERS) {
    const found = text.match(pattern);
    if (found) {
      acc.push({
        type: 'SATD',
        severity,
        description: `${label}: "${found[0]}" in comment — self-admitted technical debt.`,
        suggestion: 'Create a tracked issue for this debt and remove the comment, or resolve it now.',
        line: node.startPosition.row + 1,
      });
      return;
    }
  }
}
```

### 4.3 Tests

- [ ] Create `packages/core/tests/smells/satd.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectSATD } from '../../src/smells/satd';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('SATD', () => {
  it('flags FIXME as high', () => {
    expect(detectSATD(parse('// FIXME: this is broken')).some(s => s.severity === 'high')).toBe(true);
  });

  it('flags TODO as medium', () => {
    expect(detectSATD(parse('// TODO: refactor this')).some(s => s.severity === 'medium')).toBe(true);
  });

  it('flags HACK as critical', () => {
    expect(detectSATD(parse('// HACK: temporary workaround')).some(s => s.severity === 'critical')).toBe(true);
  });

  it('does not flag normal comments', () => {
    expect(detectSATD(parse('// This function calculates the total price'))).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    expect(detectSATD(parse('// todo: add validation')).some(s => s.type === 'SATD')).toBe(true);
  });

  it('does not flag "today" as TODO', () => {
    expect(detectSATD(parse('// Run today\'s report'))).toHaveLength(0);
  });
});
```

### 4.4 Update Smell severity union type

- [ ] Ensure `packages/core/src/types.ts` includes `'critical'` in the severity union:

```typescript
export interface Smell {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  line?: number;
}
```

### 4.5 Wire into orchestrator

- [ ] Edit `packages/core/src/smells/detector.ts`:
  ```typescript
  import { detectSATD } from './satd';
  // inside detectSmells():
  ...detectSATD(tree.rootNode),
  ```

---

## Task 5 — Re-baseline own codebase

- [ ] Run `pnpm test` — all tests pass (including 4 new test files, ≥262 tests total).
- [ ] Run the MCP inspect command and verify SATD does not fire on the codebase (no TODO/FIXME comments in prod code).
- [ ] Confirm `detector.ts` still scores ≥9.5 — new detectors must not introduce smells in the orchestrator itself.
- [ ] Add entry to `CHANGELOG.md`: "Sprint 8: ComplexConditional, MessageChain, DataClumps, SATD detectors."

---

## Biomarker Scorecard After Sprint 8

| # | Biomarker | Sprint | Source |
|---|-----------|--------|--------|
| 1 | LargeFile | baseline | Fowler / CodeScene |
| 2 | LargeMethod | baseline | Fowler / CodeScene |
| 3 | ComplexMethod (cyclomatic) | baseline | McCabe 1976 |
| 4 | DeepNesting | baseline | Fowler / CodeScene |
| 5 | LongParameterList | baseline | Fowler |
| 6 | BumpyRoad | baseline | CodeScene |
| 7 | CognitiveComplexity | Sprint 5 | SonarSource 2018 |
| 8 | TypeSafetyEscape | Sprint 5 | TS strict mode |
| 9 | MagicNumber | Sprint 5 | Fowler |
| 10 | LowDocCoverage | Sprint 5 | JSDoc ratio |
| 11 | Duplication | Sprint 6 | Token-N-gram Jaccard |
| 12 | LanguageMix | Sprint 6 | AI-friction heuristic |
| 13 | DeadExports | Sprint 6 | Import-graph |
| 14 | Hotspot | Sprint 7 | CodeScene / Tornhill |
| 15 | BrainMethod | Sprint 7 | CodeScene compound |
| 16 | TestProximity | Sprint 7 | Defect-density proxy |
| 17 | **ComplexConditional** | **Sprint 8** | SonarQube TS rules |
| 18 | **MessageChain** | **Sprint 8** | Fowler / Law of Demeter |
| 19 | **DataClumps** | **Sprint 8** | Fowler / Springer 2024 |
| 20 | **SATD** | **Sprint 8** | arXiv:2312.15020 |

**Remaining gap to CodeScene 26: 6 biomarkers → covered by Sprint 9 (3) and Sprint 10 (3+)**
