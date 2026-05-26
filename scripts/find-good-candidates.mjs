#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

const filesToTry = [
  'packages/mcp-server/src/tools/auto-refactor-apply.ts',
  'packages/core/src/smells/cognitive-complexity.ts',
  'packages/core/src/smells/complex-conditional.ts',
  'packages/core/src/analyzers/typescript.ts',
  'packages/core/src/analyzers/python.ts',
  'packages/mcp-server/src/tools/architecture-report.ts',
  'packages/core/src/scoring/scorer.ts',
  'packages/core/src/validation/dataset-runner.ts',
];

async function analyzeFile(filePath) {
  const code = await readFile(filePath, 'utf-8');
  const language = 'typescript';
  const result = analyzeCode(code, language, filePath);
  return { code, result };
}

for (const f of filesToTry) {
  const full = join(REPO_ROOT, f);
  try {
    const { code, result } = await analyzeFile(full);
    const hasDeepNesting = result.smells.some(s => s.type === 'DeepNesting');
    const hasComplexCond = result.smells.some(s => s.type === 'ComplexConditional');
    if (hasDeepNesting || hasComplexCond) {
      const allSmells = result.smells.map(s => `${s.type}(${s.severity})`).join(', ');
      console.log(`${f}: score=${result.score.toFixed(1)} ${hasDeepNesting ? '🔥DeepNesting' : ''} ${hasComplexCond ? '🔥ComplexConditional' : ''} — ${allSmells}`);
    }
  } catch {}
}
