# Sprint 5: TypeScript-specific Smells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four highest-impact gaps in our current scorer by adding TypeScript-specific smells aligned with 2026 industry standards. After this sprint, our `code_health_score` will detect Cognitive Complexity (SonarSource S3776), `any`/`@ts-ignore` escape hatches, Magic Numbers, and JSDoc coverage on exported symbols — moving us from "6 structural rules" to "a scorer that flags the defects an AI-coding assistant actually trips on."

**Background:** Adam Tornhill et al.'s peer-reviewed January-2026 paper (arXiv:2601.02200) demonstrates that human-friendly Code Health correlates with semantic preservation after AI refactoring. CodeScene's productified CodeHealth MCP Server already covers 25+ biomarkers; we cover 6. This sprint targets the four TypeScript-relevant biomarkers with the strongest evidence base for AI readiness.

**Architecture:** Each new smell is implemented as a focused detector in `packages/core/src/smells/` (one file per smell family) that consumes the existing `FunctionResult[]` / `MetricBreakdown` plus a new lightweight AST hand-off from `analyzers/typescript.ts`. The scoring weights in `packages/core/src/scoring/weights.ts` get four new entries. New smell types are added to the `SmellType` union in `types.ts`. No breaking changes to public API.

**Tech Stack:** TypeScript 5.x, tree-sitter 0.21, tree-sitter-typescript, Vitest, pnpm workspaces

**Estimated effort:** 1–2 days (4 tasks, ~6 hours per task)

---

## Prerequisites (verify before starting)

- [ ] Sprint 4 is merged and green; all 258 tests pass: `pnpm -r run test` from repo root.
- [ ] `packages/core/src/smells/detector.ts` exists and exports `detectSmells`.
- [ ] `packages/core/src/types.ts` exports the `SmellType` union and the `Smell` interface.
- [ ] `packages/core/src/scoring/weights.ts` exists with the current 6-smell weight map.
- [ ] Confirm git working tree is clean: `git status` returns no unstaged changes.

---

## Task 1 — Cognitive Complexity (SonarSource S3776)

