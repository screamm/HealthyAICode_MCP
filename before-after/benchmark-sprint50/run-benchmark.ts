/**
 * Benchmark: measures baseline health scores on the three bad-code test files.
 * Run with: pnpm tsx before-after/benchmark-sprint50/run-benchmark.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCode, analyzeForAutoRefactor } from '../../packages/core/src/index.js';
import type { Language } from '../../packages/core/src/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const files: Array<{ file: string; language: Language }> = [
  { file: 'bad-typescript.ts', language: 'typescript' },
  { file: 'bad-python.py',     language: 'python'     },
  { file: 'bad-go.go',         language: 'go'         },
];

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Healthy AI Code MCP — Benchmark (Sprint 50 baseline)');
console.log('═══════════════════════════════════════════════════════════════\n');

interface BenchResult {
  file: string;
  language: string;
  score: number;
  category: string;
  smells: number;
  smellBreakdown: [string, number][];
  nextSmell: string;
}

const results: BenchResult[] = [];

for (const { file, language } of files) {
  const filePath = join(__dir, file);
  const code = readFileSync(filePath, 'utf-8');
  const result = analyzeCode(code, language, filePath);
  const refactor = analyzeForAutoRefactor(code, language, filePath);

  const smellMap: Record<string, number> = {};
  for (const s of result.smells) {
    smellMap[s.type] = (smellMap[s.type] ?? 0) + 1;
  }
  const smellSummary = Object.entries(smellMap).sort((a, b) => b[1] - a[1]);

  console.log(`File     : ${file} (${language})`);
  console.log(`Score    : ${result.score.toFixed(2)} / 10  [${result.category}]`);
  console.log(`Smells   : ${result.smells.length} total`);
  console.log('Top smells:');
  for (const [type, count] of smellSummary.slice(0, 6)) {
    console.log(`  ${type.padEnd(30)} x${count}`);
  }
  if (refactor) {
    console.log(`Next fix : ${refactor.smell.type} in '${refactor.targetFunction}' (${refactor.successLikelihood}, ${refactor.changeScope}-scope)`);
    console.log(`Predicted: ${refactor.predictedScoreDelta} -> ${refactor.predictedHealthScore.toFixed(1)}`);
    console.log(`Budget   : ${refactor.iterationBudget} iterations max`);
  }
  console.log();

  results.push({
    file,
    language,
    score: result.score,
    category: result.category,
    smells: result.smells.length,
    smellBreakdown: smellSummary,
    nextSmell: refactor ? refactor.smell.type : 'none',
  });
}

console.log('Summary');
console.log('  ' + '─'.repeat(64));
console.log('  File                    Lang         Score  Category       Smells');
console.log('  ' + '─'.repeat(64));
for (const r of results) {
  const name = r.file.padEnd(24);
  const lang = r.language.padEnd(12);
  const score = r.score.toFixed(2).padStart(5);
  const cat = r.category.padEnd(14);
  console.log(`  ${name} ${lang} ${score}  ${cat} ${r.smells}`);
}
console.log();
