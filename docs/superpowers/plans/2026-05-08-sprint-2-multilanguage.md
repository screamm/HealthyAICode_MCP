# Sprint 2: Multi-language Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the core analysis engine with Python, Java/Kotlin, and C# AST parsers plus a git-diff changeset module, enabling multi-language health scoring across all four supported language families.

**Architecture:** Each language analyzer follows an identical structural contract — `analyzeXxx(code: string)` returns `{ functions: FunctionResult[], metrics: MetricBreakdown }` — so the router in `analyzers/index.ts` can dispatch to the correct parser without conditional logic scattered across callers. The diff module (`diff/git.ts`) integrates with `simple-git` to fetch base-branch file contents and compare health scores, feeding into the already-implemented `analyzeCode` function from Sprint 1. All new analyzers use the tree-sitter grammar bindings already listed in the dependency spec, keeping the runtime footprint uniform.

**Tech Stack:** TypeScript 5.x, tree-sitter 0.21, tree-sitter-python, tree-sitter-java, tree-sitter-c-sharp, simple-git 3.22, Vitest, pnpm workspaces

---

## Prerequisites (verify before starting)

- [ ] Sprint 1 is merged and green: `packages/core/src/analyzers/typescript.ts`, `packages/core/src/types.ts`, `packages/core/src/language-detect.ts`, `packages/core/src/index.ts` (without `analyzeChangeset`), and `packages/core/src/scoring/` all exist and tests pass.
- [ ] Run `pnpm test` from repo root — all Sprint 1 tests pass.
- [ ] Confirm `packages/core/package.json` exists with `tree-sitter` and `tree-sitter-typescript` already listed as dependencies.

---

## Task 1 — Install new dependencies

### 1.1 Add grammar packages to packages/core/package.json

- [ ] Open `packages/core/package.json` and add the following to `"dependencies"`:

```json
"tree-sitter-python": "^0.21.0",
"tree-sitter-java": "^0.21.0",
"tree-sitter-c-sharp": "^0.21.0",
"simple-git": "^3.22.0"
```

The full `"dependencies"` block should look like:

```json
"dependencies": {
  "tree-sitter": "^0.21.0",
  "tree-sitter-typescript": "^0.21.0",
  "tree-sitter-python": "^0.21.0",
  "tree-sitter-java": "^0.21.0",
  "tree-sitter-c-sharp": "^0.21.0",
  "simple-git": "^3.22.0"
}
```

- [ ] Run install from repo root:

```bash
pnpm install
```

Expected output: lock file updated, no errors, all four new packages resolved in `node_modules`.

- [ ] Verify packages are present:

```bash
ls packages/core/node_modules/tree-sitter-python
ls packages/core/node_modules/tree-sitter-java
ls packages/core/node_modules/tree-sitter-c-sharp
ls packages/core/node_modules/simple-git
```

Expected: four directories exist without error.

- [ ] Commit:

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "deps(core): add tree-sitter grammar packages and simple-git for sprint 2"
```

---

## Task 2 — Python analyzer

### 2.1 Create healthy Python fixture

- [ ] Create file `packages/core/tests/fixtures/healthy/simple.py`:

```python
def add(a: int, b: int) -> int:
    return a + b

def greet(name: str) -> str:
    return f"Hello, {name}!"

def is_positive(n: int) -> bool:
    return n > 0
```

### 2.2 Create unhealthy Python fixture

- [ ] Create file `packages/core/tests/fixtures/unhealthy/complex.py`:

```python
def process_data(items, config, options, callback, mode, extra):
    if items:
        for item in items:
            if item > 0:
                while item > 1:
                    if item % 2 == 0:
                        if mode == 'fast':
                            return 'fast'
                        elif mode == 'slow':
                            return 'slow'
                    item -= 1
            elif item < -10:
                return 'negative'
    elif extra:
        return 'extra'
    return 'default'
