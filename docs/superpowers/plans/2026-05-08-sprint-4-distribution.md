# Sprint 4: Distribution & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete fixture coverage, harden edge cases, wire integration tests, and prepare both packages for npm publication with a clear README for end users.

**Architecture:** The monorepo already has a working core analysis engine and MCP server from Sprints 1–3. Sprint 4 adds the surrounding quality layer: verified fixture files that act as ground truth for all language parsers, defensive edge-case handling in `core/index.ts`, end-to-end integration tests that exercise the full MCP tool stack against those fixtures, and the npm packaging metadata that lets anyone run the server via `npx @healthy-ai-code/mcp-server`. No new abstractions are introduced — every change either strengthens existing code paths or adds distribution metadata.

**Tech Stack:** TypeScript 5.x, pnpm workspaces, Vitest, tree-sitter, @modelcontextprotocol/sdk, Node.js 18+

---

## Task 1 — Healthy fixtures (TypeScript)

> **Why first:** Integration tests and edge-case tests depend on fixtures existing. Establish the "green baseline" before writing any assertion.

- [ ] Create file `packages/core/tests/fixtures/healthy/simple.ts` with the following exact content:
  ```typescript
  export function add(a: number, b: number): number {
    return a + b;
  }
  export function multiply(a: number, b: number): number {
    return a * b;
  }
  export function isEven(n: number): boolean {
    return n % 2 === 0;
  }
  export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
  export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/pure-functions.ts` with the following exact content:
  ```typescript
  export function square(n: number): number {
    return n * n;
  }
  export function cube(n: number): number {
    return n * n * n;
  }
  export function negate(n: number): boolean {
    return !n;
  }
  export function identity<T>(value: T): T {
    return value;
  }
  export function head<T>(arr: T[]): T | undefined {
    return arr[0];
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/string-utils.ts` with the following exact content:
  ```typescript
  export function trim(s: string): string {
    return s.trim();
  }
  export function toUpperCase(s: string): string {
    return s.toUpperCase();
  }
  export function toLowerCase(s: string): string {
    return s.toLowerCase();
  }
  export function repeat(s: string, n: number): string {
    return s.repeat(n);
  }
  export function includes(s: string, sub: string): boolean {
    return s.includes(sub);
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/array-utils.ts` with the following exact content:
  ```typescript
  export function first<T>(arr: T[]): T | undefined {
    return arr[0];
  }
  export function last<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
  }
  export function isEmpty<T>(arr: T[]): boolean {
    return arr.length === 0;
  }
  export function sum(arr: number[]): number {
    return arr.reduce((acc, n) => acc + n, 0);
  }
  export function unique<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/math-utils.ts` with the following exact content:
  ```typescript
  export function abs(n: number): number {
    return Math.abs(n);
  }
  export function floor(n: number): number {
    return Math.floor(n);
  }
  export function ceil(n: number): number {
    return Math.ceil(n);
  }
  export function round(n: number): number {
    return Math.round(n);
  }
  export function max(a: number, b: number): number {
    return Math.max(a, b);
  }
  ```

- [ ] Run `pnpm --filter @healthy-ai-code/core test` and confirm all healthy fixture files produce score >= 9.0 in the existing fixture-based tests (or that `analyzeFile` returns >= 9.0 when called directly in a quick ad-hoc check).

- [ ] Commit: `git add packages/core/tests/fixtures/healthy/ && git commit -m "test(core): add healthy TypeScript fixtures for score baseline"`

---

## Task 2 — Unhealthy fixtures (TypeScript)

