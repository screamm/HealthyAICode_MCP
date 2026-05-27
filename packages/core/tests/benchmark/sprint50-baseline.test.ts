/**
 * Benchmark: measures baseline health scores on the three bad-code files.
 * Run with: pnpm --filter @healthy-ai-code/core test
 *
 * Fixture files live in before-after/benchmark-sprint50/.
 * This test only measures — thresholds confirm the files are sufficiently bad.
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
    console.log(`  Next  : ${refactor.smell.type} in '${refactor.targetFunction}' → ${refactor.predictedScoreDelta} (budget ${refactor.iterationBudget})`);
  return { result, refactor };
}

describe('Sprint 50 benchmark — baseline scores', () => {
  it('TypeScript bad-code: score < 6, smells > 5', () => {
    const { result } = printBreakdown('bad-typescript.ts', 'typescript');
    expect(result.score).toBeLessThan(6.0);
    expect(result.smells.length).toBeGreaterThan(5);
  });

  it('Python bad-code: score < 6, smells > 5', () => {
    const { result } = printBreakdown('bad-python.py', 'python');
    expect(result.score).toBeLessThan(6.0);
    expect(result.smells.length).toBeGreaterThan(5);
  });

  it('Go bad-code: score < 6, smells > 5', () => {
    const { result } = printBreakdown('bad-go.go', 'go');
    expect(result.score).toBeLessThan(6.0);
    expect(result.smells.length).toBeGreaterThan(5);
  });

  it('prints full summary table', () => {
    const langs: Array<{ file: string; language: Language }> = [
      { file: 'bad-typescript.ts', language: 'typescript' },
      { file: 'bad-python.py',     language: 'python'     },
      { file: 'bad-go.go',         language: 'go'         },
    ];
    console.log('\n  ═══════════════════════════════════════════════════════════');
    console.log('  Healthy AI Code MCP — Sprint 50 Benchmark (BEFORE)');
    console.log('  File                    Score  Category       Smells  NextFix');
    console.log('  ' + '─'.repeat(70));
    for (const { file, language } of langs) {
      const { result, refactor } = bench(file, language);
      const name = file.padEnd(24);
      const score = result.score.toFixed(2).padStart(5);
      const cat = result.category.padEnd(14);
      const next = refactor ? refactor.smell.type : '—';
      console.log(`  ${name} ${score}  ${cat} ${String(result.smells.length).padEnd(7)} ${next}`);
    }
    console.log('  ═══════════════════════════════════════════════════════════\n');
    expect(true).toBe(true);
  });
});