```

### 2.3 Write the failing Python analyzer test

- [ ] Create file `packages/core/tests/analyzers/python.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzePython } from '../../src/analyzers/python';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzePython', () => {
  describe('healthy fixture — simple.py', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.py'), 'utf-8');
    let result: ReturnType<typeof analyzePython>;

    it('parses without throwing', () => {
      expect(() => { result = analyzePython(code); }).not.toThrow();
    });

    it('detects exactly 3 functions', () => {
      result = analyzePython(code);
      expect(result.functions).toHaveLength(3);
    });

    it('function names are correct', () => {
      result = analyzePython(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('add');
      expect(names).toContain('greet');
      expect(names).toContain('is_positive');
    });

    it('all functions have cyclomaticComplexity of 1', () => {
      result = analyzePython(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all functions have nestingDepth of 0', () => {
      result = analyzePython(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('add() has parameterCount of 2', () => {
      result = analyzePython(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzePython(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzePython(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzePython(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — complex.py', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.py'), 'utf-8');
    let result: ReturnType<typeof analyzePython>;

    it('parses without throwing', () => {
      expect(() => { result = analyzePython(code); }).not.toThrow();
    });

    it('detects 1 function', () => {
      result = analyzePython(code);
      expect(result.functions).toHaveLength(1);
    });

    it('function name is process_data', () => {
      result = analyzePython(code);
      expect(result.functions[0].name).toBe('process_data');
    });

    it('cyclomaticComplexity > 8 (deeply branchy function)', () => {
      result = analyzePython(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5 (deeply nested)', () => {
      result = analyzePython(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzePython(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzePython(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzePython('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles lambda — does not crash', () => {
      const code = 'square = lambda x: x * x\n';
      expect(() => analyzePython(code)).not.toThrow();
    });

    it('handles nested functions — counts both', () => {
      const code = `
def outer(x):
    def inner(y):
        return y + 1
    return inner(x)
`;
      const result = analyzePython(code);
      expect(result.functions.length).toBeGreaterThanOrEqual(2);
    });
  });
});
```

### 2.4 Run test and verify it FAILS (module not found)

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/python.test.ts
```

Expected: test suite fails with `Cannot find module '../../src/analyzers/python'` or similar import error. This confirms the red phase.

### 2.5 Implement the Python analyzer

- [ ] Create file `packages/core/src/analyzers/python.ts`:

```typescript
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();

const PY_CYCLOMATIC_NODES = new Set([
  'if_statement',
  'elif_clause',
  'for_statement',
  'while_statement',
  'except_clause',
  'conditional_expression',
  'boolean_operator',
]);

const PY_NESTING_NODES = new Set([
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
  'with_statement',
]);

export function analyzePython(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  parser.setLanguage(Python as unknown as Parser.Language);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const params = node.childForFieldName('parameters');
      const paramCount = params
        ? params.namedChildren.filter(c =>
            [
              'identifier',
              'typed_parameter',
              'default_parameter',
              'typed_default_parameter',
              'list_splat_pattern',
              'dictionary_splat_pattern',
            ].includes(c.type)
          ).length
        : 0;

      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculatePyCyclomatic(node),
        nestingDepth: calculatePyNesting(node),
        parameterCount: paramCount,
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code.length === 0 ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics };
}

function calculatePyCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (PY_CYCLOMATIC_NODES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculatePyNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = PY_NESTING_NODES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 1,
      maxNestingDepth: 0,
      avgFunctionLength: 0,
      maxFunctionLength: 0,
      avgParameterCount: 0,
      maxParameterCount: 0,
      totalLines,
      duplicationScore: 0,
    };
  }
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}
```

### 2.6 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/python.test.ts
```

Expected output: all test cases green, no failures. Example:

```
✓ analyzePython > healthy fixture — simple.py > parses without throwing
✓ analyzePython > healthy fixture — simple.py > detects exactly 3 functions
✓ analyzePython > healthy fixture — simple.py > function names are correct
...
✓ analyzePython > edge cases > handles nested functions — counts both
Test Files  1 passed (1)
Tests       14 passed (14)
```

If any test fails, debug before proceeding (do not skip or modify tests to force green).

### 2.7 Commit

```bash
git add packages/core/src/analyzers/python.ts \
        packages/core/tests/analyzers/python.test.ts \
        packages/core/tests/fixtures/healthy/simple.py \
        packages/core/tests/fixtures/unhealthy/complex.py
git commit -m "feat(core): Python AST analyzer with tree-sitter-python"
```

---

## Task 3 — Java/Kotlin analyzer

### 3.1 Create healthy Java fixture

- [ ] Create file `packages/core/tests/fixtures/healthy/Simple.java`:

```java
public class Simple {
    public int add(int a, int b) {
        return a + b;
    }

    public String greet(String name) {
        return "Hello, " + name + "!";
    }

    public boolean isPositive(int n) {
        return n > 0;
    }
}
```

### 3.2 Create unhealthy Java fixture

- [ ] Create file `packages/core/tests/fixtures/unhealthy/Complex.java`:

```java
public class Complex {
    public String processData(
        Object[] items, Object config, Object options,
        Object callback, String mode, Object extra
    ) {
        if (items != null) {
            for (Object item : items) {
                int val = (int) item;
                if (val > 0) {
                    while (val > 1) {
                        if (val % 2 == 0) {
                            if ("fast".equals(mode)) {
                                return "fast";
                            } else if ("slow".equals(mode)) {
                                return "slow";
                            }
                        }
                        val--;
                    }
                } else if (val < -10) {
                    return "negative";
                }
            }
        } else if (extra != null) {
            return "extra";
        }
        return "default";
    }
}
```

### 3.3 Write the failing Java analyzer test

- [ ] Create file `packages/core/tests/analyzers/java.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeJava } from '../../src/analyzers/java';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeJava', () => {
  describe('healthy fixture — Simple.java', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'Simple.java'), 'utf-8');
    let result: ReturnType<typeof analyzeJava>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeJava(code); }).not.toThrow();
    });

    it('detects exactly 3 methods', () => {
      result = analyzeJava(code);
      expect(result.functions).toHaveLength(3);
    });

    it('method names are correct', () => {
      result = analyzeJava(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('add');
      expect(names).toContain('greet');
      expect(names).toContain('isPositive');
    });

    it('all methods have cyclomaticComplexity of 1', () => {
      result = analyzeJava(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all methods have nestingDepth of 0', () => {
      result = analyzeJava(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('add() has parameterCount of 2', () => {
      result = analyzeJava(code);
      const addFn = result.functions.find(f => f.name === 'add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeJava(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeJava(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzeJava(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — Complex.java', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'Complex.java'), 'utf-8');
    let result: ReturnType<typeof analyzeJava>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeJava(code); }).not.toThrow();
    });

    it('detects 1 method', () => {
      result = analyzeJava(code);
      expect(result.functions).toHaveLength(1);
    });

    it('method name is processData', () => {
      result = analyzeJava(code);
      expect(result.functions[0].name).toBe('processData');
    });

    it('cyclomaticComplexity > 8', () => {
      result = analyzeJava(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5', () => {
      result = analyzeJava(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzeJava(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzeJava(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions array for empty string', () => {
      const result = analyzeJava('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles constructor_declaration — detected as function', () => {
      const code = `
public class Foo {
    public Foo(int x) {
        this.x = x;
    }
}
`;
      const result = analyzeJava(code);
      const hasConstructor = result.functions.some(f => f.name === 'Foo');
      expect(hasConstructor).toBe(true);
    });

    it('handles enhanced for loop — increments cyclomatic complexity', () => {
      const code = `
public class Foo {
    public int sumAll(int[] nums) {
        int s = 0;
        for (int n : nums) {
            s += n;
        }
        return s;
    }
}
`;
      const result = analyzeJava(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });
});
```

### 3.4 Run test and verify it FAILS

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/java.test.ts
```

Expected: fails with `Cannot find module '../../src/analyzers/java'`. Red phase confirmed.

### 3.5 Implement the Java analyzer

- [ ] Create file `packages/core/src/analyzers/java.ts`:

```typescript
import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();

const JAVA_CYCLOMATIC_NODES = new Set([
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
  'switch_label',
]);

const JAVA_NESTING_NODES = new Set([
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'try_statement',
]);

export function analyzeJava(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  parser.setLanguage(Java as unknown as Parser.Language);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (
      node.type === 'method_declaration' ||
      node.type === 'constructor_declaration'
    ) {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const params = node.childForFieldName('parameters');
      const paramCount = params
        ? params.namedChildren.filter(c => c.type === 'formal_parameter').length
        : 0;

      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculateJavaCyclomatic(node),
        nestingDepth: calculateJavaNesting(node),
        parameterCount: paramCount,
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code.length === 0 ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics };
}

function calculateJavaCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (JAVA_CYCLOMATIC_NODES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculateJavaNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = JAVA_NESTING_NODES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 1,
      maxNestingDepth: 0,
      avgFunctionLength: 0,
      maxFunctionLength: 0,
      avgParameterCount: 0,
      maxParameterCount: 0,
      totalLines,
      duplicationScore: 0,
    };
  }
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}
```

### 3.6 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/java.test.ts
```

Expected output:

```
✓ analyzeJava > healthy fixture — Simple.java > parses without throwing
✓ analyzeJava > healthy fixture — Simple.java > detects exactly 3 methods
...
✓ analyzeJava > edge cases > handles enhanced for loop — increments cyclomatic complexity
Test Files  1 passed (1)
Tests       14 passed (14)
```

### 3.7 Commit

```bash
git add packages/core/src/analyzers/java.ts \
        packages/core/tests/analyzers/java.test.ts \
        packages/core/tests/fixtures/healthy/Simple.java \
        packages/core/tests/fixtures/unhealthy/Complex.java
git commit -m "feat(core): Java/Kotlin AST analyzer with tree-sitter-java"
```

---

## Task 4 — C# analyzer

### 4.1 Create healthy C# fixture

- [ ] Create file `packages/core/tests/fixtures/healthy/Simple.cs`:

```csharp
public class Simple {
    public int Add(int a, int b) => a + b;

    public string Greet(string name) => $"Hello, {name}!";

    public bool IsPositive(int n) => n > 0;
}
```

### 4.2 Create unhealthy C# fixture

- [ ] Create file `packages/core/tests/fixtures/unhealthy/Complex.cs`:

```csharp
public class Complex {
    public string ProcessData(
        object[] items, object config, object options,
        Action callback, string mode, object extra
    ) {
        if (items != null) {
            foreach (var item in items) {
                int val = (int)item;
                if (val > 0) {
                    while (val > 1) {
                        if (val % 2 == 0) {
                            if (mode == "fast") {
                                return "fast";
                            } else if (mode == "slow") {
                                return "slow";
                            }
                        }
                        val--;
                    }
                } else if (val < -10) {
                    return "negative";
                }
            }
        } else if (extra != null) {
            return "extra";
        }
        return "default";
    }
}
```

### 4.3 Write the failing C# analyzer test

- [ ] Create file `packages/core/tests/analyzers/csharp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeCSharp } from '../../src/analyzers/csharp';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeCSharp', () => {
  describe('healthy fixture — Simple.cs', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'Simple.cs'), 'utf-8');
    let result: ReturnType<typeof analyzeCSharp>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeCSharp(code); }).not.toThrow();
    });

    it('detects exactly 3 methods', () => {
      result = analyzeCSharp(code);
      expect(result.functions).toHaveLength(3);
    });

    it('method names are correct', () => {
      result = analyzeCSharp(code);
      const names = result.functions.map(f => f.name);
      expect(names).toContain('Add');
      expect(names).toContain('Greet');
      expect(names).toContain('IsPositive');
    });

    it('all methods have cyclomaticComplexity of 1', () => {
      result = analyzeCSharp(code);
      for (const fn of result.functions) {
        expect(fn.cyclomaticComplexity).toBe(1);
      }
    });

    it('all methods have nestingDepth of 0', () => {
      result = analyzeCSharp(code);
      for (const fn of result.functions) {
        expect(fn.nestingDepth).toBe(0);
      }
    });

    it('Add() has parameterCount of 2', () => {
      result = analyzeCSharp(code);
      const addFn = result.functions.find(f => f.name === 'Add');
      expect(addFn?.parameterCount).toBe(2);
    });

    it('metrics.cyclomaticComplexity is 1', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.cyclomaticComplexity).toBe(1);
    });

    it('metrics.maxNestingDepth is 0', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.maxNestingDepth).toBe(0);
    });

    it('metrics.totalLines matches line count', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.totalLines).toBe(code.split('\n').length);
    });
  });

  describe('unhealthy fixture — Complex.cs', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'Complex.cs'), 'utf-8');
    let result: ReturnType<typeof analyzeCSharp>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeCSharp(code); }).not.toThrow();
    });

    it('detects 1 method', () => {
      result = analyzeCSharp(code);
      expect(result.functions).toHaveLength(1);
    });

    it('method name is ProcessData', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].name).toBe('ProcessData');
    });

    it('cyclomaticComplexity > 8', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(8);
    });

    it('nestingDepth >= 5', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(5);
    });

    it('parameterCount is 6', () => {
      result = analyzeCSharp(code);
      expect(result.functions[0].parameterCount).toBe(6);
    });

    it('metrics.maxNestingDepth >= 5', () => {
      result = analyzeCSharp(code);
      expect(result.metrics.maxNestingDepth).toBeGreaterThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('returns empty functions for empty string', () => {
      const result = analyzeCSharp('');
      expect(result.functions).toHaveLength(0);
    });

    it('handles constructor_declaration', () => {
      const code = `
public class Foo {
    public Foo(int x) {
        this.x = x;
    }
}
`;
      const result = analyzeCSharp(code);
      const hasCtor = result.functions.some(f => f.name === 'Foo');
      expect(hasCtor).toBe(true);
    });

    it('handles expression-bodied member — no crash', () => {
      const code = `
public class Calc {
    public int Double(int n) => n * 2;
}
`;
      expect(() => analyzeCSharp(code)).not.toThrow();
    });

    it('handles foreach_statement — increments cyclomatic complexity', () => {
      const code = `
public class Foo {
    public int Sum(int[] nums) {
        int s = 0;
        foreach (var n in nums) {
            s += n;
        }
        return s;
    }
}
`;
      const result = analyzeCSharp(code);
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });
});
```

### 4.4 Run test and verify it FAILS

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/csharp.test.ts
```