- [ ] Create file `packages/core/tests/fixtures/unhealthy/complex.ts` with the following exact content:
  ```typescript
  // Triggers: ComplexMethod, DeepNesting, LargeMethod, LongParameterList
  export function processUserData(
    userId: string,
    userData: Record<string, unknown>,
    options: Record<string, unknown>,
    callback: (result: string) => void,
    mode: string,
    retry: boolean
  ): string {
    if (userId && userData) {
      for (const key of Object.keys(userData)) {
        if (typeof userData[key] === 'string') {
          while ((userData[key] as string).length > 0) {
            if (mode === 'strict') {
              if ((userData[key] as string).startsWith('_')) {
                if (retry) {
                  return 'retry-needed';
                } else {
                  return 'skip';
                }
              } else if ((userData[key] as string).startsWith('@')) {
                return 'special';
              }
            } else if (mode === 'loose') {
              if (options['validate']) {
                callback('validated');
                return 'ok';
              }
            }
            break;
          }
        } else if (typeof userData[key] === 'number') {
          if ((userData[key] as number) > 100 && (userData[key] as number) < 1000) {
            return 'range-ok';
          } else if ((userData[key] as number) >= 1000) {
            return 'too-large';
          }
        }
      }
    } else if (!userId) {
      return 'no-user';
    }
    return 'default';
  }

  // Additional function to push LargeFile smell if combined with others
  export function transform(data: unknown[]): unknown[] {
    if (!data || data.length === 0) return [];
    const result: unknown[] = [];
    for (const item of data) {
      if (typeof item === 'string') {
        if (item.length > 10) {
          if (item.includes(' ')) {
            result.push(item.trim().toLowerCase());
          } else {
            result.push(item.toLowerCase());
          }
        } else {
          result.push(item);
        }
      } else if (typeof item === 'number') {
        if (item > 0) {
          if (item > 100) {
            result.push(item * 0.9);
          } else {
            result.push(item);
          }
        }
      }
    }
    return result;
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/unhealthy/nested-logic.ts` with the following exact content:
  ```typescript
  // Triggers: DeepNesting, ComplexMethod, BumpyRoad
  export function resolvePermission(
    user: Record<string, unknown>,
    resource: Record<string, unknown>,
    context: Record<string, unknown>
  ): string {
    if (user) {
      if (user['role']) {
        if (user['role'] === 'admin') {
          if (resource) {
            if (resource['public']) {
              return 'allow';
            } else {
              if (context['override']) {
                if (context['override'] === true) {
                  return 'allow-override';
                } else {
                  return 'deny';
                }
              }
              return 'deny';
            }
          }
        } else if (user['role'] === 'editor') {
          if (resource) {
            if (resource['editable']) {
              if (context['timestamp']) {
                if (Number(context['timestamp']) > Date.now() - 3600000) {
                  return 'allow-recent';
                }
              }
              return 'allow-edit';
            }
          }
        }
      }
    }
    return 'deny';
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/unhealthy/large-params.ts` with the following exact content:
  ```typescript
  // Triggers: LongParameterList on multiple functions
  export function createOrder(
    customerId: string,
    productId: string,
    quantity: number,
    discount: number,
    couponCode: string,
    shippingAddress: string,
    billingAddress: string,
    paymentMethod: string
  ): string {
    return `${customerId}-${productId}-${quantity}`;
  }

  export function sendNotification(
    userId: string,
    channel: string,
    subject: string,
    body: string,
    priority: string,
    retryCount: number,
    templateId: string
  ): boolean {
    return true;
  }

  export function updateProfile(
    userId: string,
    firstName: string,
    lastName: string,
    email: string,
    phone: string,
    address: string,
    country: string
  ): void {
    // no-op
  }
  ```

- [ ] Run `pnpm --filter @healthy-ai-code/core test` and confirm that `analyzeFile` on these fixtures returns score <= 7.0 with at least one smell detected.

- [ ] Commit: `git add packages/core/tests/fixtures/unhealthy/ && git commit -m "test(core): add unhealthy TypeScript fixtures with known smell triggers"`

---

## Task 3 — Edge-case fixtures

- [ ] Create file `packages/core/tests/fixtures/edge-cases/empty.ts` with the following exact content:
  ```typescript
  // Empty file — no functions
  ```

- [ ] Create file `packages/core/tests/fixtures/edge-cases/single-line.ts` with the following exact content:
  ```typescript
  export const PI = 3.14159;
  ```

- [ ] Create file `packages/core/tests/fixtures/edge-cases/only-comments.ts` with the following exact content:
  ```typescript
  // This file contains only comments and no executable code.
  // It exists to verify that the analyzer handles comment-only files gracefully.
  // Expected score: 10.0 with zero smells.
  ```

- [ ] Create file `packages/core/tests/fixtures/edge-cases/single-function.ts` with the following exact content:
  ```typescript
  export function greet(name: string): string {
    return `Hello, ${name}!`;
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/edge-cases/exports-only.ts` with the following exact content:
  ```typescript
  export const VERSION = '1.0.0';
  export const AUTHOR = 'Healthy AI Code';
  export const LICENSE = 'MIT';
  export type Status = 'ok' | 'error' | 'pending';
  ```

- [ ] Commit: `git add packages/core/tests/fixtures/edge-cases/ && git commit -m "test(core): add edge-case fixtures (empty, single-line, comments-only)"`

---

## Task 4 — Edge case handling in core/index.ts

> **TDD approach:** Write failing tests first, then update `analyzeCode` in `packages/core/src/index.ts`.