**Reference:** [rules.sonarsource.com/typescript/rspec-3776](https://rules.sonarsource.com/typescript/rspec-3776/) — exact algorithm specification.

### 1.1 Specify the algorithm

The SonarSource rule increments cognitive complexity by three mechanisms:

1. **+1 for each break in linear control flow**: `if`, `else if`, `ternary`, `switch`, `for`, `for...of`, `for...in`, `while`, `do...while`, `catch`, labeled `break`/`continue`.
2. **+nesting-level when nested inside another control structure**: each level deep adds +nesting on top of the base +1. (E.g. an `if` inside a `for` inside a `while` = 1 + 1 (nesting 1) + 1 + 2 (nesting 2) + 1 + 3 (nesting 3) = ... — see the rule's worked example.)
3. **+1 per logical-operator sequence transition**: each switch from `&&` to `||` (or vice versa) in a chain counts +1, but repeated identical operators count once.
4. **+1 for recursion** (function calls itself by name) — regardless of nesting.
5. **Does NOT count**: standalone `else`, method declarations themselves, `null`-coalescing operators within type narrowing.

Default threshold: **15** (SonarQube default). Severity: `medium` for 15–24, `high` for 25+.

### 1.2 Add the new smell type

- [ ] Edit `packages/core/src/types.ts` — add `'CognitiveComplexity'` to the `SmellType` union:

```typescript
export type SmellType =
  | 'ComplexMethod'
  | 'CognitiveComplexity'   // NEW
  | 'DeepNesting'
  | 'BumpyRoad'
  | 'LargeMethod'
  | 'ComplexConditional'
  | 'LongParameterList'
  | 'LargeFile';
```

- [ ] Add `cognitiveComplexity: number` to the `FunctionResult` interface (replacing or supplementing the existing `cyclomaticComplexity`):

```typescript
export interface FunctionResult {
  name: string;
  line: number;
  length: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;     // NEW (already exists in MetricBreakdown as placeholder)
  nestingDepth: number;
  parameterCount: number;
  smells: Smell[];
}
```

### 1.3 Write failing tests (TDD red phase)

- [ ] Create `packages/core/tests/smells/cognitive-complexity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeTypeScript } from '../../src/analyzers/typescript';

describe('cognitive complexity', () => {
  it('linear code has cognitive complexity 0', () => {
    const code = `
      function add(a: number, b: number): number {
        return a + b;
      }
    `;
    const result = analyzeTypeScript(code);
    expect(result.functions[0].cognitiveComplexity).toBe(0);
  });

  it('single if adds +1', () => {
    const code = `
      function f(x: number): number {
        if (x > 0) return 1;
        return 0;
      }
    `;
    expect(analyzeTypeScript(code).functions[0].cognitiveComplexity).toBe(1);
  });

  it('nested if adds +1 +2 (base + nesting level 1)', () => {
    const code = `
      function f(x: number, y: number): number {
        if (x > 0) {           // +1
          if (y > 0) {         // +2 (base + nesting 1)
            return 1;
          }
        }
        return 0;
      }
    `;
    expect(analyzeTypeScript(code).functions[0].cognitiveComplexity).toBe(3);
  });

  it('chained && counts once, && to || transition adds +1', () => {
    const code = `
      function f(a: boolean, b: boolean, c: boolean, d: boolean): boolean {
        return a && b && c || d;  // +1 for &&-chain, +1 for transition to ||
      }
    `;
    expect(analyzeTypeScript(code).functions[0].cognitiveComplexity).toBe(2);
  });

  it('recursion adds +1 regardless of nesting', () => {
    const code = `
      function fact(n: number): number {
        if (n <= 1) return 1;       // +1
        return n * fact(n - 1);     // +1 recursion
      }
    `;
    expect(analyzeTypeScript(code).functions[0].cognitiveComplexity).toBe(2);
  });

  it('triggers CognitiveComplexity smell when > 15', () => {
    // 16-branch nested-if pyramid
    const code = `function f(x: number): number {\n` +
      Array.from({ length: 16 }, (_, i) => `  if (x === ${i}) return ${i};`).join('\n') +
      `\n  return -1;\n}`;
    const result = analyzeTypeScript(code);
    expect(result.functions[0].cognitiveComplexity).toBeGreaterThan(15);
  });
});
```

- [ ] Run: `pnpm --filter @healthy-ai-code/core test cognitive-complexity` — expect **6 failing tests** (red phase).

### 1.4 Implement the cognitive-complexity calculator

- [ ] Create `packages/core/src/analyzers/cognitive-complexity.ts`:

```typescript
import Parser from 'tree-sitter';

const NESTING_INCREMENTS = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
]);

const FLAT_INCREMENTS = new Set([
  'switch_statement',
  'break_statement',     // only when labeled
  'continue_statement',  // only when labeled
]);

export function calculateCognitiveComplexity(
  functionNode: Parser.SyntaxNode,
  functionName: string,
): number {
  let complexity = 0;

  function visit(node: Parser.SyntaxNode, nesting: number): void {
    let nestingIncrement = 0;

    if (NESTING_INCREMENTS.has(node.type)) {
      complexity += 1 + nesting;
      nestingIncrement = 1;
    } else if (node.type === 'switch_statement') {
      complexity += 1 + nesting;
      nestingIncrement = 1;
    } else if (isLabeledJump(node)) {
      complexity += 1;
    } else if (node.type === 'binary_expression' && isBooleanOperator(node)) {
      complexity += countOperatorTransitions(node);
    } else if (isRecursiveCall(node, functionName)) {
      complexity += 1;
    }

    for (const child of node.children) {
      visit(child, nesting + nestingIncrement);
    }
  }

  visit(functionNode, 0);
  return complexity;
}

function isBooleanOperator(node: Parser.SyntaxNode): boolean {
  const op = node.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

function isLabeledJump(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'break_statement' && node.type !== 'continue_statement') return false;
  return node.namedChildren.some(c => c.type === 'statement_identifier');
}

function isRecursiveCall(node: Parser.SyntaxNode, functionName: string): boolean {
  if (node.type !== 'call_expression') return false;
  const callee = node.childForFieldName('function')?.text;
  return callee === functionName;
}

function countOperatorTransitions(root: Parser.SyntaxNode): number {
  // Walk the boolean-operator tree, return 1 per distinct operator group.
  const ops: string[] = [];
  function collect(n: Parser.SyntaxNode): void {
    if (n.type === 'binary_expression' && isBooleanOperator(n)) {
      const op = n.childForFieldName('operator')!.text;
      ops.push(op);
      for (const child of n.children) collect(child);
    }
  }
  collect(root);

  let groups = 0;
  let prev = '';
  for (const op of ops) {
    if (op !== prev) {
      groups++;
      prev = op;
    }
  }
  return groups;
}
```

- [ ] Wire the calculator into `packages/core/src/analyzers/typescript.ts` — replace the existing `cognitiveComplexity: 0` placeholder in `extractFunction`:

```typescript
import { calculateCognitiveComplexity } from './cognitive-complexity';

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const name = getFunctionName(node);
  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: calculateCyclomaticComplexity(node),
    cognitiveComplexity: calculateCognitiveComplexity(node, name),    // NEW
    nestingDepth: calculateMaxNestingDepth(node),
    parameterCount: getParameterCount(node),
    smells: [],
  };
}
```

- [ ] Run tests: `pnpm --filter @healthy-ai-code/core test cognitive-complexity` — expect **6 passing tests** (green phase).

### 1.5 Add the detector

- [ ] Edit `packages/core/src/smells/detector.ts` — add to `detectFunctionSmells`:

```typescript
const COGNITIVE_COMPLEXITY_THRESHOLD = 15;
const CRITICAL_COGNITIVE_THRESHOLD = 25;

function detectCognitiveComplexity(fn: FunctionResult): Smell | null {
  if (fn.cognitiveComplexity <= COGNITIVE_COMPLEXITY_THRESHOLD) return null;
  return {
    type: 'CognitiveComplexity',
    severity: fn.cognitiveComplexity > CRITICAL_COGNITIVE_THRESHOLD ? 'high' : 'medium',
    functionName: fn.name,
    line: fn.line,
    description: `'${fn.name}' har kognitiv komplexitet ${fn.cognitiveComplexity} (gräns: ${COGNITIVE_COMPLEXITY_THRESHOLD})`,
    suggestion: `Förenkla kontrollflödet i '${fn.name}' med early returns och hjälpfunktioner`,
  };
}
```

Add `detectCognitiveComplexity(fn)` to the `out.push(...)` chain in `detectFunctionSmells`.

### 1.6 Add scoring weight

- [ ] Edit `packages/core/src/scoring/weights.ts` — add:

```typescript
CognitiveComplexity: { medium: 0.6, high: 1.2, critical: 2.5 },
```

(Weights chosen 20% above `ComplexMethod` because cognitive complexity correlates more strongly with maintainability than cyclomatic per SonarSource research.)

### 1.7 Commit

```bash
git add packages/core/src/types.ts \
        packages/core/src/analyzers/cognitive-complexity.ts \
        packages/core/src/analyzers/typescript.ts \
        packages/core/src/smells/detector.ts \
        packages/core/src/scoring/weights.ts \
        packages/core/tests/smells/cognitive-complexity.test.ts
git commit -m "feat(core): add cognitive-complexity detection per SonarSource S3776"
```

### 1.8 Acceptance criteria

- [ ] All existing 258 tests still pass.
- [ ] 6 new cognitive-complexity tests pass.
- [ ] `code_health_score` on a file with cognitive complexity 16 returns a `CognitiveComplexity` smell with severity `medium`.
- [ ] `code_health_score` on the four refactored analyzer files (`typescript.ts`, `python.ts`, `java.ts`, `csharp.ts`) still returns ≥9.6 (no false positives on our own well-structured code).

---

## Task 2 — `any` / `@ts-ignore` Detector

**Reference:** TypeScript 5.8 strict mode makes `useUnknownInCatchVariables` default; explicit `any` and `@ts-ignore` are the two main escape hatches that defeat type safety.

### 2.1 Specify what to detect

| Pattern | Smell severity | Notes |
|---------|----------------|-------|
| Explicit `: any` annotation on parameter, variable, return type, or property | medium | `function f(x: any)`, `let x: any`, `const fn = (): any => …` |
| `as any` type assertion | medium | `result as any` |
| `<any>` generic argument | medium | `Array<any>`, `Promise<any>` |
| `// @ts-ignore` line comment | high | suppressing one line of type-check |
| `// @ts-expect-error` line comment | low | acceptable when paired with an expected error |
| `// @ts-nocheck` file-level directive | critical | disables type-check for the entire file |
| Implicit `any` in catch variable (`catch (e)` with `useUnknownInCatchVariables` off) | low | TS 5.8 default makes this auto-correct |

New smell type: `TypeSafetyEscape`.

### 2.2 Add the new smell type

- [ ] Edit `packages/core/src/types.ts`:

```typescript
export type SmellType =
  | …
  | 'TypeSafetyEscape';   // NEW
```

### 2.3 Write failing tests

- [ ] Create `packages/core/tests/smells/type-safety-escape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';

describe('TypeSafetyEscape detection', () => {
  it('detects explicit `: any` parameter', () => {
    const code = `function f(x: any): number { return 1; }`;
    const result = analyzeCode(code, 'typescript');
    expect(result.smells.some(s => s.type === 'TypeSafetyEscape')).toBe(true);
  });

  it('detects `as any` cast', () => {
    const code = `const x = (1 as any);`;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'TypeSafetyEscape')).toBe(true);
  });

  it('detects `@ts-ignore` with severity high', () => {
    const code = `// @ts-ignore\nconst x: number = 'hi';`;
    const smell = analyzeCode(code, 'typescript').smells.find(s => s.type === 'TypeSafetyEscape');
    expect(smell?.severity).toBe('high');
  });

  it('detects `@ts-nocheck` with severity critical', () => {
    const code = `// @ts-nocheck\nconst x: number = 'hi';`;
    const smell = analyzeCode(code, 'typescript').smells.find(s => s.type === 'TypeSafetyEscape');
    expect(smell?.severity).toBe('critical');
  });

  it('@ts-expect-error has severity low (acceptable)', () => {
    const code = `// @ts-expect-error - intentional\nconst x: number = 'hi';`;
    const smell = analyzeCode(code, 'typescript').smells.find(s => s.type === 'TypeSafetyEscape');
    expect(smell?.severity).toBe('low');
  });

  it('does NOT flag clean code', () => {
    const code = `function f(x: number): number { return x + 1; }`;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'TypeSafetyEscape')).toBe(false);
  });
});
```

- [ ] Run: expect 6 failing.

### 2.4 Implement the detector

- [ ] Create `packages/core/src/smells/type-safety-escape.ts`:

```typescript
import Parser from 'tree-sitter';
import type { Smell } from '../types';