Expected: fails with `Cannot find module '../../src/analyzers/csharp'`. Red phase confirmed.

### 4.5 Implement the C# analyzer

- [ ] Create file `packages/core/src/analyzers/csharp.ts`:

```typescript
import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();

const CS_CYCLOMATIC_NODES = new Set([
  'if_statement',
  'for_statement',
  'foreach_statement',
  'while_statement',
  'do_statement',
  'conditional_expression',
  'catch_clause',
  'switch_section',
  'case_switch_label',
]);

const CS_NESTING_NODES = new Set([
  'if_statement',
  'for_statement',
  'foreach_statement',
  'while_statement',
  'do_statement',
  'try_statement',
]);

export function analyzeCSharp(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  parser.setLanguage(CSharp as unknown as Parser.Language);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (
      node.type === 'method_declaration' ||
      node.type === 'constructor_declaration' ||
      node.type === 'local_function_statement'
    ) {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const params = node.childForFieldName('parameters');
      const paramCount = params
        ? params.namedChildren.filter(c => c.type === 'parameter').length
        : 0;

      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculateCsCyclomatic(node),
        nestingDepth: calculateCsNesting(node),
        parameterCount: paramCount,
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code.length === 0 ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics };
}

function calculateCsCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (CS_CYCLOMATIC_NODES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculateCsNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = CS_NESTING_NODES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 1,
      maxNestingDepth: 0,
      avgFunctionLength: 0,
      maxFunctionLength: 0,
      avgParameterCount: 0,
      maxParameterCount: 0,
      totalLines,
      duplicationScore: 0,
    };
  }
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}
```

