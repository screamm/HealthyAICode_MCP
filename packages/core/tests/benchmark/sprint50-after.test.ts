/**
 * Benchmark: measures AFTER health scores on the three refactored files.
 * Run with: pnpm --filter @healthy-ai-code/core test
 *
 * Fixture files live in before-after/benchmark-sprint50/.
 * This test asserts that refactored code reaches ≥ 9.5 (AI_READY_THRESHOLD).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { analyzeCode, analyzeForAutoRefactor } from '../../src/index.js';
import type { Language } from '../../src/types.js';

const BENCH_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../before-after/benchmark-sprint50'
);

function bench(file: string, language: Language) {
  const filePath = join(BENCH_DIR, file);
  const code = readFileSync(filePath, 'utf-8');
  const result = analyzeCode(code, language, filePath);
  const refactor = analyzeForAutoRefactor(code, language, filePath);
  return { result, refactor };
}

function printBreakdown(file: string, language: Language) {
  const { result, refactor } = bench(file, language);
  const smellMap: Record<string, number> = {};
  for (const s of result.smells) smellMap[s.type] = (smellMap[s.type] ?? 0) + 1;
  console.log(`\n  ${file} (${language})`);
  console.log(`  Score : ${result.score.toFixed(2)} / 10  [${result.category}]`);
  console.log(`  Smells: ${result.smells.length}`);
  for (const [k, v] of Object.entries(smellMap).sort((a, b) => b[1] - a[1]).slice(0, 6))
    console.log(`    ${k.padEnd(30)} x${v}`);
  if (refactor)
    console.log(`  Next  : ${refactor.smell.type} in '${refactor.targetFunction}' → ${refactor.predictedScoreDelta}`);
  else
    console.log(`  Next  : (none — code is healthy)`);
  return { result, refactor };
}

describe('Sprint 50 benchmark — AFTER scores (refactored)', () => {
  it('TypeScript good-code: score ≥ 9.5, smells ≤ 2', () => {
    const { result } = printBreakdown('good-typescript.ts', 'typescript');
    expect(result.score).toBeGreaterThanOrEqual(9.5);
    expect(result.smells.length).toBeLessThanOrEqual(2);
  });

  it('Python good-code: score ≥ 9.5, smells ≤ 2', () => {
    const { result } = printBreakdown('good-python.py', 'python');
    expect(result.score).toBeGreaterThanOrEqual(9.5);
    expect(result.smells.length).toBeLessThanOrEqual(2);
  });

  it('Go good-code: score ≥ 9.5, smells ≤ 2', () => {
    const { result } = printBreakdown('good-go.go', 'go');
    expect(result.score).toBeGreaterThanOrEqual(9.5);
    expect(result.smells.length).toBeLessThanOrEqual(2);
  });

  it('prints full BEFORE → AFTER comparison table', () => {
    const pairs: Array<{ before: string; after: string; language: Language }> = [
      { before: 'bad-typescript.ts', after: 'good-typescript.ts', language: 'typescript' },
      { before: 'bad-python.py',     after: 'good-python.py',     language: 'python'     },
      { before: 'bad-go.go',         after: 'good-go.go',         language: 'go'         },
    ];

    console.log('\n  ═══════════════════════════════════════════════════════════════════');
    console.log('  Healthy AI Code MCP — Sprint 50 Benchmark (BEFORE → AFTER)');
    console.log('  File                  BEFORE         AFTER         Δ Score  Smells↓');
    console.log('  ' + '─'.repeat(74));

    for (const { before, after, language } of pairs) {
      const { result: bResult } = bench(before, language);
      const { result: aResult } = bench(after, language);
      const delta = aResult.score - bResult.score;
      const name = after.replace('good-', '').padEnd(22);
      const bScore = bResult.score.toFixed(2).padStart(5);
      const aScore = aResult.score.toFixed(2).padStart(5);
      const deltaStr = `+${delta.toFixed(2)}`.padStart(7);
      const smellDelta = `${bResult.smells.length}→${aResult.smells.length}`.padEnd(8);
      console.log(`  ${name} ${bScore}          ${aScore}       ${deltaStr}  ${smellDelta}`);
    }

    console.log('  ═══════════════════════════════════════════════════════════════════\n');
    expect(true).toBe(true);
  });
});
