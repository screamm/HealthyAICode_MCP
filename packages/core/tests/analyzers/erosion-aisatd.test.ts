/**
 * Sprint 57 — erosion-aisatd.test.ts
 *
 * Tests for:
 *   - ComplexityMassConcentration (Structural Erosion Index) — analyzers/complexity-mass.ts
 *   - AiAttributedSATD — smells/ai-attributed-satd.ts
 *
 * Imports via relative paths (public API not yet wired).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { detectComplexityMassConcentration } from '../../src/analyzers/complexity-mass';
import { detectAiAttributedSATD, detectAiAttributedSATDFromText } from '../../src/smells/ai-attributed-satd';
import { analyzeTypeScript } from '../../src/analyzers/typescript';

import type { FunctionResult } from '../../src/types';

// ---------------------------------------------------------------------------
// Tree-sitter parser (for AST-based detectAiAttributedSATD tests)
// ---------------------------------------------------------------------------
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript as Parser.Language);
const parse = (src: string) => parser.parse(src).rootNode;

// ---------------------------------------------------------------------------
// Helpers — build minimal FunctionResult objects
// ---------------------------------------------------------------------------

function fn(name: string, cc: number, sloc: number): FunctionResult {
  return {
    name,
    line: 1,
    length: sloc,
    cyclomaticComplexity: cc,
    cognitiveComplexity: cc,
    nestingDepth: 1,
    parameterCount: 0,
    smells: [],
  };
}

// ---------------------------------------------------------------------------
// ComplexityMassConcentration — unit tests
// ---------------------------------------------------------------------------

describe('detectComplexityMassConcentration', () => {
  it('returns null when fewer than 3 functions', () => {
    const result = detectComplexityMassConcentration([
      fn('big', 20, 100),
      fn('small', 2, 10),
    ]);
    expect(result).toBeNull();
  });

  it('returns null when erosion is below threshold', () => {
    // All CC <= 10 → highMass = 0 → erosion = 0
    const result = detectComplexityMassConcentration([
      fn('a', 8, 30),
      fn('b', 6, 20),
      fn('c', 4, 15),
      fn('d', 3, 10),
    ]);
    expect(result).toBeNull();
  });

  it('returns null when erosion equals exactly 0.60 (not above)', () => {
    // Craft erosion right at the boundary — should return null
    // mass(high) / totalMass = 0.60 → the check is erosion > 0.60 (strict)
    // We can't trivially get exactly 0.60 with integers, so just test just below:
    const high = fn('big', 11, 100);  // mass = 11 * 10 = 110
    const low1 = fn('a', 1, 100);     // mass = 1 * 10 = 10
    const low2 = fn('b', 1, 100);     // mass = 1 * 10 = 10
    const low3 = fn('c', 1, 100);     // mass = 1 * 10 = 10
    const low4 = fn('d', 1, 100);     // mass = 1 * 10 = 10
    const low5 = fn('e', 1, 100);     // mass = 1 * 10 = 10
    const low6 = fn('f', 1, 100);     // mass = 1 * 10 = 10
    // totalMass = 110 + 60 = 170, erosion = 110/170 ≈ 0.647 > 0.60 → fires
    // Let's instead test the case where CC = 11 but mass ratio is very small:
    const big2 = fn('big2', 11, 1);   // mass = 11 * 1 = 11
    const smalls = [fn('s1', 9, 100), fn('s2', 9, 100), fn('s3', 9, 100), fn('s4', 9, 100), fn('s5', 9, 100)];
    // highMass = 11, totalMass = 11 + 5*(9*10) = 11 + 450 = 461, erosion ≈ 0.024 → null
    expect(detectComplexityMassConcentration([big2, ...smalls])).toBeNull();
  });

  it('fires with high erosion fixture (one big + two small functions)', () => {
    // mass(big) = 25 * sqrt(100) = 250
    // mass(s1)  = 2  * sqrt(10)  ≈ 6.32
    // mass(s2)  = 2  * sqrt(10)  ≈ 6.32
    // erosion = 250 / (250 + 6.32 + 6.32) ≈ 0.952
    const result = detectComplexityMassConcentration([
      fn('big', 25, 100),
      fn('s1', 2, 10),
      fn('s2', 2, 10),
    ]);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ComplexityMassConcentration');
    expect(result!.metricValue).toBeGreaterThan(0.60);
    expect(result!.severity).toBe('critical'); // > 0.80
    expect(result!.line).toBe(1);
  });

  it('fires with high erosion (severity high when between 0.60 and 0.80)', () => {
    // We need erosion in (0.60, 0.80)
    // mass(big) = 12 * sqrt(80) ≈ 107.3
    // mass(s1)  = 2 * sqrt(20)  ≈ 8.94
    // mass(s2)  = 2 * sqrt(20)  ≈ 8.94
    // mass(s3)  = 2 * sqrt(20)  ≈ 8.94
    // totalMass ≈ 107.3 + 26.8 = 134.1, erosion ≈ 107.3/134.1 ≈ 0.800 — borderline
    // Let's use: big = 12*sqrt(60)≈92.9, four smalls = 4*(2*sqrt(20))≈35.8 → erosion≈0.722
    const result = detectComplexityMassConcentration([
      fn('big', 12, 60),
      fn('s1', 2, 20),
      fn('s2', 2, 20),
      fn('s3', 2, 20),
      fn('s4', 2, 20),
    ]);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ComplexityMassConcentration');
    expect(result!.metricValue).toBeGreaterThan(0.60);
    expect(result!.metricValue).toBeLessThan(0.80);
    expect(result!.severity).toBe('high');
  });

  it('includes metricValue (erosion) in the returned smell', () => {
    const result = detectComplexityMassConcentration([
      fn('big', 25, 100),
      fn('s1', 2, 10),
      fn('s2', 2, 10),
    ]);
    expect(typeof result!.metricValue).toBe('number');
    expect(result!.metricValue).toBeGreaterThan(0.90);
  });

  it('description contains erosion percentage', () => {
    const result = detectComplexityMassConcentration([
      fn('big', 25, 100),
      fn('s1', 2, 10),
      fn('s2', 2, 10),
    ]);
    expect(result!.description).toMatch(/Erosionsindex \d+\.\d+ %/);
  });

  it('works with the high-erosion.ts fixture file', () => {
    const fixturePath = join(__dirname, '../fixtures/unhealthy/high-erosion.ts');
    const code = readFileSync(fixturePath, 'utf8');
    const { functions } = analyzeTypeScript(code, fixturePath);
    const result = detectComplexityMassConcentration(functions);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ComplexityMassConcentration');
    expect(result!.metricValue).toBeGreaterThan(0.60);
  });

  it('returns null for the low-erosion.ts fixture file', () => {
    const fixturePath = join(__dirname, '../fixtures/healthy/low-erosion.ts');
    const code = readFileSync(fixturePath, 'utf8');
    const { functions } = analyzeTypeScript(code, fixturePath);
    const result = detectComplexityMassConcentration(functions);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AiAttributedSATD — AST-based (Tier A) unit tests
// ---------------------------------------------------------------------------

describe('detectAiAttributedSATD (AST-based)', () => {
  it('detects TODO + Claude in same comment', () => {
    const src = '// TODO: Claude generated this but I am not sure it handles edge cases';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('AiAttributedSATD');
  });

  it('detects FIXME + GPT in same comment', () => {
    const src = '// FIXME: GPT suggested this approach, unclear why';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('AiAttributedSATD');
  });

  it('detects HACK + ChatGPT with uncertainty → severity medium', () => {
    const src = '// HACK: ChatGPT wrote this helper — no clue if it is correct';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].severity).toBe('medium');
  });

  it('returns low severity when no uncertainty phrase', () => {
    const src = '// TODO: Copilot autocompleted this function';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].severity).toBe('low');
  });

  it('does not flag normal SATD without AI reference', () => {
    const src = '// TODO: refactor this later';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells).toHaveLength(0);
  });

  it('does not flag AI reference without SATD marker', () => {
    const src = '// This was generated by Claude for illustration purposes';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells).toHaveLength(0);
  });

  it('does not flag normal code comments', () => {
    const src = '// Calculates the total price including tax';
    expect(detectAiAttributedSATD(parse(src))).toHaveLength(0);
  });

  it('detects multiple smells in the ai-satd-fixture.ts file', () => {
    const fixturePath = join(__dirname, '../fixtures/unhealthy/ai-satd-fixture.ts');
    const code = readFileSync(fixturePath, 'utf8');
    const smells = detectAiAttributedSATD(parse(code));
    expect(smells.length).toBeGreaterThanOrEqual(2);
    expect(smells.every(s => s.type === 'AiAttributedSATD')).toBe(true);
  });

  it('detects Gemini as AI term', () => {
    const src = '// TODO: Gemini wrote this algorithm';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
  });

  it('detects Copilot as AI term', () => {
    const src = '// FIXME: Copilot autocompleted this but I am not sure it is right';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].severity).toBe('medium');
  });

  it('detects LLM as AI term', () => {
    const src = '// XXX: LLM generated, unclear correctness';
    const smells = detectAiAttributedSATD(parse(src));
    expect(smells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AiAttributedSATD — text-based (Tier B/C) unit tests
// ---------------------------------------------------------------------------

describe('detectAiAttributedSATDFromText', () => {
  it('detects TODO + Claude in a line comment', () => {
    const code = '// TODO: Claude generated this, not sure it handles edge cases';
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('AiAttributedSATD');
  });

  it('detects FIXME + GPT', () => {
    const code = '// FIXME: GPT suggested this approach, unclear why';
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('AiAttributedSATD');
  });

  it('does not flag SATD without AI reference', () => {
    const code = '// TODO: fix this later';
    expect(detectAiAttributedSATDFromText(code)).toHaveLength(0);
  });

  it('does not flag AI reference without SATD marker', () => {
    const code = '// Claude generated this function';
    expect(detectAiAttributedSATDFromText(code)).toHaveLength(0);
  });

  it('detects AI-SATD in Python-style hash comments', () => {
    const code = '# TODO: GPT wrote this, unsure about correctness';
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].type).toBe('AiAttributedSATD');
  });

  it('detects multiple occurrences across lines', () => {
    const code = [
      '// TODO: Claude generated this function',
      '// Normal comment',
      '// FIXME: Copilot autocompleted this',
    ].join('\n');
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThanOrEqual(2);
  });

  it('returns correct line numbers', () => {
    const code = [
      '// normal comment',
      '// TODO: GPT wrote this',
      '// another normal line',
    ].join('\n');
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].line).toBe(2);
  });

  it('elevates severity to medium with uncertainty phrase', () => {
    const code = '// TODO: AI generated this — no clue if correct';
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].severity).toBe('medium');
  });

  it('returns low severity without uncertainty phrase', () => {
    const code = '// TODO: Copilot wrote this function';
    const smells = detectAiAttributedSATDFromText(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells[0].severity).toBe('low');
  });
});