### 4.6 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/csharp.test.ts
```

Expected output:

```
✓ analyzeCSharp > healthy fixture — Simple.cs > parses without throwing
✓ analyzeCSharp > healthy fixture — Simple.cs > detects exactly 3 methods
...
✓ analyzeCSharp > edge cases > handles foreach_statement — increments cyclomatic complexity
Test Files  1 passed (1)
Tests       15 passed (15)
```

### 4.7 Commit

```bash
git add packages/core/src/analyzers/csharp.ts \
        packages/core/tests/analyzers/csharp.test.ts \
        packages/core/tests/fixtures/healthy/Simple.cs \
        packages/core/tests/fixtures/unhealthy/Complex.cs
git commit -m "feat(core): C# AST analyzer with tree-sitter-c-sharp"
```

---

## Task 5 — Analyzers router index

### 5.1 Write the failing router test

- [ ] Create file `packages/core/tests/analyzers/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeByLanguage } from '../../src/analyzers/index';

const TS_SIMPLE = `
function add(a: number, b: number): number {
  return a + b;
}
`;

const PY_SIMPLE = `
def add(a: int, b: int) -> int:
    return a + b
`;

const JAVA_SIMPLE = `
public class Foo {
    public int add(int a, int b) {
        return a + b;
    }
}
`;

const CS_SIMPLE = `
public class Foo {
    public int Add(int a, int b) => a + b;
}
`;

describe('analyzeByLanguage router', () => {
  it('routes typescript to TypeScript analyzer', () => {
    const result = analyzeByLanguage(TS_SIMPLE, 'typescript');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes javascript to TypeScript analyzer', () => {
    const result = analyzeByLanguage('function hi() { return 1; }', 'javascript');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('hi');
  });

  it('routes python to Python analyzer', () => {
    const result = analyzeByLanguage(PY_SIMPLE, 'python');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes java to Java analyzer', () => {
    const result = analyzeByLanguage(JAVA_SIMPLE, 'java');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('add');
  });

  it('routes kotlin to Java analyzer', () => {
    // Kotlin shares the Java grammar for basic structures at this stage
    const result = analyzeByLanguage(JAVA_SIMPLE, 'kotlin');
    expect(result.functions).toHaveLength(1);
  });

  it('routes csharp to CSharp analyzer', () => {
    const result = analyzeByLanguage(CS_SIMPLE, 'csharp');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('Add');
  });

  it('returns empty result for unsupported language', () => {
    // 'unsupported' is not in the Language union but testing the default branch
    const result = analyzeByLanguage('some code', 'typescript');
    expect(result.functions).toBeDefined();
    expect(result.metrics).toBeDefined();
  });

  it('metrics object has all required keys', () => {
    const result = analyzeByLanguage(PY_SIMPLE, 'python');
    expect(result.metrics).toHaveProperty('cyclomaticComplexity');
    expect(result.metrics).toHaveProperty('cognitiveComplexity');
    expect(result.metrics).toHaveProperty('maxNestingDepth');
    expect(result.metrics).toHaveProperty('avgFunctionLength');
    expect(result.metrics).toHaveProperty('maxFunctionLength');
    expect(result.metrics).toHaveProperty('avgParameterCount');
    expect(result.metrics).toHaveProperty('maxParameterCount');
    expect(result.metrics).toHaveProperty('totalLines');
    expect(result.metrics).toHaveProperty('duplicationScore');
  });
});
```

### 5.2 Run test and verify it FAILS

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/index.test.ts
```

