#!/usr/bin/env node
/**
 * Benchmark script: measures initial health scores on the three bad-code test files.
 * Run with: node before-after/benchmark-sprint50/run-benchmark.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));

const { analyzeCode, analyzeForAutoRefactor } = require('../../packages/core/dist/index.js');

const files = [
  { file: 'bad-typescript.ts', language: 'typescript' },
  { file: 'bad-python.py',     language: 'python'     },
  { file: 'bad-go.go',         language: 'go'         },
];

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Healthy AI Code MCP — Benchmark (Sprint 50 baseline)');
console.log('═══════════════════════════════════════════════════════════════\n');

const results = [];

for (const { file, language } of files) {
  const filePath = join(__dir, file);
  const code = await readFile(filePath, 'utf-8');
  const result = analyzeCode(code, language, filePath);
  const refactor = analyzeForAutoRefactor(code, language, filePath);

  const smellSummary = Object.entries(
    result.smells.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  console.log(`📄 ${file} (${language})`);
  console.log(`   Score    : ${result.score.toFixed(2)} / 10  [${result.category}]`);
  console.log(`   Smells   : ${result.smells.length} total`);
  console.log(`   Top smells:`);
  for (const [type, count] of smellSummary.slice(0, 5)) {
    console.log(`     • ${type.padEnd(28)} ×${count}`);
  }
  if (refactor) {
    console.log(`   Next fix : ${refactor.smell.type} in '${refactor.targetFunction}' (${refactor.successLikelihood})`);
    console.log(`   Predicted: ${refactor.predictedScoreDelta} → ${refactor.predictedHealthScore}`);
  }
  console.log();

  results.push({ file, language, score: result.score, category: result.category, smells: result.smells.length, smellBreakdown: smellSummary });
}

console.log('Summary table:');
console.log('  File                    Score  Category       Smells');
console.log('  ' + '─'.repeat(60));
for (const r of results) {
  const name = r.file.padEnd(24);
  const score = r.score.toFixed(2).padStart(5);
  const cat = r.category.padEnd(14);
  console.log(`  ${name} ${score}  ${cat} ${r.smells}`);
}
console.log();