const COMMENT_PATTERNS: Array<{ regex: RegExp; severity: Smell['severity']; suggestion: string }> = [
  { regex: /@ts-nocheck/, severity: 'critical', suggestion: 'Ta bort @ts-nocheck och fixa typfelen' },
  { regex: /@ts-ignore/, severity: 'high', suggestion: 'Ersätt @ts-ignore med korrekt typning eller @ts-expect-error' },
  { regex: /@ts-expect-error/, severity: 'low' as const, suggestion: 'OK när den parar med ett förväntat fel; överväg att lösa felet' },
];

export function detectTypeSafetyEscapes(root: Parser.SyntaxNode, source: string): Smell[] {
  const smells: Smell[] = [];
  collectCommentDirectives(source, smells);
  walkForAnyUsage(root, smells);
  return smells;
}

function collectCommentDirectives(source: string, smells: Smell[]): void {
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    for (const { regex, severity, suggestion } of COMMENT_PATTERNS) {
      if (regex.test(line)) {
        smells.push({
          type: 'TypeSafetyEscape',
          severity,
          line: idx + 1,
          description: `Type-safety escape: ${line.trim()}`,
          suggestion,
        });
      }
    }
  });
}

function walkForAnyUsage(node: Parser.SyntaxNode, smells: Smell[]): void {
  if (node.type === 'any' || (node.type === 'predefined_type' && node.text === 'any')) {
    smells.push({
      type: 'TypeSafetyEscape',
      severity: 'medium',
      line: node.startPosition.row + 1,
      description: `Användning av 'any' på rad ${node.startPosition.row + 1}`,
      suggestion: "Ersätt 'any' med 'unknown' eller en specifik typ",
    });
  }
  for (const child of node.children) walkForAnyUsage(child, smells);
}
```

- [ ] Wire into `packages/core/src/analyzers/typescript.ts` — make `analyzeTypeScript` return type-safety smells in the `smells` array (currently typed `never[]`):

```typescript
import { detectTypeSafetyEscapes } from '../smells/type-safety-escape';