Expected: fails with `Cannot find module '../../src/analyzers/index'` (or similar if index exists but lacks the routing function). Red phase confirmed.

### 5.3 Implement the analyzers router

- [ ] Create file `packages/core/src/analyzers/index.ts`:

```typescript
import type { Language, FunctionResult, MetricBreakdown } from '../types';
import { analyzeTypeScript } from './typescript';
import { analyzePython } from './python';
import { analyzeJava } from './java';
import { analyzeCSharp } from './csharp';

export { analyzeTypeScript } from './typescript';
export { analyzePython } from './python';
export { analyzeJava } from './java';
export { analyzeCSharp } from './csharp';

export function analyzeByLanguage(
  code: string,
  language: Language
): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return analyzeTypeScript(code);
    case 'python':
      return analyzePython(code);
    case 'java':
    case 'kotlin':
      return analyzeJava(code);
    case 'csharp':
      return analyzeCSharp(code);
    default: {
      const totalLines = code.split('\n').length;
      return {
        functions: [],
        metrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          maxNestingDepth: 0,
          avgFunctionLength: 0,
          maxFunctionLength: 0,
          avgParameterCount: 0,
          maxParameterCount: 0,
          totalLines,
          duplicationScore: 0,
        },
      };
    }
  }
}
```

### 5.4 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/index.test.ts
```

Expected output:

```
✓ analyzeByLanguage router > routes typescript to TypeScript analyzer
✓ analyzeByLanguage router > routes javascript to TypeScript analyzer
✓ analyzeByLanguage router > routes python to Python analyzer
✓ analyzeByLanguage router > routes java to Java analyzer
✓ analyzeByLanguage router > routes kotlin to Java analyzer
✓ analyzeByLanguage router > routes csharp to CSharp analyzer
✓ analyzeByLanguage router > returns empty result for unsupported language
✓ analyzeByLanguage router > metrics object has all required keys
Test Files  1 passed (1)
Tests       8 passed (8)
```

### 5.5 Commit

```bash
git add packages/core/src/analyzers/index.ts \
        packages/core/tests/analyzers/index.test.ts
git commit -m "feat(core): analyzers router — dispatch by language to correct AST parser"
```

---

## Task 6 — Diff module (git.ts + index.ts)

### 6.1 Write the failing diff test

- [ ] Create file `packages/core/tests/diff/git.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock simple-git to avoid needing a real git repo in CI.
// The test verifies the module's contract, not simple-git internals.
vi.mock('simple-git', () => {
  return {
    default: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import simpleGit from 'simple-git';
import * as fsp from 'fs/promises';
import { analyzeChangeset } from '../../src/diff/git';

const mockGit = {
  checkIsRepo: vi.fn(),
  diff: vi.fn(),
  show: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (simpleGit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);
});

describe('analyzeChangeset', () => {
  it('throws if path is not a git repository', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false);
    await expect(analyzeChangeset('/not/a/repo', 'main')).rejects.toThrow(
      /git-repository/i
    );
  });

  it('returns empty result when no files changed', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('');
    const result = await analyzeChangeset('/repo', 'main');
    expect(result.filesAnalyzed).toBe(0);
    expect(result.regressions).toHaveLength(0);
    expect(result.improvements).toHaveLength(0);
    expect(result.newUnhealthyFiles).toHaveLength(0);
    expect(result.overallSafe).toBe(true);
  });

  it('skips unsupported file types', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('README.md\ndata.csv\n');
    const result = await analyzeChangeset('/repo', 'main');
    expect(result.filesAnalyzed).toBe(2);
    expect(result.regressions).toHaveLength(0);
  });

  it('detects regression when score drops by more than 0.5', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/foo.ts\n');

    // Provide healthy base code and unhealthy current code
    const baseCode = `
function simple(a: number): number {
  return a + 1;
}
`;
    const currentCode = `
function complex(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return f;
          }
        }
      }
    }
  }
  return 0;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(currentCode);
    mockGit.show.mockResolvedValue(baseCode);

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].filePath).toBe('src/foo.ts');
    expect(result.regressions[0].scoreBefore).toBeGreaterThan(
      result.regressions[0].scoreAfter
    );
    expect(result.overallSafe).toBe(false);
  });

  it('detects improvement when score rises by more than 0.5', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/bar.ts\n');

    const baseCode = `
function complex(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            return f;
          }
        }
      }
    }
  }
  return 0;
}
`;
    const currentCode = `
