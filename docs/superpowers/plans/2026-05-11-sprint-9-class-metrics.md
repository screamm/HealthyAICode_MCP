# Sprint 9: Class-Level Metrics & Maintainability Index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three powerful metrics that lift our analyzer from function-level to class-level understanding: **GodClass** (ATFD + WMC + LCOM4 thresholds from "Object-Oriented Metrics in Practice"), **FeatureEnvy** (method depends more on foreign types than its own class), and the **Maintainability Index** (Microsoft/Radon formula combining Halstead Volume + Cyclomatic Complexity + LOC). After this sprint our biomarker count reaches **23**, one below CodeScene's 26 — the gap is closed in Sprint 10.

**Background (30-search research round, 2026-05-11):**

- **GodClass** — Lanza & Marinescu "Object-Oriented Metrics in Practice" defines: `ATFD > 5 AND WMC ≥ 47 AND TCC < 0.33`. Research: NDepend docs; *ScienceDirect 2022 "Automatic detection of Long Method and God Class."*
  - ATFD (Access To Foreign Data): number of distinct foreign class instances accessed.
  - WMC (Weighted Methods per Class): sum of method complexities (or method count for unweighted).
  - TCC (Tight Class Cohesion): fraction of method pairs that share ≥1 field access.
  - For our file-based approach: ATFD ≈ number of distinct imported types accessed, WMC ≈ total cyclomatic complexity of all methods, LCOM4 (connected components) as proxy for TCC.
- **FeatureEnvy** — JMove algorithm: a method's dependency set is more aligned with a foreign class than its own. Practical heuristic: method calls ≥2 distinct methods on the *same* imported type and those calls exceed calls to own-class methods. Detection achieves F1=88.68 % (ScienceDirect 2023 ML study).
- **Maintainability Index (MI)** — Microsoft formula: `MI = MAX(0, (171 − 5.2×ln(HV) − 0.23×CC − 16.2×ln(LOC)) × 100/171)`. Thresholds: MI<10 = Red, 10–19 = Yellow, 20+ = Green. Halstead Volume: `HV = N × log2(n)` where N = total operator+operand count, n = distinct operator+operand count. Research: *Microsoft Learn "Code metrics — Maintainability index range"; Radon docs.*

**Architecture:**
- GodClass and FeatureEnvy detectors: `packages/core/src/smells/god-class.ts` and `./feature-envy.ts`.
- Maintainability Index: `packages/core/src/metrics/maintainability.ts`. Exposed as a new field `maintainabilityIndex: number` in `FileMetrics`, and a new smell `LowMaintainability` (MI < 40) in the orchestrator.
- Halstead sub-metrics: computed inside `maintainability.ts`, not exposed as separate smells (they feed MI).

**Tech Stack:** TypeScript 5.x, tree-sitter (existing), Vitest, pnpm workspaces

**Estimated effort:** 3–5 days (3 tasks, 1–2 days each)

---

## Prerequisites (verify before starting)

- [ ] Sprint 8 is merged and green; ≥262 tests pass.
- [ ] `packages/core/src/types.ts` has `FileMetrics` interface.
- [ ] Sprint 6 `analyzeProject` provides cross-file import data (needed for ATFD in GodClass).

---

## Task 1 — GodClass smell

### 1.1 Algorithm

A **God Class** centralizes system intelligence, is large, complex, and uses other classes' data.

**Detection thresholds** (Lanza & Marinescu):
- `ATFD > ATFD_THRESHOLD = 5` — many foreign class accesses
- `WMC >= WMC_THRESHOLD = 20` — high total method complexity (lowered from 47 for file-scoped analysis; 47 assumes large enterprise Java classes — our TypeScript files are smaller in scope)
- `LCOM4 > 1` — class has disconnected method groups (not cohesive)

**Per-file (single-class) approximation:**
- ATFD: count distinct imported type names that appear as property accesses in method bodies.
- WMC: sum of cyclomatic complexity of all methods in the file (already computed by existing analyzers).
- LCOM4: number of connected components in the method-field access graph (1 = cohesive, >1 = split).

For multi-class files, run detection per class node independently.

### 1.2 LCOM4 computation

```
Build a graph:
  - Nodes: methods in the class
  - Edges: two methods share an edge if they both access the same class field

LCOM4 = number of connected components in this graph
```

A LCOM4 of 1 means all methods are related. LCOM4 > 1 means the class should be split.

### 1.3 Implementation