export function analyzeTypeScript(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const functions = collectFunctions(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  const smells = detectTypeSafetyEscapes(tree.rootNode, code);
  return { functions, metrics, smells };
}
```

- [ ] Update the `analyzeByLanguage` return type in `analyzers/index.ts` — change `smells: never[]` to `smells: Smell[]`.

- [ ] Update `analyzeCode` in `packages/core/src/index.ts` to merge `parsed.smells` into the final smell list:

```typescript
const smells = [...parsed.smells, ...detectSmells(parsed.functions, parsed.metrics)];
```

### 2.5 Add `low` severity to the type system

The current `Smell['severity']` is `'critical' | 'high' | 'medium'`. Add `'low'`:

- [ ] Edit `packages/core/src/types.ts`:

```typescript
severity: 'critical' | 'high' | 'medium' | 'low';
```

- [ ] Update `packages/core/src/scoring/scorer.ts` to weight `low: 0.1`.

### 2.6 Add scoring weights

- [ ] Edit `weights.ts`:

```typescript
TypeSafetyEscape: { low: 0.1, medium: 0.5, high: 1.5, critical: 3.0 },
```

### 2.7 Commit

```bash
git add packages/core/src/types.ts \
        packages/core/src/smells/type-safety-escape.ts \
        packages/core/src/analyzers/typescript.ts \
        packages/core/src/analyzers/index.ts \
        packages/core/src/index.ts \
        packages/core/src/scoring/scorer.ts \
        packages/core/src/scoring/weights.ts \
        packages/core/tests/smells/type-safety-escape.test.ts
git commit -m "feat(core): detect any-types and ts-ignore as TypeSafetyEscape smell"
```

### 2.8 Acceptance criteria

- [ ] All existing tests still pass.
- [ ] 6 new type-safety tests pass.
- [ ] Running `code_health_score` on our own `pre-commit-safeguard.ts` (which has `error: any`) returns a `TypeSafetyEscape` smell.
- [ ] Running `code_health_score` on `analyze-change-set.ts` (which has `// @ts-ignore`) returns a `TypeSafetyEscape` smell with severity `high`.

---

## Task 3 — Magic Number Detector

**Reference:** Refactoring Guru / SonarQube common smell. Magic numbers obscure intent; named constants restore it.

### 3.1 Specify what counts as "magic"

A numeric literal is **magic** unless one of these exemption conditions holds:

| Exemption | Example |
|-----------|---------|
| Value is in `ALLOWED_LITERALS` (0, 1, -1, 2, 100) | `arr.length - 1` |
| Literal appears in a `const` declarator at file/module top level | `const TIMEOUT = 5000;` |
| Literal is part of an array index access for a tuple type | `tuple[0]` |
| Literal is the right-hand side of an enum value | `MyEnum.A = 0` |
| Literal is in a test file (`*.test.ts`, `*.spec.ts`) | test fixtures may use arbitrary numbers |

Threshold: **3 or more magic numbers in one function** → smell. Severity `medium`.

### 3.2 Add smell type & tests

- [ ] Add `'MagicNumber'` to `SmellType` union.

- [ ] Create `packages/core/tests/smells/magic-number.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';

describe('MagicNumber detection', () => {
  it('flags 3+ magic numbers in one function', () => {
    const code = `
      function calc(x: number): number {
        const a = x * 17;
        const b = a + 42;
        const c = b - 999;
        return c;
      }
    `;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'MagicNumber')).toBe(true);
  });

  it('does NOT flag 0, 1, -1, 2, 100', () => {
    const code = `
      function f(x: number): number {
        if (x === 0) return 1;
        if (x === -1) return 2;
        return 100;
      }
    `;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'MagicNumber')).toBe(false);
  });

  it('does NOT flag numbers in top-level const declarations', () => {
    const code = `
      const TIMEOUT_MS = 5000;
      const RETRY_LIMIT = 3;
      const BACKOFF_FACTOR = 17;
    `;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'MagicNumber')).toBe(false);
  });

  it('does NOT flag in test files', () => {
    const code = `expect(result).toBe(42); expect(arr).toHaveLength(17); expect(x).toEqual(999);`;
    expect(analyzeCode(code, 'typescript', '/path/to/foo.test.ts').smells.some(s => s.type === 'MagicNumber')).toBe(false);
  });
});
```

### 3.3 Implement

- [ ] Create `packages/core/src/smells/magic-number.ts`:

```typescript
import Parser from 'tree-sitter';
import type { Smell } from '../types';

const ALLOWED_LITERALS = new Set(['0', '1', '-1', '2', '100']);
const MIN_MAGIC_PER_FUNCTION = 3;

export function detectMagicNumbers(root: Parser.SyntaxNode, filePath: string): Smell[] {
  if (isTestFile(filePath)) return [];

  const smells: Smell[] = [];
  const perFunctionCount = new Map<string, { count: number; line: number; name: string }>();

  function visit(node: Parser.SyntaxNode, currentFn: string | null, fnLine: number): void {
    if (isFunctionNode(node)) {
      const name = getFunctionName(node);
      const fnStartLine = node.startPosition.row + 1;
      for (const child of node.children) visit(child, name, fnStartLine);
      return;
    }

    if (node.type === 'number' && isMagic(node) && currentFn) {
      const entry = perFunctionCount.get(currentFn) ?? { count: 0, line: fnLine, name: currentFn };
      entry.count++;
      perFunctionCount.set(currentFn, entry);
    }

    for (const child of node.children) visit(child, currentFn, fnLine);
  }

  visit(root, null, 0);

  for (const { count, line, name } of perFunctionCount.values()) {
    if (count >= MIN_MAGIC_PER_FUNCTION) {
      smells.push({
        type: 'MagicNumber',
        severity: 'medium',
        functionName: name,
        line,
        description: `'${name}' innehåller ${count} magiska tal`,
        suggestion: `Extrahera tal i '${name}' till namngivna konstanter`,
      });
    }
  }
  return smells;
}

function isMagic(node: Parser.SyntaxNode): boolean {
  if (ALLOWED_LITERALS.has(node.text)) return false;
  if (isInsideConstDeclarator(node)) return false;
  if (isEnumValue(node)) return false;
  return true;
}

function isInsideConstDeclarator(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node.parent;
  while (current) {
    if (current.type === 'variable_declarator' && current.parent?.type === 'lexical_declaration') {
      const kind = current.parent.children.find(c => c.type === 'const');
      if (kind) return true;
    }
    if (isFunctionNode(current)) return false;
    current = current.parent;
  }
  return false;
}

function isEnumValue(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === 'enum_assignment';
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

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}
```

- [ ] Wire into `analyzeTypeScript` (pass `filePath` argument through — requires updating the analyzer signature).

### 3.4 Pass filePath through analyzer chain

- [ ] Update `packages/core/src/analyzers/typescript.ts` to accept optional `filePath`:

```typescript
export function analyzeTypeScript(code: string, filePath = '<inline>') { … }
```

- [ ] Update `analyzeByLanguage` and `analyzeCode` to forward `filePath`.

### 3.5 Add scoring weight

```typescript
MagicNumber: { medium: 0.4 },
```

### 3.6 Commit

```bash
git add ...
git commit -m "feat(core): detect magic numbers (3+ per function) outside const/enum/tests"
```

### 3.7 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 4 new magic-number tests pass.
- [ ] Running on our own `scoring/weights.ts` returns no magic-number smell (constants are named).
- [ ] Running on a deliberate fixture with `x * 17 + 42 - 999` returns a MagicNumber smell.

---

## Task 4 — JSDoc Coverage Ratio for Exported Symbols

**Reference:** Maintainability Index includes a `sin(√2.4·C)` term for comment ratio; Atlassian's arXiv:2501.11264 shows LLM agents benefit from documented APIs.

### 4.1 Specify what counts

- **Exported symbol**: any AST node that is part of a top-level `export` declaration — function, class, const, type, interface.
- **Has JSDoc**: a `/** … */` block comment ends on the line immediately preceding the export (allowing zero blank lines).
- **Coverage**: `documented_exports / total_exports`.
- **Thresholds**:
  - `≥ 80 %` → no smell.
  - `50–79 %` → smell severity `low`.
  - `< 50 %` → smell severity `medium`.
- Files with fewer than 2 exports are exempt.

### 4.2 Add smell type & tests

- [ ] Add `'LowDocCoverage'` to `SmellType`.

- [ ] Create `packages/core/tests/smells/low-doc-coverage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';

describe('LowDocCoverage detection', () => {
  it('100% documented exports — no smell', () => {
    const code = `
      /** Adds two numbers */
      export function add(a: number, b: number): number { return a + b; }
      /** Subtracts */
      export function sub(a: number, b: number): number { return a - b; }
    `;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'LowDocCoverage')).toBe(false);
  });

  it('< 50% documented — medium severity', () => {
    const code = `
      /** Documented */
      export function a(): void {}
      export function b(): void {}
      export function c(): void {}
    `;
    const smell = analyzeCode(code, 'typescript').smells.find(s => s.type === 'LowDocCoverage');
    expect(smell?.severity).toBe('medium');
  });

  it('50–79% documented — low severity', () => {
    const code = `
      /** Doc */
      export function a(): void {}
      /** Doc */
      export function b(): void {}
      export function c(): void {}
    `;
    const smell = analyzeCode(code, 'typescript').smells.find(s => s.type === 'LowDocCoverage');
    expect(smell?.severity).toBe('low');
  });

  it('< 2 exports — exempt', () => {
    const code = `export function only(): void {}`;
    expect(analyzeCode(code, 'typescript').smells.some(s => s.type === 'LowDocCoverage')).toBe(false);
  });
});
```

### 4.3 Implement

- [ ] Create `packages/core/src/smells/doc-coverage.ts`:

```typescript
import Parser from 'tree-sitter';
import type { Smell } from '../types';

const MIN_EXPORTS_FOR_CHECK = 2;
const HIGH_COVERAGE_THRESHOLD = 0.8;
const MEDIUM_COVERAGE_THRESHOLD = 0.5;

interface ExportInfo {
  name: string;
  line: number;
  hasJsDoc: boolean;
}

export function detectLowDocCoverage(root: Parser.SyntaxNode, source: string): Smell[] {
  const exports = collectExports(root, source);
  if (exports.length < MIN_EXPORTS_FOR_CHECK) return [];

  const documented = exports.filter(e => e.hasJsDoc).length;
  const ratio = documented / exports.length;

  if (ratio >= HIGH_COVERAGE_THRESHOLD) return [];

  const severity: Smell['severity'] = ratio < MEDIUM_COVERAGE_THRESHOLD ? 'medium' : 'low';
  return [{
    type: 'LowDocCoverage',
    severity,
    line: 1,
    description: `Endast ${documented}/${exports.length} exporterade symboler har JSDoc (${Math.round(ratio * 100)} %)`,
    suggestion: 'Lägg till /** … */ ovanför exporterade funktioner och typer',
  }];
}

function collectExports(root: Parser.SyntaxNode, source: string): ExportInfo[] {
  const lines = source.split('\n');
  const exports: ExportInfo[] = [];

  function visit(node: Parser.SyntaxNode): void {
    if (isExportStatement(node)) {
      const name = getExportedName(node) ?? '<anonymous>';
      const line = node.startPosition.row + 1;
      const hasJsDoc = lineAboveIsJsDocEnd(lines, line);
      exports.push({ name, line, hasJsDoc });
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return exports;
}

function isExportStatement(node: Parser.SyntaxNode): boolean {
  return node.type === 'export_statement';
}

function getExportedName(node: Parser.SyntaxNode): string | null {
  // Drill into the declaration the export wraps.
  const decl = node.children.find(c => /declaration$/.test(c.type) || c.type === 'lexical_declaration');
  if (!decl) return null;
  const named = decl.childForFieldName('name');
  return named?.text ?? null;
}

function lineAboveIsJsDocEnd(lines: string[], exportLine: number): boolean {
  // exportLine is 1-indexed; the line above is lines[exportLine - 2].
  for (let i = exportLine - 2; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') continue;             // skip blank lines
    return line.endsWith('*/');            // JSDoc must end immediately above
  }
  return false;
}
```

- [ ] Wire into `analyzeTypeScript` alongside the other smells.

### 4.4 Add scoring weight

```typescript
LowDocCoverage: { low: 0.2, medium: 0.5 },
```

### 4.5 Commit

```bash
git commit -m "feat(core): measure JSDoc coverage ratio for exported symbols"
```

### 4.6 Acceptance criteria

- [ ] All existing tests pass.
- [ ] 4 new doc-coverage tests pass.
- [ ] Running on `packages/core/src/index.ts` (which has JSDoc on `analyzeFile` and `analyzeCode`) shows ≥80 % coverage — no smell.
- [ ] Running on `packages/mcp-server/src/tools/refactoring-business-case.ts` (no JSDoc at all) shows a `LowDocCoverage` smell with severity `medium`.

---

## Task 5 — Re-baseline our own codebase

After all four detectors land, the scoring of our own code will change. Re-baseline and document the new floor.

### 5.1 Run the new scorer on all 23 source files

- [ ] Run via the MCP server (in your IDE):

```
code_health_review on every source file
```

- [ ] Record the new scores in a baseline doc: `docs/sprints/2026-05-11-sprint-5-baseline-after.md` with a Markdown table (file path, before score, after score, smells added).

### 5.2 Fix any new regressions in our own code

- [ ] `pre-commit-safeguard.ts` — change `error: any` to `error: unknown` with narrowing.
- [ ] `refactoring-business-case.ts` — same.
- [ ] `analyze-change-set.ts` — same; consider removing `// @ts-ignore` by fixing the underlying type issue or replacing with `// @ts-expect-error`.
- [ ] Add JSDoc to exported `register*` functions in all `tools/*.ts` files.
- [ ] Magic numbers: re-check `pre-commit-safeguard.ts` (7.0, 9.5) and `refactoring-business-case.ts` (already named in our previous refactor).
- [ ] Re-run scorer; confirm all 23 files ≥9.0.

### 5.3 Commit

```bash
git commit -m "chore(core): remediate type-safety escapes and missing JSDoc surfaced by sprint 5"
```

---

## Definition of Done

- [ ] All 4 new smell types are implemented, tested, weighted, and wired through `analyzeCode`.
- [ ] Existing 258 tests still pass; 20+ new tests pass.
- [ ] Pre-existing typecheck failures (re: `tree-sitter` typings) have not increased.
- [ ] Our own codebase re-baselines at score ≥9.0 (lower than current 10/10 is expected and correct — that was a false positive).
- [ ] `docs/sprints/2026-05-11-sprint-5-baseline-after.md` documents the new baseline.
- [ ] CHANGELOG updated (or commit history serves as one).

---

## Risks / Open Questions

- **Cognitive complexity arithmetic** — the SonarSource spec has edge cases (labeled jumps inside switches, ternary inside arrow-function bodies). Add fixture-based regression tests as edge cases surface.
- **`any` from third-party types** — when an imported type defaults to `any` (e.g. `Parser.Language`-cast in our own analyzers), the AST node may not literally contain the word `any`. We will catch the explicit casts (`as unknown as Parser.Language`) but not implicit ones. Acceptable for v1.
- **JSDoc detection on default exports** — `export default function foo` is structurally different in tree-sitter; ensure `getExportedName` handles it.
- **Magic-number false positives** — if users rely heavily on bitfields (`x & 0x80`), our 3-per-function threshold may trigger. Document the option to raise threshold via configuration in a future sprint.
- **Backwards compatibility of `severity` widening** — adding `'low'` to the union is a breaking change for downstream consumers. Audit `mcp-server/src/types.ts` and the four tool files for exhaustive `switch` statements over severity.