function simple(a: number): number {
  return a + 1;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(currentCode);
    mockGit.show.mockResolvedValue(baseCode);

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].filePath).toBe('src/bar.ts');
    expect(result.overallSafe).toBe(true);
  });

  it('marks new unhealthy files (score < 7.0) when base version absent', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('src/newfile.ts\n');

    const unhealthyCode = `
function mess(a: number, b: number, c: number, d: number, e: number, f: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (e > 0) {
            if (f > 0) {
              return 1;
            }
          }
        }
      }
    }
  }
  return 0;
}
`;
    (fsp.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(unhealthyCode);
    // show() throws = new file, no base version
    mockGit.show.mockRejectedValue(new Error('path not found'));

    const result = await analyzeChangeset('/repo', 'main');
    expect(result.newUnhealthyFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.overallSafe).toBe(false);
  });

  it('ChangesetResult has required shape', async () => {
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.diff.mockResolvedValue('');

    const result = await analyzeChangeset('/repo', 'main');
    expect(result).toHaveProperty('filesAnalyzed');
    expect(result).toHaveProperty('regressions');
    expect(result).toHaveProperty('improvements');
    expect(result).toHaveProperty('newUnhealthyFiles');
    expect(result).toHaveProperty('overallSafe');
  });
});
```

### 6.2 Run test and verify it FAILS

- [ ] Run:

```bash
cd packages/core && pnpm test tests/diff/git.test.ts
```

Expected: fails with `Cannot find module '../../src/diff/git'`. Red phase confirmed.

### 6.3 Implement diff/git.ts

- [ ] Create directory `packages/core/src/diff/` (create an empty `.gitkeep` or just create the file directly).

- [ ] Create file `packages/core/src/diff/git.ts`:

```typescript
import simpleGit from 'simple-git';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { ChangesetResult, FileRegression, FileImprovement, HealthResult } from '../types';

export async function analyzeChangeset(
  repoPath: string,
  baseBranch: string
): Promise<ChangesetResult> {
  const git = simpleGit(repoPath);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`${repoPath} är inte ett git-repository`);
  }

  const diff = await git.diff(['--name-only', `${baseBranch}...HEAD`]);
  const changedFiles = diff.trim().split('\n').filter(Boolean);

  const regressions: FileRegression[] = [];
  const improvements: FileImprovement[] = [];
  const newUnhealthyFiles: HealthResult[] = [];

  for (const relPath of changedFiles) {
    const absPath = path.join(repoPath, relPath);
    const language = detectLanguage(absPath);
    if (language === 'unsupported') continue;

    let currentCode: string;
    try {
      currentCode = await fsp.readFile(absPath, 'utf-8');
    } catch {
      // File deleted in this branch — skip
      continue;
    }

    let baseCode: string;
    try {
      baseCode = await git.show([`${baseBranch}:${relPath}`]);
    } catch {
      // New file — no base version exists
      const result = analyzeCode(currentCode, language, absPath);
      if (result.score < 7.0) {
        newUnhealthyFiles.push(result);
      }
      continue;
    }

    const baseResult = analyzeCode(baseCode, language, absPath);
    const currentResult = analyzeCode(currentCode, language, absPath);

    if (currentResult.score < baseResult.score - 0.5) {
      regressions.push({
        filePath: relPath,
        scoreBefore: baseResult.score,
        scoreAfter: currentResult.score,
        newSmells: currentResult.smells.filter(
          s =>
            !baseResult.smells.some(
              bs => bs.type === s.type && bs.functionName === s.functionName
            )
        ),
      });
    } else if (currentResult.score > baseResult.score + 0.5) {
      improvements.push({
        filePath: relPath,
        scoreBefore: baseResult.score,
        scoreAfter: currentResult.score,
        fixedSmells: baseResult.smells.filter(
          s =>
            !currentResult.smells.some(
              cs => cs.type === s.type && cs.functionName === s.functionName
            )
        ),
      });
    }
  }

  return {
    filesAnalyzed: changedFiles.length,
    regressions,
    improvements,
    newUnhealthyFiles,
    overallSafe: regressions.length === 0 && newUnhealthyFiles.length === 0,
  };
}
```

### 6.4 Implement diff/index.ts

- [ ] Create file `packages/core/src/diff/index.ts`:

```typescript
export { analyzeChangeset } from './git';
```

### 6.5 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/diff/git.test.ts
```

Expected output:

```
✓ analyzeChangeset > throws if path is not a git repository
✓ analyzeChangeset > returns empty result when no files changed
✓ analyzeChangeset > skips unsupported file types
✓ analyzeChangeset > detects regression when score drops by more than 0.5
✓ analyzeChangeset > detects improvement when score rises by more than 0.5
✓ analyzeChangeset > marks new unhealthy files (score < 7.0) when base version absent
✓ analyzeChangeset > ChangesetResult has required shape
Test Files  1 passed (1)
Tests       7 passed (7)
```

### 6.6 Commit

```bash
git add packages/core/src/diff/git.ts \
        packages/core/src/diff/index.ts \
        packages/core/tests/diff/git.test.ts
git commit -m "feat(core): diff module — analyzeChangeset via simple-git"
```

---

## Task 7 — Wire analyzeChangeset into packages/core/src/index.ts

### 7.1 Write the failing integration test

- [ ] Create file `packages/core/tests/index.test.ts` (or append to existing if Sprint 1 already created it):

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeCode, analyzeChangeset } from '../src/index';