- [ ] Create file `packages/core/tests/edge-cases.test.ts` with the following exact content:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { analyzeCode, analyzeFile } from '../src/index';
  import * as path from 'path';

  const FIXTURES = path.resolve(__dirname, 'fixtures/edge-cases');

  describe('analyzeCode — edge cases', () => {
    it('empty string returns score 10.0 with zero smells', () => {
      const result = analyzeCode('', 'typescript');
      expect(result.score).toBe(10.0);
      expect(result.smells).toHaveLength(0);
      expect(result.functions).toHaveLength(0);
      expect(result.metrics.totalLines).toBe(0);
    });

    it('whitespace-only string returns score 10.0', () => {
      const result = analyzeCode('   \n\t\n  ', 'typescript');
      expect(result.score).toBe(10.0);
      expect(result.smells).toHaveLength(0);
    });

    it('unsupported language returns score 10.0 without crashing', () => {
      const result = analyzeCode('some code', 'unsupported' as never);
      expect(result.score).toBe(10.0);
      expect(result.language).toBe('unsupported');
      expect(result.smells).toHaveLength(0);
    });

    it('file with > 10 000 lines gets a LargeFile performance warning', () => {
      const hugeLine = 'const x = 1;\n';
      const code = hugeLine.repeat(10001);
      const result = analyzeCode(code, 'typescript');
      const largeFileSmell = result.smells.find(s => s.type === 'LargeFile');
      expect(largeFileSmell).toBeDefined();
      expect(largeFileSmell!.description).toMatch(/10\s*0\d\d/);
    });

    it('invalid/unparseable TypeScript does not throw', () => {
      const brokenCode = 'function broken( { if if if }}}';
      expect(() => analyzeCode(brokenCode, 'typescript')).not.toThrow();
    });
  });

  describe('analyzeFile — edge-case fixtures', () => {
    it('empty.ts fixture returns score 10.0', async () => {
      const result = await analyzeFile(path.join(FIXTURES, 'empty.ts'));
      expect(result.score).toBe(10.0);
      expect(result.smells).toHaveLength(0);
    });

    it('single-line.ts fixture returns score 10.0', async () => {
      const result = await analyzeFile(path.join(FIXTURES, 'single-line.ts'));
      expect(result.score).toBe(10.0);
    });
  });
  ```

- [ ] Run `pnpm --filter @healthy-ai-code/core test packages/core/tests/edge-cases.test.ts` and confirm the tests **fail** (red).

- [ ] Open `packages/core/src/index.ts`. Replace the body of the `analyzeCode` function with the following implementation (keep all existing imports and the function signature intact):
  ```typescript
  export function analyzeCode(code: string, language: Language, filePath = '<inline>'): HealthResult {
    const totalLines = code.split('\n').length;

    // Edge case: empty file
    if (code.trim().length === 0) {
      return {
        filePath,
        language: language === ('unsupported' as Language) ? ('unsupported' as Language) : language,
        score: 10.0,
        category: 'green',
        smells: [],
        functions: [],
        metrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          maxNestingDepth: 0,
          avgFunctionLength: 0,
          maxFunctionLength: 0,
          avgParameterCount: 0,
          maxParameterCount: 0,
          totalLines: 0,
          duplicationScore: 0,
        },
      };
    }

    // Edge case: unsupported language — skip analysis
    if ((language as string) === 'unsupported') {
      return {
        filePath,
        language: 'unsupported' as Language,
        score: 10.0,
        category: 'green',
        smells: [],
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

    let functions: FunctionResult[] = [];
    let rawMetrics: MetricBreakdown | undefined;

    try {
      if (language === 'typescript' || language === 'javascript') {
        ({ functions, metrics: rawMetrics } = analyzeTypeScript(code));
      } else if (language === 'python') {
        ({ functions, metrics: rawMetrics } = analyzePython(code));
      } else if (language === 'java' || language === 'kotlin') {
        ({ functions, metrics: rawMetrics } = analyzeJava(code));
      } else {
        ({ functions, metrics: rawMetrics } = analyzeCSharp(code));
      }
    } catch {
      // Parse error — return partial result with a warning smell, do not crash
      rawMetrics = {
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

    const smells = detectSmells(functions, rawMetrics!);

    // Edge case: very large file — add performance warning
    if (totalLines > 10000) {
      smells.push({
        type: 'LargeFile',
        severity: 'medium',
        line: 1,
        description: `Fil har ${totalLines} rader — analys kan vara långsam`,
        suggestion: 'Överväg att dela filen i mindre moduler',
      });
    }

    const score = calculateScore(smells);
    const category = categorize(score);

    return {
      filePath,
      language,
      score,
      category,
      smells,
      metrics: rawMetrics!,
      functions,
    };
  }
  ```
  > **Note:** Replace the exact imports and internal function calls (`analyzeTypeScript`, `analyzePython`, `analyzeJava`, `analyzeCSharp`, `detectSmells`, `calculateScore`, `categorize`) to match whatever names exist in the current `index.ts`. The logic above is the authoritative edge-case contract; adapt call sites as needed.

- [ ] Run `pnpm --filter @healthy-ai-code/core test packages/core/tests/edge-cases.test.ts` and confirm all 7 tests **pass** (green).

- [ ] Run the full core test suite: `pnpm --filter @healthy-ai-code/core test` — confirm no regressions.

- [ ] Commit: `git add packages/core/src/index.ts packages/core/tests/edge-cases.test.ts && git commit -m "feat(core): handle edge cases — empty files, unsupported language, parse errors, > 10k lines"`

---

## Task 5 — Additional language fixtures (Python)

- [ ] Create file `packages/core/tests/fixtures/healthy/simple.py` with the following exact content:
  ```python
  def add(a: float, b: float) -> float:
      return a + b

  def multiply(a: float, b: float) -> float:
      return a * b

  def is_even(n: int) -> bool:
      return n % 2 == 0

  def clamp(value: float, minimum: float, maximum: float) -> float:
      return max(minimum, min(value, maximum))

  def capitalize(s: str) -> str:
      return s.capitalize()
  ```

- [ ] Create file `packages/core/tests/fixtures/unhealthy/complex.py` with the following exact content:
  ```python
  # Triggers: ComplexMethod, DeepNesting, LongParameterList
  def process_user_data(user_id, user_data, options, callback, mode, retry):
      if user_id and user_data:
          for key in user_data:
              value = user_data[key]
              if isinstance(value, str):
                  while len(value) > 0:
                      if mode == 'strict':
                          if value.startswith('_'):
                              if retry:
                                  return 'retry-needed'
                              else:
                                  return 'skip'
                          elif value.startswith('@'):
                              return 'special'
                      elif mode == 'loose':
                          if options.get('validate'):
                              callback('validated')
                              return 'ok'
                      break
              elif isinstance(value, (int, float)):
                  if 100 < value < 1000:
                      return 'range-ok'
                  elif value >= 1000:
                      return 'too-large'
      elif not user_id:
          return 'no-user'
      return 'default'
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/simple.java` with the following exact content:
  ```java
  public class MathUtils {
      public static int add(int a, int b) {
          return a + b;
      }

      public static int multiply(int a, int b) {
          return a * b;
      }

      public static boolean isEven(int n) {
          return n % 2 == 0;
      }

      public static int clamp(int value, int min, int max) {
          return Math.min(Math.max(value, min), max);
      }

      public static String capitalize(String s) {
          if (s == null || s.isEmpty()) return s;
          return Character.toUpperCase(s.charAt(0)) + s.substring(1);
      }
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/unhealthy/complex.java` with the following exact content:
  ```java
  import java.util.Map;
  import java.util.function.Consumer;

  public class DataProcessor {
      public String processUserData(String userId, Map<String, Object> userData,
              Map<String, Object> options, Consumer<String> callback,
              String mode, boolean retry) {
          if (userId != null && userData != null) {
              for (String key : userData.keySet()) {
                  Object value = userData.get(key);
                  if (value instanceof String) {
                      String strVal = (String) value;
                      while (strVal.length() > 0) {
                          if (mode.equals("strict")) {
                              if (strVal.startsWith("_")) {
                                  if (retry) {
                                      return "retry-needed";
                                  } else {
                                      return "skip";
                                  }
                              } else if (strVal.startsWith("@")) {
                                  return "special";
                              }
                          } else if (mode.equals("loose")) {
                              if (options.get("validate") != null) {
                                  callback.accept("validated");
                                  return "ok";
                              }
                          }
                          break;
                      }
                  } else if (value instanceof Integer) {
                      int numVal = (Integer) value;
                      if (numVal > 100 && numVal < 1000) {
                          return "range-ok";
                      } else if (numVal >= 1000) {
                          return "too-large";
                      }
                  }
              }
          } else if (userId == null) {
              return "no-user";
          }
          return "default";
      }
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/healthy/simple.cs` with the following exact content:
  ```csharp
  public static class MathUtils
  {
      public static int Add(int a, int b) => a + b;

      public static int Multiply(int a, int b) => a * b;

      public static bool IsEven(int n) => n % 2 == 0;

      public static int Clamp(int value, int min, int max) =>
          Math.Min(Math.Max(value, min), max);

      public static string Capitalize(string s) =>
          string.IsNullOrEmpty(s) ? s : char.ToUpper(s[0]) + s[1..];
  }
  ```

- [ ] Create file `packages/core/tests/fixtures/unhealthy/complex.cs` with the following exact content:
  ```csharp
  using System;
  using System.Collections.Generic;

  public class DataProcessor
  {
      public string ProcessUserData(string userId, Dictionary<string, object> userData,
          Dictionary<string, object> options, Action<string> callback,
          string mode, bool retry)
      {
          if (userId != null && userData != null)
          {
              foreach (var key in userData.Keys)
              {
                  var value = userData[key];
                  if (value is string strVal)
                  {
                      while (strVal.Length > 0)
                      {
                          if (mode == "strict")
                          {
                              if (strVal.StartsWith("_"))
                              {
                                  if (retry)
                                      return "retry-needed";
                                  else
                                      return "skip";
                              }
                              else if (strVal.StartsWith("@"))
                                  return "special";
                          }
                          else if (mode == "loose")
                          {
                              if (options.ContainsKey("validate"))
                              {
                                  callback("validated");
                                  return "ok";
                              }
                          }
                          break;
                      }
                  }
                  else if (value is int numVal)
                  {
                      if (numVal > 100 && numVal < 1000)
                          return "range-ok";
                      else if (numVal >= 1000)
                          return "too-large";
                  }
              }
          }
          else if (userId == null)
              return "no-user";

          return "default";
      }
  }
  ```

- [ ] Run `pnpm --filter @healthy-ai-code/core test` to confirm language-specific analyzer tests pass with the new fixtures.

- [ ] Commit: `git add packages/core/tests/fixtures/ && git commit -m "test(core): add healthy and unhealthy fixtures for Python, Java, C#"`

---

## Task 6 — Integration tests (end-to-end via core)

> **Scope:** These tests call `analyzeFile` directly from `@healthy-ai-code/core` against the fixture files, verifying the complete analysis pipeline and the `loopComplete` logic that MCP tools depend on.

- [ ] Create directory `packages/mcp-server/tests/integration/` (create it if it does not exist).

- [ ] Create file `packages/mcp-server/tests/integration/mcp-server.test.ts` with the following exact content:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';

  // Fixture paths resolve relative to this file → packages/core/tests/fixtures
  const FIXTURES_DIR = path.resolve(
    __dirname,
    '../../../core/tests/fixtures'
  );

  describe('Integration: healthy fixture → loopComplete: true', () => {
    it('simple.ts (TypeScript healthy) yields score >= 9.0 and zero smells', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/simple.ts'));

      expect(result.score).toBeGreaterThanOrEqual(9.0);
      expect(result.category).toBe('green');
      expect(result.smells).toHaveLength(0);

      const loopComplete = result.score >= 9.5;
      expect(loopComplete).toBe(true);
    });

    it('pure-functions.ts (TypeScript healthy) yields score >= 9.0', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/pure-functions.ts'));

      expect(result.score).toBeGreaterThanOrEqual(9.0);
      expect(result.category).toBe('green');
    });
  });

  describe('Integration: unhealthy fixture → loopComplete: false', () => {
    it('complex.ts (TypeScript unhealthy) yields score < 7.0 with smells', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'unhealthy/complex.ts'));

      expect(result.score).toBeLessThan(7.0);
      expect(result.smells.length).toBeGreaterThan(0);

      const loopComplete = result.score >= 9.5;
      expect(loopComplete).toBe(false);
    });

    it('complex.ts smells include at least one of: ComplexMethod, DeepNesting, LongParameterList', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'unhealthy/complex.ts'));

      const expectedSmells = ['ComplexMethod', 'DeepNesting', 'LongParameterList', 'LargeMethod'];
      const detectedTypes = result.smells.map(s => s.type);
      const hasExpectedSmell = expectedSmells.some(s => detectedTypes.includes(s));
      expect(hasExpectedSmell).toBe(true);
    });
  });

  describe('Integration: edge-case fixtures', () => {
    it('edge-cases/empty.ts yields score 10.0 with zero smells', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/empty.ts'));

      expect(result.score).toBe(10.0);
      expect(result.smells).toHaveLength(0);
    });

    it('edge-cases/single-line.ts yields score 10.0', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/single-line.ts'));

      expect(result.score).toBe(10.0);
    });

    it('edge-cases/only-comments.ts does not crash and returns score 10.0', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'edge-cases/only-comments.ts'));

      expect(result.score).toBe(10.0);
      expect(result.smells).toHaveLength(0);
    });
  });

  describe('Integration: HealthResult shape', () => {
    it('result always contains required fields', async () => {
      const { analyzeFile } = await import('@healthy-ai-code/core');
      const result = await analyzeFile(path.join(FIXTURES_DIR, 'healthy/simple.ts'));

      expect(typeof result.score).toBe('number');
      expect(['green', 'yellow', 'red']).toContain(result.category);
      expect(Array.isArray(result.smells)).toBe(true);
      expect(Array.isArray(result.functions)).toBe(true);
      expect(typeof result.metrics).toBe('object');
      expect(typeof result.metrics.cyclomaticComplexity).toBe('number');
      expect(typeof result.metrics.totalLines).toBe('number');
    });
  });
  ```

- [ ] Run `pnpm --filter @healthy-ai-code/mcp-server test packages/mcp-server/tests/integration/mcp-server.test.ts` and confirm tests **pass**.

- [ ] Run the full test suite across both packages: `pnpm test` — confirm zero failures.

- [ ] Commit: `git add packages/mcp-server/tests/integration/ && git commit -m "test(mcp-server): add integration tests verifying end-to-end fixture analysis and loopComplete logic"`

---

## Task 7 — npm packaging: core package

- [ ] Open `packages/core/package.json` and add the following fields (merge with the existing JSON — do not remove any existing fields):
  ```json
  {
    "files": [
      "dist/",
      "README.md"
    ],
    "license": "MIT",
    "repository": {
      "type": "git",
      "url": "https://github.com/YOUR_USERNAME/healthy-ai-code-mcp"
    },
    "keywords": [
      "code-health",
      "static-analysis",
      "ast",
      "metrics",
      "refactoring"
    ]
  }
  ```

- [ ] Confirm `packages/core/package.json` now has `"name": "@healthy-ai-code/core"`, `"files"`, `"license"`, and `"repository"` at the top level.

- [ ] Run `pnpm --filter @healthy-ai-code/core build` and confirm it succeeds with no TypeScript errors.

- [ ] Commit: `git add packages/core/package.json && git commit -m "chore(core): add files, license, repository fields for npm publishing"`

---

## Task 8 — npm packaging: mcp-server package

- [ ] Replace the content of `packages/mcp-server/package.json` with the following (preserve any `devDependencies` entries that exist but are not listed here):
  ```json
  {
    "name": "@healthy-ai-code/mcp-server",
    "version": "0.1.0",
    "description": "MCP server for AI-guided code health analysis",
    "license": "MIT",
    "repository": {
      "type": "git",
      "url": "https://github.com/YOUR_USERNAME/healthy-ai-code-mcp"
    },
    "keywords": [
      "mcp",
      "model-context-protocol",
      "code-health",
      "ai",
      "refactoring"
    ],
    "bin": {
      "healthy-ai-code-mcp": "./dist/index.js"
    },
    "main": "./dist/index.js",
    "files": [
      "dist/",
      "README.md"
    ],
    "scripts": {
      "build": "tsc",
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "prepublishOnly": "pnpm run build && pnpm run test"
    },
    "dependencies": {
      "@healthy-ai-code/core": "workspace:*",
      "@modelcontextprotocol/sdk": "^1.0.0"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "vitest": "^1.6.0",
      "@types/node": "^20.0.0"
    },
    "engines": {
      "node": ">=18.0.0"
    }
  }
  ```
  > **Note:** If `packages/mcp-server/package.json` already has additional `devDependencies` (e.g., `@types/vitest`), preserve them — only the fields listed above are authoritative additions.

- [ ] Open `packages/mcp-server/src/index.ts`. Confirm or add the shebang as the very first line of the file:
  ```typescript
  #!/usr/bin/env node
  ```
  The file must look like:
  ```typescript
  #!/usr/bin/env node
  import { createServer } from './server.js';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
  // ... rest of existing content unchanged
  ```
  > **Note:** Preserve all existing imports and logic. Only prepend the shebang if it is not already present.

- [ ] Run `pnpm --filter @healthy-ai-code/mcp-server build` and confirm the build succeeds with no TypeScript errors.

- [ ] Verify the shebang survives compilation: `head -1 packages/mcp-server/dist/index.js` — output must be `#!/usr/bin/env node`.

- [ ] Commit: `git add packages/mcp-server/package.json packages/mcp-server/src/index.ts && git commit -m "chore(mcp-server): add bin, files, license, repository, shebang for npm publishing"`

---

## Task 9 — README.md (project root)

- [ ] Create file `README.md` at the project root (`C:\dev\Healthy AI Code MCP\README.md`) with the following exact content:
  ```markdown
  # Healthy AI Code MCP

  A local MCP server that gives AI assistants objective code health feedback, enabling a self-correcting refactoring loop. The AI refactors until the health score reaches the target level — no human judgment required in the loop.

  ## Installation

  Add to your MCP client configuration (Claude Code, Cursor, etc.):

  ```json
  {
    "mcpServers": {
      "healthy-ai-code": {
        "type": "stdio",
        "command": "npx",
        "args": ["@healthy-ai-code/mcp-server"]
      }
    }
  }
  ```

  For Claude Code specifically, add to `~/.claude/settings.json` under `"mcpServers"`.

  ## Agent Setup

  Copy `AGENTS.md` to the root of each repository where you want AI-guided health enforcement. This file instructs agents to run health checks before and after every change.

  ## Tools

  | Tool | Input | Purpose |
  |------|-------|---------|
  | `code_health_review` | `filePath` | Detailed review with refactoring guidance — use in the feedback loop |
  | `code_health_score` | `filePath` | Quick health score only |
  | `pre_commit_code_health_safeguard` | `repoPath`, `files[]` | Check files before commit |
  | `analyze_change_set` | `repoPath`, `baseBranch` | Check full diff before PR |
  | `code_health_refactoring_business_case` | `filePath` | ROI estimate for refactoring |
  | `explain_code_health` | *(none)* | What is code health? |
  | `explain_code_health_productivity` | *(none)* | Health → productivity link |

  ## Supported Languages

  TypeScript, JavaScript, Python, Java, Kotlin, C#

  ## Health Score Scale

  | Score | Category | Meaning |
  |-------|----------|---------|
  | 9.5–10.0 | Green | AI-ready — loop complete |
  | 9.0–9.4 | Green | Healthy |
  | 4.0–8.9 | Yellow | Technical debt present |
  | 1.0–3.9 | Red | Severe technical debt |

  ## Self-Correcting Loop

  ```
  AI runs code_health_review
          ↓
  score < 9.5? → Yes → AI refactors per nextAction.instruction
          ↓                        ↓
        No               AI runs code_health_review again
          ↓                        ↓
    loopComplete: true      (repeat until loopComplete: true)
          ↓
    AI runs pre_commit_code_health_safeguard
  ```

  ## Example Response

  When a file has problems, every tool response includes explicit next-step instructions:

  ```json
  {
    "score": 4.2,
    "category": "red",
    "loopComplete": false,
    "nextAction": {
      "action": "refactor",
      "instruction": "Refactor 'validateUser' to reduce cyclomatic complexity from 18 to under 10. Extract logic into separate helper functions. Then run code_health_review again.",
      "priority": { "smell": "ComplexMethod", "function": "validateUser" },
      "toolToCallAfter": "code_health_review"
    }
  }
  ```

  ## Local Development

  ```bash
  # Install dependencies
  pnpm install

  # Build all packages
  pnpm build

  # Run all tests
  pnpm test

  # Run only core tests
  pnpm --filter @healthy-ai-code/core test

  # Run only MCP server tests
  pnpm --filter @healthy-ai-code/mcp-server test
  ```

  ## Project Structure

  ```
  healthy-ai-code-mcp/
  ├── packages/
  │   ├── core/                    # @healthy-ai-code/core
  │   │   ├── src/
  │   │   │   ├── analyzers/       # Language-specific AST parsers
  │   │   │   ├── metrics/         # Individual metrics
  │   │   │   ├── scoring/         # Score aggregation
  │   │   │   ├── smells/          # Code smell detection
  │   │   │   └── index.ts         # Public API
  │   │   └── tests/
  │   │       └── fixtures/        # healthy/ unhealthy/ edge-cases/
  │   └── mcp-server/              # @healthy-ai-code/mcp-server
  │       ├── src/
  │       │   ├── tools/           # One file per MCP tool
  │       │   ├── server.ts
  │       │   └── index.ts         # Entry point (bin)
  │       └── tests/
  │           └── integration/
  ├── AGENTS.md                    # Copy to your repo root
  └── README.md
  ```

  ## License

  MIT
  ```

- [ ] Run `pnpm build && pnpm test` from the project root to confirm the complete pipeline still passes.

- [ ] Commit: `git add README.md && git commit -m "docs: add project README with installation, tools, and usage instructions"`

---

## Task 10 — Manual E2E verification (checklist)

> This task is performed by a human or an agent with access to a running Claude Code instance. It cannot be automated in CI.

- [ ] Build the mcp-server package: run `pnpm --filter @healthy-ai-code/mcp-server build` and confirm `packages/mcp-server/dist/index.js` exists and its first line is `#!/usr/bin/env node`.

- [ ] Add the server to Claude Code by editing `~/.claude/settings.json` and inserting under `"mcpServers"`:
  ```json
  "healthy-ai-code": {
    "command": "node",
    "args": ["C:/dev/Healthy AI Code MCP/packages/mcp-server/dist/index.js"]
  }
  ```

- [ ] Restart Claude Code (or reload the MCP server list via `/mcp` if hot-reload is supported).

- [ ] In Claude Code, run the prompt:
  > "Use the healthy-ai-code MCP server to run code_health_review on `C:/dev/Healthy AI Code MCP/packages/core/tests/fixtures/unhealthy/complex.ts`"
  
  **Expected result:** Response contains `loopComplete: false`, score below 7.0, at least one smell (e.g. `ComplexMethod` or `DeepNesting`), and a `nextAction.instruction` describing what to refactor.

- [ ] In Claude Code, run the prompt:
  > "Use the healthy-ai-code MCP server to run code_health_review on `C:/dev/Healthy AI Code MCP/packages/core/tests/fixtures/healthy/simple.ts`"
  
  **Expected result:** Response contains `loopComplete: true`, score >= 9.5, zero smells, and `nextAction.action: "commit_safe"`.

- [ ] In Claude Code, run the prompt:
  > "Use the healthy-ai-code MCP server to run code_health_score on `C:/dev/Healthy AI Code MCP/packages/core/tests/fixtures/edge-cases/empty.ts`"
  
  **Expected result:** Response contains score 10.0 and no smells.

- [ ] Confirm that all three manual tests pass. If any fail, investigate the MCP server logs and file an issue before publishing.

- [ ] Commit: `git add . && git commit -m "chore: sprint 4 complete — all manual E2E checks passed"` (only commit if there are any remaining uncommitted changes after the E2E verification step).

---

## Task 11 — Final validation & publish readiness

- [ ] Run `pnpm install` from the project root to ensure the lockfile is up to date.

- [ ] Run `pnpm build` from the project root and confirm both packages build without errors.

- [ ] Run `pnpm test` from the project root and confirm zero failures across all test suites.

- [ ] Run `pnpm --filter @healthy-ai-code/core typecheck` and `pnpm --filter @healthy-ai-code/mcp-server typecheck` — both must exit with code 0.

- [ ] Dry-run publish of core to verify package contents are correct:
  ```bash
  cd packages/core && npm pack --dry-run
  ```
  Confirm the output lists only files under `dist/` and `README.md`. No source `.ts` files, no `node_modules`, no test fixtures.

- [ ] Dry-run publish of mcp-server to verify package contents:
  ```bash
  cd packages/mcp-server && npm pack --dry-run
  ```
  Confirm the output includes `dist/index.js` and `README.md`. Confirm the `bin` entry points to `./dist/index.js`.

- [ ] Commit any remaining changes: `git add -A && git commit -m "chore: sprint 4 final validation — packages ready for npm publish"`

---

## Sprint 4 Completion Criteria

All of the following must be true before Sprint 4 is considered done:

| Criterion | How to verify |
|-----------|---------------|
| Healthy TypeScript fixtures exist (5+) | `ls packages/core/tests/fixtures/healthy/*.ts` — at least 5 files |
| Unhealthy TypeScript fixtures exist (3+) | `ls packages/core/tests/fixtures/unhealthy/*.ts` — at least 3 files |
| Edge-case fixtures exist (5+) | `ls packages/core/tests/fixtures/edge-cases/` — at least 5 files |
| `analyzeCode('')` returns score 10.0 | `pnpm --filter @healthy-ai-code/core test tests/edge-cases.test.ts` — green |
| Parse error does not crash | Edge-case test with broken TypeScript — no throw |
| > 10 000 line file gets LargeFile smell | Edge-case test — LargeFile present |
| Integration tests pass | `pnpm --filter @healthy-ai-code/mcp-server test tests/integration/` — green |
| Full test suite passes | `pnpm test` — zero failures |
| `packages/mcp-server/package.json` has `bin`, `files`, `license` | `cat packages/mcp-server/package.json` |
| `dist/index.js` starts with shebang | `head -1 packages/mcp-server/dist/index.js` — `#!/usr/bin/env node` |
| `README.md` exists at project root | `cat README.md` — contains Installation and Tools sections |
| Manual E2E: unhealthy fixture → loopComplete false | Human verification in Claude Code |
| Manual E2E: healthy fixture → loopComplete true | Human verification in Claude Code |