- [ ] Create `packages/core/src/smells/god-class.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const ATFD_THRESHOLD = 5;
const WMC_THRESHOLD = 20;

export function detectGodClass(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const smells: Smell[] = [];
  for (const cls of findClasses(tree)) {
    analyzeClass(cls, importedTypeNames, smells);
  }
  return smells;
}

function findClasses(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  if (node.type === 'class_declaration' || node.type === 'class') result.push(node);
  for (const child of node.children) result.push(...findClasses(child));
  return result;
}

function analyzeClass(cls: SyntaxNode, importedTypeNames: Set<string>, acc: Smell[]): void {
  const methods = collectMethods(cls);
  const wmc = computeWMC(methods);
  const atfd = computeATFD(cls, importedTypeNames);
  const lcom4 = computeLCOM4(methods, cls);

  if (atfd > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1) {
    acc.push({
      type: 'GodClass',
      severity: 'high',
      description: `God Class: ATFD=${atfd} (>${ATFD_THRESHOLD}), WMC=${wmc} (>=${WMC_THRESHOLD}), LCOM4=${lcom4} (>1). Class centralizes too much responsibility.`,
      suggestion: 'Split into smaller classes, each with a single responsibility. Move foreign-data access into separate services.',
      line: cls.startPosition.row + 1,
    });
  }
}

function collectMethods(cls: SyntaxNode): SyntaxNode[] {
  const METHOD_TYPES = new Set(['method_definition', 'function_declaration']);
  const result: SyntaxNode[] = [];
  for (const child of cls.namedChildren) {
    const body = child.childForFieldName?.('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (METHOD_TYPES.has(member.type)) result.push(member);
      }
    }
  }
  return result;
}

function computeWMC(methods: SyntaxNode[]): number {
  let total = 0;
  for (const m of methods) {
    const body = m.childForFieldName?.('body');
    if (body) total += countDecisions(body) + 1;
  }
  return total;
}

function countDecisions(node: SyntaxNode): number {
  const DECISION_NODES = new Set(['if_statement', 'while_statement', 'for_statement', 'switch_case', 'ternary_expression']);
  let count = 0;
  if (DECISION_NODES.has(node.type)) count++;
  for (const child of node.children) count += countDecisions(child);
  return count;
}

function computeATFD(cls: SyntaxNode, importedTypeNames: Set<string>): number {
  const foreignAccesses = new Set<string>();
  findForeignAccesses(cls, importedTypeNames, foreignAccesses);
  return foreignAccesses.size;
}

function findForeignAccesses(node: SyntaxNode, importedNames: Set<string>, acc: Set<string>): void {
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName?.('object');
    if (obj && importedNames.has(obj.text)) acc.add(obj.text);
  }
  for (const child of node.children) findForeignAccesses(child, importedNames, acc);
}

function computeLCOM4(methods: SyntaxNode[], cls: SyntaxNode): number {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNames(cls);
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());
  for (const field of fieldNames) {
    const accessors = methods.map((m, i) => usesField(m, field) ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < accessors.length; i++) {
      for (let j = i + 1; j < accessors.length; j++) {
        adjacency.get(accessors[i])!.add(accessors[j]);
        adjacency.get(accessors[j])!.add(accessors[i]);
      }
    }
  }
  return connectedComponents(adjacency, methods.length);
}

function collectFieldNames(cls: SyntaxNode): string[] {
  const names: string[] = [];
  for (const child of cls.namedChildren) {
    const body = child.childForFieldName?.('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'public_field_definition' || member.type === 'field_definition') {
          const name = member.childForFieldName?.('name')?.text;
          if (name) names.push(name);
        }
      }
    }
  }
  return names;
}

function usesField(method: SyntaxNode, fieldName: string): boolean {
  if (method.text.includes(`this.${fieldName}`)) return true;
  return false;
}

function connectedComponents(adj: Map<number, Set<number>>, n: number): number {
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) {
      components++;
      bfs(i, adj, visited);
    }
  }
  return components;
}

function bfs(start: number, adj: Map<number, Set<number>>, visited: Set<number>): void {
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
}
```

### 1.4 Tests

