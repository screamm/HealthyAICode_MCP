import { describe, it, expect } from 'vitest';
import { analyzeByLanguage } from '../../src/analyzers/index';
import type { Language } from '../../src/types';

const SNIPPETS: Record<string, string> = {
  typescript: 'function add(a: number, b: number): number { return a + b; }',
  javascript: 'function add(a, b) { return a + b; }',
  python: 'def add(a, b):\n  return a + b',
  java: 'public class A { public int add(int a, int b) { return a + b; } }',
  csharp: 'public class A { public int Add(int a, int b) => a + b; }',
  ruby: 'def add(a, b)\n  a + b\nend',
  rust: 'fn add(a: i32, b: i32) -> i32 { a + b }',
  go: 'package main\nfunc add(a, b int) int { return a + b }',
  php: '<?php function add($a, $b) { return $a + $b; }',
  kotlin: 'fun add(a: Int, b: Int): Int = a + b',
  swift: 'func add(a: Int, b: Int) -> Int { return a + b }',
  bash: 'function add() { echo $(($1 + $2)); }',
  lua: 'function add(a, b) return a + b end',
  dart: 'int add(int a, int b) { return a + b; }',
  c: 'int add(int a, int b) { return a + b; }',
  cpp: 'int add(int a, int b) { return a + b; }',
  scala: 'def add(a: Int, b: Int): Int = a + b',
  // Sprint 30 — niche languages
  cobol: 'ADD-SECTION SECTION.\n    IF WS-A > 0 PERFORM COMPUTE-SUM.\nCOMPUTE-SUM SECTION.\n    ADD WS-A TO WS-B.',
  apex: 'public class MathUtil {\n    public static Integer add(Integer a, Integer b) {\n        return a + b;\n    }\n}',
  fsharp: 'let add x y = x + y',
  vbnet: 'Public Function Add(a As Integer, b As Integer) As Integer\n    Return a + b\nEnd Function',
  perl: 'sub add {\n    my ($a, $b) = @_;\n    return $a + $b;\n}',
  groovy: 'def add(a, b) {\n    return a + b\n}',
  objc: '- (NSInteger)addA:(NSInteger)a toB:(NSInteger)b {\n    return a + b;\n}',
  powershell: 'function Add-Numbers {\n    param($a, $b)\n    return $a + $b\n}',
  erlang: 'add(A, B) -> A + B.',
  // Tier A — tree-sitter AST
  haskell: 'add :: Int -> Int -> Int\nadd x y = x + y',
  julia: 'function add(a, b)\n  return a + b\nend',
  ocaml: 'let add x y = x + y',
  // Tier B — new languages
  zig: 'fn add(a: i32, b: i32) i32 {\n    return a + b;\n}',
  nim: 'proc add(a, b: int): int =\n  return a + b',
  crystal: 'def add(a, b)\n  a + b\nend',
};

describe('analyzeByLanguage — all languages return valid metrics', () => {
  for (const [lang, snippet] of Object.entries(SNIPPETS)) {
    it(`${lang}: returns valid AnalyzeResult without throwing`, () => {
      const result = analyzeByLanguage(snippet, lang as Language, `test.${lang}`);
      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
      expect(result.metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(result.functions)).toBe(true);
      expect(Array.isArray(result.smells)).toBe(true);
    });
  }
});
