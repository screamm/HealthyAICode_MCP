#!/usr/bin/env node
/**
 * Score all unhealthy fixtures using the mechanical loop to see how far we get without AI.
 * Then identify which ones are good candidates for AI loop testing.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Module, createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DIST_INDEX = join(REPO_ROOT, 'packages/core/dist/index.js');

const require = createRequire(DIST_INDEX);
const csharpPath = require.resolve('tree-sitter-c-sharp');
const csharpMod = await import(pathToFileURL(csharpPath).href);
Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
const core = await import(pathToFileURL(DIST_INDEX).href);
const { analyzeCode, runRefactoringLoop } = core;

const EXT_TO_LANG = { ts: 'typescript', js: 'javascript', py: 'python', java: 'java', rb: 'ruby', go: 'go' };

const DIRS = [
  join(REPO_ROOT, 'packages/core/tests/fixtures/unhealthy'),
];

console.log('\n' + '═'.repeat(80));
console.log('  FIXTURE SCORING + MECHANICAL LOOP TEST');
console.log('═'.repeat(80));

for (const dir of DIRS) {
  const files = (await readdir(dir)).filter(f => EXT_TO_LANG[extname(f).slice(1)]);
  for (const f of files) {
    const fp = join(dir, f);
    const lang = EXT_TO_LANG[extname(f).slice(1)];
    const code = await readFile(fp, 'utf-8');
    const before = analyzeCode(code, lang, fp);
    const loop = runRefactoringLoop(code, lang, fp);

    const flag = loop.loopComplete ? '✅ DONE' : `⚠️  ${loop.finalScore.toFixed(1)}`;
    console.log(`\n  ${f}`);
    console.log(`    Before:  ${before.score.toFixed(1)} (${before.smells.length} smells)`);
    console.log(`    Mech loop: ${before.score.toFixed(1)} → ${loop.finalScore.toFixed(1)}  [${loop.steps.length} steps]  ${flag}`);
    if (loop.loopComplete) {
      console.log(`    → loopComplete: true ✅`);
    } else {
      const remaining = analyzeCode(loop.finalCode, lang, fp);
      const topSmells = remaining.smells.slice(0, 3).map(s => `${s.type}(${s.severity})`).join(', ');
      console.log(`    → Remaining smells: ${topSmells}`);
    }
  }
}

console.log('\n' + '═'.repeat(80));
