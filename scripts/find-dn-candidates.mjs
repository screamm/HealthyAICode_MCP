#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname, extname, relative } from 'node:path';
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
const { analyzeCode, analyzeForAutoRefactor, applyAutoRefactor } = core;

const OUT = join(REPO_ROOT, 'before-after');
await mkdir(OUT, { recursive: true });

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('node_modules') && !entry.name.startsWith('dist') && !entry.name.startsWith('.') && !entry.name.startsWith('fixtures')) {
        yield* walk(full);
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      yield full;
    }
  }
}

const srcDirs = [
  join(REPO_ROOT, 'packages/core/src'),
  join(REPO_ROOT, 'packages/mcp-server/src'),
  join(REPO_ROOT, 'packages/vscode-extension/src'),
];

const results = [];
for (const dir of srcDirs) {
  for await (const file of walk(dir)) {
    try {
      const code = await readFile(file, 'utf-8');
      if (code.length < 100) continue;
      const result = analyzeCode(code, 'typescript', file);
      if (result.smells.length > 0) {
        const hasDeepNesting = result.smells.some(s => s.type === 'DeepNesting');
        const hasComplexCond = result.smells.some(s => s.type === 'ComplexConditional');
        if (hasDeepNesting || hasComplexCond) {
          const rel = relative(REPO_ROOT, file);
          const smells = result.smells.map(s => `${s.type}(${s.severity})`).join(', ');
          results.push({ path: rel, score: result.score, smells: result.smells, hasDeepNesting, hasComplexCond });
          console.log(`${rel}: score=${result.score.toFixed(1)} ${hasDeepNesting ? '🔥DN' : ''} ${hasComplexCond ? '🔥CC' : ''}`);
        }
      }
    } catch {}
  }
}

// For the best DeepNesting file, try applying early_return
console.log(`\n\n${'='.repeat(65)}`);
console.log('  Försöker tillämpa early_return på bästa kandidat...');
console.log('='.repeat(65));

const dnFiles = results.filter(r => r.hasDeepNesting).sort((a, b) => a.score - b.score);
if (dnFiles.length > 0) {
  const best = dnFiles[0];
  console.log(`\n  Bästa kandidat: ${best.path} (score=${best.score.toFixed(1)})`);
  const fullPath = join(REPO_ROOT, best.path);
  const code = await readFile(fullPath, 'utf-8');

  // Try each deep nesting function
  for (const s of best.smells) {
    if (s.type === 'DeepNesting') {
      const plan = analyzeForAutoRefactor(code, 'typescript', fullPath, 'DeepNesting');
      if (plan) {
        console.log(`\n  Målar: ${plan.targetFunction} (lines ${plan.startLine}–${plan.endLine})`);
        console.log(`  Strategi: ${plan.refactoringStrategy}`);
        const applied = applyAutoRefactor(code, plan);
        const after = analyzeCode(applied.transformedCode, 'typescript', fullPath);

        // Count real diffs
        const oLines = code.split('\n');
        const nLines = applied.transformedCode.split('\n');
        let diffs = 0;
        for (let i = 0; i < Math.max(oLines.length, nLines.length); i++) {
          if ((i < oLines.length ? oLines[i] : null) !== (i < nLines.length ? nLines[i] : null)) diffs++;
        }

        console.log(`  Ändringar: ${applied.changes.length} beskrivningar, ${diffs} diffrader`);
        console.log(`  Score: ${plan.currentHealthScore.toFixed(1)} → ${after.score.toFixed(1)} / 10.0`);
        console.log(`  Delta: ${(after.score - plan.currentHealthScore) >= 0 ? '+' : ''}${(after.score - plan.currentHealthScore).toFixed(1)}`);
        for (const c of applied.changes) {
          console.log(`    • ${c}`);
        }

        const safeName = relative(REPO_ROOT, fullPath).replace(/[\/\\]/g, '_').replace(/\.ts$/, '');
        await writeFile(join(OUT, `${safeName}.BEFORE.ts`), code, 'utf-8');
        await writeFile(join(OUT, `${safeName}.AFTER.ts`), applied.transformedCode, 'utf-8');
        console.log(`\n  💾 Sparat: ${join(OUT, `${safeName}.BEFORE.ts`)}`);
        console.log(`  💾 Sparat: ${join(OUT, `${safeName}.AFTER.ts`)}`);
      }
    }
  }
}
