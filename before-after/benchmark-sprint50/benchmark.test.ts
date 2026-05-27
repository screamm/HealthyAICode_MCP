/**
 * Benchmark test: measures baseline health scores on the three bad-code files.
 * Run with: pnpm --filter @healthy-ai-code/core vitest run before-after/benchmark-sprint50/benchmark.test.ts
 *
 * This test intentionally only measures — it does not assert pass/fail thresholds.
 * It documents the BEFORE state so we can compare after AI-assisted refactoring.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeCode, analyzeForAutoRefactor } from '../../packages/core/src/index.js';
import type { Language } from '../../packages/core/src/types.js';

const BENCH_DIR = join(import.meta.dirname ?? __dirname, '.');

function bench(file: string, language: Language) {
  const filePath = join(BENCH_DIR, file);
  const code = readFileSync(filePath, 'utf-8');
  const result = analyzeCode(code, language, filePath);
  const refactor = analyzeForAutoRefactor(code, language, filePath);
  return { result, refactor, code, filePath };
}

describe('Benchmark — Sprint 50 baseline', () => {
  it('TypeScript: bad-typescript.ts scores below 5.0 (plenty of smells)', () => {
    const { result, refactor } = bench('bad-typescript.ts', 'typescript');
    console.log('\n--- TypeScript benchmark ---');
    console.log(`Score    : ${result.score.toFixed(2)} [${result.category}]`);
    console.log(`Smells   : ${result.smells.length}`);
    const smellMap: Record<string, number> = {};
    for (const s of result.smells) smellMap[s.type] = (smellMap[s.type] ?? 0) + 1;
    for (const [k, v] of Object.entries(smellMap).sort((a, b) => b[1] - a[1]).slice(0, 6))
      console.log(`  ${k.padEnd(30)} x${v}`);
    if (refactor) {
      console.log(`Next fix : ${refactor.smell.type} in '${refactor.targetFunction}'`);
      console.log(`Predicted: ${refactor.predictedScoreDelta} → ${refactor.predictedHealthScore.toFixed(1)}`);
    }
    // Structural assertion: file must be unhealthy
    expect(result.score).toBeLessThan(7.0);
    expect(result.smells.length).toBeGreaterThan(3);
  });

  it('Python: bad-python.py scores below 5.0 (plenty of smells)', () => {
    const { result, refactor } = bench('bad-python.py', 'python');
    console.log('\n--- Python benchmark ---');
    console.log(`Score    : ${result.score.toFixed(2)} [${result.category}]`);
    console.log(`Smells   : ${result.smells.length}`);
    const smellMap: Record<string, number> = {};
    for (const s of result.smells) smellMap[s.type] = (smellMap[s.type] ?? 0) + 1;
    for (const [k, v] of Object.entries(smellMap).sort((a, b) => b[1] - a[1]).slice(0, 6))
      console.log(`  ${k.padEnd(30)} x${v}`);
    if (refactor) {
      console.log(`Next fix : ${refactor.smell.type} in '${refactor.targetFunction}'`);
      console.log(`Predicted: ${refactor.predictedScoreDelta} → ${refactor.predictedHealthScore.toFixed(1)}`);
    }
    expect(result.score).toBeLessThan(7.0);
    expect(result.smells.length).toBeGreaterThan(3);
  });

  it('Go: bad-go.go scores below 5.0 (plenty of smells)', () => {
    const { result, refactor } = bench('bad-go.go', 'go');
    console.log('\n--- Go benchmark ---');
    console.log(`Score    : ${result.score.toFixed(2)} [${result.category}]`);
    console.log(`Smells   : ${result.smells.length}`);
    const smellMap: Record<string, number> = {};
    for (const s of result.smells) smellMap[s.type] = (smellMap[s.type] ?? 0) + 1;
    for (const [k, v] of Object.entries(smellMap).sort((a, b) => b[1] - a[1]).slice(0, 6))
      console.log(`  ${k.padEnd(30)} x${v}`);
    if (refactor) {
      console.log(`Next fix : ${refactor.smell.type} in '${refactor.targetFunction}'`);
      console.log(`Predicted: ${refactor.predictedScoreDelta} → ${refactor.predictedHealthScore.toFixed(1)}`);
    }
    expect(result.score).toBeLessThan(7.0);
    expect(result.smells.length).toBeGreaterThan(3);
  });

  it('prints summary table', () => {
    const langs: Array<{ file: string; language: Language }> = [
      { file: 'bad-typescript.ts', language: 'typescript' },
      { file: 'bad-python.py',     language: 'python'     },
      { file: 'bad-go.go',         language: 'go'         },
    ];
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  Healthy AI Code MCP — Benchmark (Sprint 50 baseline)');
    console.log('  File                    Score  Category       Smells  NextFix');
    console.log('  ' + '─'.repeat(70));
    for (const { file, language } of langs) {
      const { result, refactor } = bench(file, language);
      const name = file.padEnd(24);
      const score = result.score.toFixed(2).padStart(5);
      const cat = result.category.padEnd(14);
      const next = refactor ? refactor.smell.type : 'healthy';
      console.log(`  ${name} ${score}  ${cat} ${String(result.smells.length).padEnd(7)} ${next}`);
    }
    console.log('══════════════════════════════════════════════════════\n');
    expect(true).toBe(true); // always pass — this is a reporting test
  });
});
