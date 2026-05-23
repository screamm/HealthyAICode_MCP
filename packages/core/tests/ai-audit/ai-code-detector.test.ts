// packages/core/tests/ai-audit/ai-code-detector.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectAiHeuristics,
  commentStyleScore,
  namingPatternScore,
  boilerplateScore,
  structureScore,
} from '../../src/ai-audit/heuristic-detector';
import { AI_GENERATED_SAMPLE, HUMAN_WRITTEN_SAMPLE, VERBOSE_STYLE_SAMPLE } from '../fixtures/ai-code-samples';

describe('commentStyleScore', () => {
  it('returns high score for AI sample with heavy comment coverage', () => {
    expect(commentStyleScore(AI_GENERATED_SAMPLE)).toBeGreaterThan(0.5);
  });

  it('returns low score for human-written sample with minimal comments', () => {
    expect(commentStyleScore(HUMAN_WRITTEN_SAMPLE)).toBeLessThan(0.5);
  });

  it('returns 0 for empty code', () => {
    expect(commentStyleScore('')).toBe(0);
  });

  it('returns high score for code with >30% comment lines', () => {
    const heavyComments = `
// This is a comment
// Another comment
// Yet another comment
// Fourth comment
const x = 1;
const y = 2;
    `.trim();
    expect(commentStyleScore(heavyComments)).toBeGreaterThan(0.5);
  });
});

describe('namingPatternScore', () => {
  it('returns positive score for "This function" comment pattern', () => {
    const code = '// This function handles user authentication';
    expect(namingPatternScore(code, 'typescript')).toBeGreaterThan(0);
  });

  it('returns positive score for "Helper function to" pattern', () => {
    const code = '// Helper function to validate input data';
    expect(namingPatternScore(code, 'typescript')).toBeGreaterThan(0);
  });

  it('returns higher score for multiple generic variable names', () => {
    const code = 'const result = {}; const data = {}; const response = {};';
    expect(namingPatternScore(code, 'typescript')).toBeGreaterThan(0);
  });

  it('returns 0 for code with no AI naming patterns', () => {
    const code = 'const userId = "abc"; const orderTotal = 100;';
    expect(namingPatternScore(code, 'typescript')).toBe(0);
  });
});

describe('boilerplateScore', () => {
  it('returns high score for AI boilerplate phrases', () => {
    const code = `
// Initialize result
const result = {};
// Main logic
doSomething();
// Return result
return result;
    `;
    expect(boilerplateScore(code)).toBeGreaterThan(0.2);
  });

  it('detects TODO: Add error handling pattern', () => {
    const code = '// TODO: Add error handling\nreturn value;';
    expect(boilerplateScore(code)).toBeGreaterThan(0);
  });

  it('returns 0 for clean human code without boilerplate', () => {
    const code = 'export function add(a: number, b: number): number { return a + b; }';
    expect(boilerplateScore(code)).toBe(0);
  });
});

describe('structureScore', () => {
  it('detects section divider comments', () => {
    const code = `
// --- Validation Section ---
const x = 1;
// --- Processing Section ---
const y = 2;
// --- Output Section ---
return y;
    `;
    expect(structureScore(code)).toBeGreaterThan(0.3);
  });

  it('returns 0 for plain code without section markers', () => {
    const code = 'function add(a: number, b: number) { return a + b; }';
    expect(structureScore(code)).toBe(0);
  });
});

describe('detectAiHeuristics', () => {
  it('detects AI-generated code signals — high confidence', () => {
    const code = `
// This function handles user authentication
// Helper function to validate input
function validateInput(data: unknown) {
  // Initialize result
  const result = {};
  const output = {};
  const response = {};
  // Main logic
  // Return result
  return result;
}`;
    const detection = detectAiHeuristics(code, 'auth.js', 'typescript');
    expect(detection.confidence).toBeGreaterThan(0.5);
    expect(detection.isLikelyAIGenerated).toBe(true);
  });

  it('returns high confidence for AI_GENERATED_SAMPLE', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns low confidence for HUMAN_WRITTEN_SAMPLE', () => {
    const result = detectAiHeuristics(HUMAN_WRITTEN_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('returns signals array with at least one entry', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('confidence is always in [0, 1]', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns 4 signals (one per heuristic)', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.signals).toHaveLength(4);
  });

  it('each signal has required fields', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    for (const signal of result.signals) {
      expect(signal).toHaveProperty('name');
      expect(signal).toHaveProperty('weight');
      expect(signal).toHaveProperty('score');
      expect(signal).toHaveProperty('evidence');
    }
  });

  it('returns correct filePath in result', () => {
    const result = detectAiHeuristics(HUMAN_WRITTEN_SAMPLE, 'src/my-file.ts', 'typescript');
    expect(result.filePath).toBe('src/my-file.ts');
  });

  it('VERBOSE_STYLE_SAMPLE gets high confidence', () => {
    const result = detectAiHeuristics(VERBOSE_STYLE_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});