- [ ] Create `packages/core/tests/smells/god-class.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectGodClass } from '../../src/smells/god-class';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

const BIG_IMPORTS = new Set(['ServiceA', 'ServiceB', 'ServiceC', 'ServiceD', 'ServiceE', 'ServiceF']);

describe('GodClass', () => {
  it('flags class with high ATFD, WMC, and LCOM4 > 1', () => {
    const src = `
      class BigClass {
        a: string;
        b: string;
        method1() { ServiceA.doThing(); ServiceB.doThing(); }
        method2() { ServiceC.doThing(); ServiceD.doThing(); }
        method3() { ServiceE.doThing(); ServiceF.doThing(); }
        method4() { if (x) { if (y) {} } }
        method5() { if (x) { for (;;) {} } }
      }
    `;
    const smells = detectGodClass(parse(src), BIG_IMPORTS);
    expect(smells.some(s => s.type === 'GodClass')).toBe(true);
  });

  it('does not flag small cohesive class', () => {
    const src = `
      class Small {
        value: number;
        getValue() { return this.value; }
        setValue(v: number) { this.value = v; }
      }
    `;
    expect(detectGodClass(parse(src), new Set())).toHaveLength(0);
  });
});
```

### 1.5 Wire into orchestrator

GodClass requires the set of imported type names. The `detector.ts` orchestrator must extract these from the AST before calling `detectGodClass`.

- [ ] Edit `packages/core/src/smells/detector.ts`:
  ```typescript
  import { detectGodClass } from './god-class';

  function extractImportedNames(tree: SyntaxNode): Set<string> {
    const names = new Set<string>();
    for (const node of tree.namedChildren) {
      if (node.type === 'import_declaration') {
        for (const child of node.namedChildren) {
          if (child.type === 'import_clause') {
            for (const id of child.namedChildren) {
              if (id.type === 'identifier') names.add(id.text);
            }
          }
        }
      }
    }
    return names;
  }

  // Inside detectSmells():
  const importedNames = extractImportedNames(tree.rootNode);
  ...detectGodClass(tree.rootNode, importedNames),
  ```

---

## Task 2 — FeatureEnvy smell

### 2.1 Algorithm

**Feature Envy** (Fowler): a method is more interested in another class's data than its own.

**Practical heuristic (intra-file):**
1. For each method, count calls to methods/properties on each distinct imported type (foreign calls) vs. calls to `this.*` (own calls).
2. Flag if: the most-called foreign type gets > `ENVY_RATIO = 0.6` of all calls AND has ≥ `MIN_FOREIGN_CALLS = 3` calls.

This is a simplified but effective version of the JMove algorithm (F1=88.68% in research).

### 2.2 Implementation

- [ ] Create `packages/core/src/smells/feature-envy.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const ENVY_RATIO = 0.6;
const MIN_FOREIGN_CALLS = 3;

export function detectFeatureEnvy(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const smells: Smell[] = [];
  collectMethods(tree, smells, importedTypeNames);
  return smells;
}

const METHOD_TYPES = new Set(['method_definition', 'function_declaration', 'arrow_function']);

function collectMethods(node: SyntaxNode, acc: Smell[], importedNames: Set<string>): void {
  if (METHOD_TYPES.has(node.type)) {
    checkMethod(node, acc, importedNames);
  }
  for (const child of node.children) collectMethods(child, acc, importedNames);
}

function checkMethod(method: SyntaxNode, acc: Smell[], importedNames: Set<string>): void {
  const foreignCallCounts = new Map<string, number>();
  let ownCalls = 0;
  countCalls(method, foreignCallCounts, importedNames, () => ownCalls++);
  if (foreignCallCounts.size === 0) return;

  const totalCalls = ownCalls + [...foreignCallCounts.values()].reduce((s, c) => s + c, 0);
  if (totalCalls === 0) return;

  let maxType = '';
  let maxCount = 0;
  for (const [type, count] of foreignCallCounts) {
    if (count > maxCount) { maxCount = count; maxType = type; }
  }

  if (maxCount >= MIN_FOREIGN_CALLS && maxCount / totalCalls >= ENVY_RATIO) {
    const name = method.childForFieldName?.('name')?.text ?? 'anonymous';
    acc.push({
      type: 'FeatureEnvy',
      severity: 'medium',
      description: `Method "${name}" makes ${maxCount}/${totalCalls} calls to "${maxType}" — more interested in that type than its own class.`,
      suggestion: `Move this method closer to "${maxType}" or extract a service that encapsulates this interaction.`,
      line: method.startPosition.row + 1,
    });
  }
}

function countCalls(
  node: SyntaxNode,
  foreign: Map<string, number>,
  importedNames: Set<string>,
  countOwn: () => void,
): void {
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName?.('object');
    if (obj) {
      if (obj.text === 'this') { countOwn(); }
      else if (importedNames.has(obj.text)) {
        foreign.set(obj.text, (foreign.get(obj.text) ?? 0) + 1);
      }
    }
  }
  for (const child of node.children) countCalls(child, foreign, importedNames, countOwn);
}
```

