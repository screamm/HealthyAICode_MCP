#!/usr/bin/env node
// Benchmark: measures baseline health scores on the three bad-code test files.
// Run with: node before-after/benchmark-sprint50/run-benchmark.cjs
'use strict';

const { readFileSync } = require('fs');
const { join } = require('path');
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
  const filePath = join(__dirname, file);
  const code = readFileSync(filePath, 'utf-8');
  const result = analyzeCode(code, language, filePath);
  const refactor = analyzeForAutoRefactor(code, language, filePath);

  const smellMap = {};
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
    console.log(`Effort   : ${refactor.successLikelihood} — iterationBudget: ${refactor.iterationBudget}`);
  }
  console.log();

  results.push({
    file, language,
    score: result.score,
    category: result.category,
    smells: result.smells.length,
    smellBreakdown: smellSummary,
    nextSmell: refactor ? refactor.smell.type : 'none',
  });
}

console.log('Summary');
console.log('  ' + '─'.repeat(62));
console.log('  File                    Lang         Score  Category       Smells');
console.log('  ' + '─'.repeat(62));
for (const r of results) {
  const name = r.file.padEnd(24);
  const lang = r.language.padEnd(12);
  const score = r.score.toFixed(2).padStart(5);
  const cat = r.category.padEnd(14);
  console.log(`  ${name} ${lang} ${score}  ${cat} ${r.smells}`);
}
console.log();
