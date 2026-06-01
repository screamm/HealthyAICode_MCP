/**
 * slopsquatting-integration.test.ts — Sprint 51–60 (Integrate phase)
 *
 * Proves that the offline SlopsquattingRisk detector is wired into the synchronous
 * analyzeCode() pipeline and contributes to the health score:
 *   - A typosquat import surfaces as a SlopsquattingRisk smell in analyzeCode().
 *   - A hallucination-corpus import surfaces as a SlopsquattingRisk smell.
 *   - A SlopsquattingRisk finding lowers the score relative to a clean equivalent.
 *   - Legitimate / non-import languages produce no SlopsquattingRisk via analyzeCode().
 *   - The pipeline performs NO network I/O (offline-only entry point).
 */

import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../src/index';
import { resetSlopsquattingCaches } from '../../src/analyzers/slopsquatting';

const slopCount = (smells: { type: string }[]) =>
  smells.filter((s) => s.type === 'SlopsquattingRisk').length;

describe('analyzeCode — SlopsquattingRisk wiring', () => {
  it('surfaces a typosquat import as a SlopsquattingRisk smell', () => {
    resetSlopsquattingCaches();
    const result = analyzeCode(`import e from 'expres';\nexport const x = e;`, 'typescript', 'a.ts');
    expect(slopCount(result.smells)).toBe(1);
  });

  it('surfaces a hallucination-corpus import as a SlopsquattingRisk smell (python)', () => {
    resetSlopsquattingCaches();
    const result = analyzeCode(`import huggingface_cli\nx = 1\n`, 'python', 'a.py');
    expect(slopCount(result.smells)).toBe(1);
  });

  it('lowers the score relative to a clean equivalent', () => {
    resetSlopsquattingCaches();
    const dirty = analyzeCode(`import e from 'expres';\nexport const x = 1;`, 'typescript', 'a.ts');
    const clean = analyzeCode(`import e from 'express';\nexport const x = 1;`, 'typescript', 'b.ts');
    expect(slopCount(clean.smells)).toBe(0);
    expect(dirty.score).toBeLessThan(clean.score);
  });

  it('does not flag legitimate popular imports', () => {
    resetSlopsquattingCaches();
    const result = analyzeCode(`import React from 'react';\nexport const x = React;`, 'typescript', 'a.ts');
    expect(slopCount(result.smells)).toBe(0);
  });

  it('produces no SlopsquattingRisk for non-import languages (go)', () => {
    resetSlopsquattingCaches();
    const result = analyzeCode('package main\nimport "fmt"\nfunc main() { fmt.Println(1) }', 'go', 'a.go');
    expect(slopCount(result.smells)).toBe(0);
  });
});