### 2.3 Tests

- [ ] Create `packages/core/tests/smells/feature-envy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectFeatureEnvy } from '../../src/smells/feature-envy';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('FeatureEnvy', () => {
  it('flags method that mostly uses foreign type', () => {
    const src = `
      class MyClass {
        method() {
          OtherService.a();
          OtherService.b();
          OtherService.c();
          OtherService.d();
        }
      }
    `;
    const smells = detectFeatureEnvy(parse(src), new Set(['OtherService']));
    expect(smells.some(s => s.type === 'FeatureEnvy')).toBe(true);
  });

  it('does not flag method using own class', () => {
    const src = `
      class MyClass {
        method() {
          this.doA();
          this.doB();
          this.doC();
        }
      }
    `;
    expect(detectFeatureEnvy(parse(src), new Set(['OtherService']))).toHaveLength(0);
  });
});
```

### 2.4 Wire into orchestrator

- [ ] Edit `packages/core/src/smells/detector.ts`:
  ```typescript
  import { detectFeatureEnvy } from './feature-envy';
  // inside detectSmells() (reuse importedNames from Task 1):
  ...detectFeatureEnvy(tree.rootNode, importedNames),
  ```

---

## Task 3 — Maintainability Index (MI)

### 3.1 Algorithm

**Microsoft formula** (from Microsoft Learn "Code metrics — Maintainability index range"):

```
MI = MAX(0, (171 − 5.2×ln(HV) − 0.23×CC − 16.2×ln(LOC)) × 100/171)
```

Where:
- `HV` = Halstead Volume = `N × log2(n)`, where `N` = total operators+operands, `n` = distinct operators+operands
- `CC` = average cyclomatic complexity of all functions in the file
- `LOC` = source lines of code (non-blank, non-comment)