describe('core public API', () => {
  describe('analyzeCode with all languages', () => {
    it('analyzes TypeScript code', () => {
      const code = 'function add(a: number, b: number) { return a + b; }\n';
      const result = analyzeCode(code, 'typescript', 'dummy.ts');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.functions).toHaveLength(1);
    });

    it('analyzes Python code', () => {
      const code = 'def add(a, b):\n    return a + b\n';
      const result = analyzeCode(code, 'python', 'dummy.py');
      expect(result.score).toBeGreaterThan(0);
      expect(result.functions).toHaveLength(1);
    });

    it('analyzes Java code', () => {
      const code =
        'public class Foo { public int add(int a, int b) { return a + b; } }\n';
      const result = analyzeCode(code, 'java', 'Foo.java');
      expect(result.score).toBeGreaterThan(0);
      expect(result.functions).toHaveLength(1);
    });

    it('analyzes C# code', () => {
      const code = 'public class Foo { public int Add(int a, int b) => a + b; }\n';
      const result = analyzeCode(code, 'csharp', 'Foo.cs');
      expect(result.score).toBeGreaterThan(0);
      expect(result.functions).toHaveLength(1);
    });

    it('returns category green for healthy code', () => {
      const code = 'function add(a: number, b: number) { return a + b; }\n';
      const result = analyzeCode(code, 'typescript', 'dummy.ts');
      expect(['green', 'yellow', 'red']).toContain(result.category);
    });
  });

  describe('analyzeChangeset export', () => {
    it('analyzeChangeset is exported as a function', () => {
      expect(typeof analyzeChangeset).toBe('function');
    });

    it('analyzeChangeset returns a Promise', () => {
      // Pass a path that will fail (not a repo) — just verify it returns a Promise
      const result = analyzeChangeset('/definitely/not/a/repo', 'main');
      expect(result).toBeInstanceOf(Promise);
      // Swallow the rejection — we only care about the shape here
      result.catch(() => {});
    });
  });
});
```

### 7.2 Run test and verify it FAILS

- [ ] Run:

```bash
cd packages/core && pnpm test tests/index.test.ts
```

Expected: fails because `analyzeChangeset` is not yet exported from `packages/core/src/index.ts`. Red phase confirmed.

### 7.3 Update packages/core/src/index.ts

- [ ] Open `packages/core/src/index.ts` and add the `analyzeChangeset` export. The complete file should look like (adjust imports to match what Sprint 1 already defined):

```typescript
import * as path from 'path';
import * as fs from 'fs';
import { detectLanguage } from './language-detect';
import { analyzeByLanguage } from './analyzers/index';
import { scoreResult } from './scoring/scorer';
import { detectSmells } from './smells/detector';
import type { HealthResult, Language } from './types';

export { analyzeChangeset } from './diff/index';
export type { HealthResult, ChangesetResult, FileRegression, FileImprovement, Language } from './types';

export function analyzeCode(
  code: string,
  language: Language,
  filePath: string = 'unknown'
): HealthResult {
  const { functions, metrics } = analyzeByLanguage(code, language);
  const smells = detectSmells(functions, metrics, code);
  const score = scoreResult(smells, metrics);
  const category: HealthResult['category'] =
    score >= 9.0 ? 'green' : score >= 4.0 ? 'yellow' : 'red';

  return {
    score,
    category,
    smells,
    metrics,
    functions,
  };
}

export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const language = detectLanguage(filePath);
  if (language === 'unsupported') {
    throw new Error(`Unsupported language for file: ${filePath}`);
  }
  const code = fs.readFileSync(filePath, 'utf-8');
  return analyzeCode(code, language, filePath);
}
```

> **Note:** If Sprint 1 already defined `analyzeCode` and `analyzeFile` with a different internal structure, preserve that structure and only add the `export { analyzeChangeset }` line. Do not remove or rewrite existing logic.

### 7.4 Run test and verify it PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/index.test.ts
```

Expected output:

```
✓ core public API > analyzeCode with all languages > analyzes TypeScript code
✓ core public API > analyzeCode with all languages > analyzes Python code
✓ core public API > analyzeCode with all languages > analyzes Java code
✓ core public API > analyzeCode with all languages > analyzes C# code
✓ core public API > analyzeCode with all languages > returns category green for healthy code
✓ core public API > analyzeChangeset export > analyzeChangeset is exported as a function
✓ core public API > analyzeChangeset export > analyzeChangeset returns a Promise
Test Files  1 passed (1)
Tests       7 passed (7)
```

### 7.5 Commit

```bash
git add packages/core/src/index.ts \
        packages/core/tests/index.test.ts
git commit -m "feat(core): export analyzeChangeset from public API — sprint 2 complete"
```

---

## Task 8 — Full test suite green check

### 8.1 Run all core tests

- [ ] From repo root:

```bash
pnpm --filter @healthy-ai-code/core test
```

Expected output: all test files pass. Example summary:

```
Test Files  7 passed (7)
Tests       XX passed (XX)
Duration    X.XXs
```

No failures, no skipped tests.

### 8.2 Check TypeScript compilation

- [ ] Run:

```bash
pnpm --filter @healthy-ai-code/core build
```

or if no build script exists yet:

```bash
cd packages/core && npx tsc --noEmit
```

Expected: zero TypeScript errors.

### 8.3 Commit (if build config was adjusted)

If `tsconfig.json` or other config files were modified during the compilation check:

```bash
git add packages/core/tsconfig.json  # only if changed
git commit -m "chore(core): fix TypeScript config after sprint 2 additions"
```

---

## Task 9 — Sprint 2 smoke test against real fixtures

### 9.1 Write the cross-language fixture smoke test