**Smell threshold:** MI < 40 = `low` severity. MI < 20 = `medium` severity. (These thresholds are derived from Microsoft's Green/Yellow/Red 20/10 scale, scaled for our 0–100 output.)

**Halstead token classification for TypeScript:**
- Operators: keywords (`if`, `for`, `while`, `return`, etc.), operators (`+`, `-`, `*`, `=`, `&&`, etc.), punctuation (`,`, `;`, `.`)
- Operands: identifiers, literals (numbers, strings, booleans)

### 3.2 Implementation

- [ ] Create `packages/core/src/metrics/maintainability.ts`:

```typescript
import type { SyntaxNode } from 'tree-sitter';

const OPERATOR_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'void', 'await', 'yield',
]);

const OPERATOR_TYPES = new Set([
  'binary_expression', 'unary_expression', 'assignment_expression',
  'augmented_assignment_expression', 'ternary_expression', 'logical_expression',
  'update_expression', 'spread_element',
]);

const OPERAND_TYPES = new Set([
  'identifier', 'number', 'string', 'template_string', 'true', 'false', 'null', 'undefined',
]);

export interface HalsteadMetrics {
  n1: number;  // distinct operators
  n2: number;  // distinct operands
  N1: number;  // total operators
  N2: number;  // total operands
  volume: number;
  difficulty: number;
  effort: number;
}

export interface MaintainabilityResult {
  index: number;  // 0–100
  halstead: HalsteadMetrics;
}

export function computeMaintainability(
  tree: SyntaxNode,
  avgCyclomaticComplexity: number,
  linesOfCode: number,
): MaintainabilityResult {
  const halstead = computeHalstead(tree);
  const hv = halstead.volume;
  const cc = Math.max(1, avgCyclomaticComplexity);
  const loc = Math.max(1, linesOfCode);
  const raw = 171 - 5.2 * Math.log(hv) - 0.23 * cc - 16.2 * Math.log(loc);
  const index = Math.max(0, Math.round((raw * 100) / 171));
  return { index, halstead };
}

function computeHalstead(tree: SyntaxNode): HalsteadMetrics {
  const operators = { distinct: new Set<string>(), total: 0 };
  const operands = { distinct: new Set<string>(), total: 0 };
  walkTokens(tree, operators, operands);

  const n1 = operators.distinct.size;
  const n2 = operands.distinct.size;
  const N1 = operators.total;
  const N2 = operands.total;
  const vocab = n1 + n2;
  const length = N1 + N2;
  const volume = vocab > 0 ? length * Math.log2(vocab) : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  const effort = volume * difficulty;

  return { n1, n2, N1, N2, volume, difficulty, effort };
}

function walkTokens(
  node: SyntaxNode,
  ops: { distinct: Set<string>; total: number },
  opds: { distinct: Set<string>; total: number },
): void {
  if (node.childCount === 0) {
    const text = node.text.trim();
    if (!text) return;
    if (OPERATOR_KEYWORDS.has(text) || OPERATOR_TYPES.has(node.parent?.type ?? '')) {
      ops.distinct.add(text);
      ops.total++;
    } else if (OPERAND_TYPES.has(node.type)) {
      opds.distinct.add(text);
      opds.total++;
    }
  }
  for (const child of node.children) walkTokens(child, ops, opds);
}
```

### 3.3 Integrate into core analyzer

- [ ] Edit `packages/core/src/index.ts` — compute MI and add `LowMaintainability` smell:

```typescript
import { computeMaintainability } from './metrics/maintainability';

// Inside buildFileResult() after computing metrics:
const avgCC = metrics.functions.length > 0
  ? metrics.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0) / metrics.functions.length
  : 1;
const mi = computeMaintainability(tree.rootNode, avgCC, metrics.linesOfCode);
// Expose on result
result.maintainabilityIndex = mi.index;

// Add smell if low:
if (mi.index < 40) {
  result.smells.push({
    type: 'LowMaintainability',
    severity: mi.index < 20 ? 'medium' : 'low',
    description: `Maintainability Index is ${mi.index}/100 — this file is hard to maintain (Halstead Volume=${Math.round(mi.halstead.volume)}, CC=${Math.round(avgCC)}).`,
    suggestion: 'Reduce file complexity: extract functions, simplify logic, reduce cyclomatic complexity.',
  });
}
```

- [ ] Add `maintainabilityIndex?: number` to `HealthResult` in `packages/core/src/types.ts`.

### 3.4 Tests

- [ ] Create `packages/core/tests/metrics/maintainability.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { computeMaintainability } from '../../src/metrics/maintainability';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('MaintainabilityIndex', () => {
  it('returns 100 for trivially simple code', () => {
    const result = computeMaintainability(parse('const x = 1;'), 1, 1);
    expect(result.index).toBeGreaterThan(80);
  });

  it('returns lower score for complex code', () => {
    const complex = parse(`
      function f(a: number, b: number, c: number, d: number) {
        if (a > 0) { for (let i = 0; i < b; i++) { if (c > d) { return a + b + c + d; } } }
        if (b > 0) { while (c > 0) { c--; } }
        return a * b * c * d + a - b + c - d;
      }
    `);
    const simple = parse('const x = 1;');
    const complexResult = computeMaintainability(complex, 5, 8);
    const simpleResult = computeMaintainability(simple, 1, 1);
    expect(complexResult.index).toBeLessThan(simpleResult.index);
  });

  it('halstead volume is positive for non-trivial code', () => {
    const tree = parse('function f(x: number) { return x + 1; }');
    const result = computeMaintainability(tree, 1, 1);
    expect(result.halstead.volume).toBeGreaterThan(0);
  });

  it('index is clamped to 0–100', () => {
    const tree = parse('const x = 1;');
    const result = computeMaintainability(tree, 1, 1);
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(100);
  });
});
```

---

## Task 4 — Re-baseline own codebase

- [ ] Run `pnpm test` — all tests pass (≥265 tests total).
- [ ] Wire `detectGodClass` and `detectFeatureEnvy` into the `detector.ts` orchestrator (add `importedNames` extraction helper).
- [ ] Run MCP analyze on our own codebase — confirm no false-positive GodClass or FeatureEnvy on our clean files.
- [ ] Verify `maintainabilityIndex` appears in the JSON output of `code_health_review`.
- [ ] Add entry to `CHANGELOG.md`: "Sprint 9: GodClass, FeatureEnvy, MaintainabilityIndex."

---

## Biomarker Scorecard After Sprint 9

| # | Biomarker | Sprint | Source |
|---|-----------|--------|--------|
| 1–20 | (see Sprint 8 scorecard) | 1–8 | — |
| 21 | **GodClass** | **Sprint 9** | Lanza & Marinescu "OO Metrics in Practice" |
| 22 | **FeatureEnvy** | **Sprint 9** | Fowler / JMove algorithm (F1=88.68 %) |
| 23 | **LowMaintainability (MI)** | **Sprint 9** | Microsoft / Halstead 1977 / Radon |

**Composite bonus:** `maintainabilityIndex` also computes Halstead Volume, Difficulty, and Effort as sub-metrics available in the JSON output for external tooling.

**Remaining gap to CodeScene 26: 3 biomarkers → covered by Sprint 10**