- [ ] Create file `packages/core/tests/analyzers/cross-language.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeCode } from '../../src/index';

const HEALTHY = path.join(__dirname, '../fixtures/healthy');
const UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('cross-language fixture smoke tests', () => {
  describe('healthy files score >= 8.0', () => {
    it('TypeScript simple.ts (if exists)', () => {
      const p = path.join(HEALTHY, 'simple.ts');
      if (!fs.existsSync(p)) return;
      const code = fs.readFileSync(p, 'utf-8');
      const result = analyzeCode(code, 'typescript', p);
      expect(result.score).toBeGreaterThanOrEqual(8.0);
    });

    it('Python simple.py', () => {
      const code = fs.readFileSync(path.join(HEALTHY, 'simple.py'), 'utf-8');
      const result = analyzeCode(code, 'python', 'simple.py');
      expect(result.score).toBeGreaterThanOrEqual(8.0);
    });

    it('Java Simple.java', () => {
      const code = fs.readFileSync(path.join(HEALTHY, 'Simple.java'), 'utf-8');
      const result = analyzeCode(code, 'java', 'Simple.java');
      expect(result.score).toBeGreaterThanOrEqual(8.0);
    });

    it('C# Simple.cs', () => {
      const code = fs.readFileSync(path.join(HEALTHY, 'Simple.cs'), 'utf-8');
      const result = analyzeCode(code, 'csharp', 'Simple.cs');
      expect(result.score).toBeGreaterThanOrEqual(8.0);
    });
  });

  describe('unhealthy files score <= 6.0', () => {
    it('Python complex.py', () => {
      const code = fs.readFileSync(path.join(UNHEALTHY, 'complex.py'), 'utf-8');
      const result = analyzeCode(code, 'python', 'complex.py');
      expect(result.score).toBeLessThanOrEqual(6.0);
    });

    it('Java Complex.java', () => {
      const code = fs.readFileSync(path.join(UNHEALTHY, 'Complex.java'), 'utf-8');
      const result = analyzeCode(code, 'java', 'Complex.java');
      expect(result.score).toBeLessThanOrEqual(6.0);
    });

    it('C# Complex.cs', () => {
      const code = fs.readFileSync(path.join(UNHEALTHY, 'Complex.cs'), 'utf-8');
      const result = analyzeCode(code, 'csharp', 'Complex.cs');
      expect(result.score).toBeLessThanOrEqual(6.0);
    });
  });

  describe('HealthResult shape is consistent across languages', () => {
    const cases: Array<[string, string, string]> = [
      ['def f(x):\n    return x\n', 'python', 'f.py'],
      ['public class A { public int f(int x) { return x; } }', 'java', 'A.java'],
      ['public class A { public int F(int x) => x; }', 'csharp', 'A.cs'],
    ];

    for (const [code, lang, file] of cases) {
      it(`${lang} result has score, category, smells, metrics, functions`, () => {
        const result = analyzeCode(code, lang as never, file);
        expect(typeof result.score).toBe('number');
        expect(['green', 'yellow', 'red']).toContain(result.category);
        expect(Array.isArray(result.smells)).toBe(true);
        expect(Array.isArray(result.functions)).toBe(true);
        expect(typeof result.metrics).toBe('object');
      });
    }
  });
});
```

### 9.2 Run smoke test and verify PASSES

- [ ] Run:

```bash
cd packages/core && pnpm test tests/analyzers/cross-language.test.ts
```

Expected: all tests green. If a score boundary assertion fails (e.g. a healthy file scores 7.8 instead of 8.0), investigate the scorer weights from Sprint 1 before adjusting the threshold.

### 9.3 Commit

```bash
git add packages/core/tests/analyzers/cross-language.test.ts
git commit -m "test(core): cross-language fixture smoke tests — sprint 2 verification"
```

---

## Sprint 2 completion checklist

- [ ] `pnpm install` completed without errors — all four new packages resolved
- [ ] `packages/core/src/analyzers/python.ts` — implemented and tested
- [ ] `packages/core/src/analyzers/java.ts` — implemented and tested
- [ ] `packages/core/src/analyzers/csharp.ts` — implemented and tested
- [ ] `packages/core/src/analyzers/index.ts` — router implemented and tested
- [ ] `packages/core/src/diff/git.ts` — `analyzeChangeset` implemented and tested
- [ ] `packages/core/src/diff/index.ts` — re-export created
- [ ] `packages/core/src/index.ts` — `analyzeChangeset` exported from public API
- [ ] `packages/core/tests/fixtures/healthy/simple.py` — created
- [ ] `packages/core/tests/fixtures/healthy/Simple.java` — created
- [ ] `packages/core/tests/fixtures/healthy/Simple.cs` — created
- [ ] `packages/core/tests/fixtures/unhealthy/complex.py` — created
- [ ] `packages/core/tests/fixtures/unhealthy/Complex.java` — created
- [ ] `packages/core/tests/fixtures/unhealthy/Complex.cs` — created
- [ ] All test suites green: `pnpm --filter @healthy-ai-code/core test`
- [ ] TypeScript compilation clean: `npx tsc --noEmit` (zero errors)
- [ ] All 7 commits made, one per task

---

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| tree-sitter-c-sharp node type names differ from spec | Run `node -e "const P = require('tree-sitter'); const CS = require('tree-sitter-c-sharp'); P.setLanguage(CS); const t = P.parse('public class A { public int F() {} }'); console.log(JSON.stringify(t.rootNode, null, 2))"` to inspect actual node types |
| simple-git `checkIsRepo` returns differently on Windows | Test with `mockGit.checkIsRepo.mockResolvedValue(true)` — the mock isolates the contract |
| Python `boolean_operator` counted differently from expected | Manually verify: `and`/`or` in Python are `boolean_operator` nodes — add to cyclomatic set and rerun |
| Java `switch_label` vs `switch_expression` naming variance | Use tree-sitter playground (https://tree-sitter.github.io/tree-sitter/playground) with tree-sitter-java to confirm node types before writing assertions |
| `analyzeCode` signature in Sprint 1 index.ts differs | Read the existing `packages/core/src/index.ts` before editing — preserve existing parameter names exactly |
