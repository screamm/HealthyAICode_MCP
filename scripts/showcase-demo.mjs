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

async function transformAndShow(label, filePath, targetSmell, fileName) {
  const code = await readFile(filePath, 'utf-8');
  const lang = 'typescript';

  // Original analysis
  const orig = analyzeCode(code, lang, filePath);

  // Plan
  const plan = analyzeForAutoRefactor(code, lang, filePath, targetSmell);
  if (!plan) {
    console.log(`No ${targetSmell} smell found in ${filePath}`);
    return;
  }

  const applied = applyAutoRefactor(code, plan);

  const fullStrat = ['early_return', 'simplify_conditional'].includes(plan.refactoringStrategy);

  // After analysis
  const after = analyzeCode(applied.transformedCode, lang, filePath);

  // Find what changed
  const oLines = code.split('\n');
  const nLines = applied.transformedCode.split('\n');

  // Build a nice diff showing only the relevant function
  const fnStart = plan.startLine - 1;
  const fnEnd = plan.endLine - 1;

  // -- SHOW DIFF --
  console.log(`\n## ${label}`);
  console.log(`**File:** \`${filePath}\``);
  console.log(`**Target:** \`${plan.targetFunction}\` (lines ${plan.startLine}–${plan.endLine})`);
  console.log(`**Smell:** ${plan.smell.type} (${plan.severity}) → **Strategy:** \`${plan.refactoringStrategy}\` ${fullStrat ? '✅ FULL' : '⚠️ PARTIAL'}`);
  console.log(`**Score:** ${orig.score.toFixed(1)} → **${after.score.toFixed(1)}** / 10.0 *(${(after.score - orig.score) >= 0 ? '+' : ''}${(after.score - orig.score).toFixed(1)})*`);
  console.log(`**Original smells:** ${orig.smells.length} total | **Remaining after:** ${after.smells.length}`);

  // Print function before
  console.log(`\n### BEFORE — \`${plan.targetFunction}\``);
  console.log('```typescript');
  for (let i = fnStart; i <= fnEnd; i++) {
    console.log(oLines[i]);
  }
  console.log('```');

  // Print function after
  // The transformation changes line numbers (splice), so we need to find the equivalent range
  // Actually, simpler: just look at the function in the transformed code
  const aftFnStart = fnStart;
  const aftFnEnd = Math.min(aftFnStart + (fnEnd - fnStart) + 2, nLines.length - 1); // may shift

  console.log(`\n### AFTER — \`${plan.targetFunction}\``);
  console.log('```typescript');
  for (let i = aftFnStart; i <= aftFnEnd && i < nLines.length; i++) {
    console.log(nLines[i]);
  }
  console.log('```');

  // Annotated diff
  console.log(`\n### Detailed diff`);
  console.log('| Rad | Ändring |');
  console.log('|-----|---------|');
  let shown = 0;
  for (let i = 0; i < Math.max(oLines.length, nLines.length) && shown < 30; i++) {
    const o = i < oLines.length ? oLines[i] : null;
    const n = i < nLines.length ? nLines[i] : null;
    if (o !== n) {
      if (o !== null) {
        console.log(`| ${i + 1} | ~~\`${o.trimEnd()}\`~~ → **\`${n?.trimEnd() ?? ''}\`** |`);
        shown++;
      } else if (n !== null) {
        console.log(`| ${i + 1} | *(tillagd)* → **\`${n.trimEnd()}\`** |`);
        shown++;
      }
    }
  }

  // Explanation
  console.log(`\n### Varför`);
  for (const c of applied.changes) {
    console.log(`- ${c}`);
  }
  console.log(`- Scoreförbättring: **${fullStrat ? `${(after.score - orig.score).toFixed(1)} poäng` : 'ingen direkt förbättring (TODO-markörer väger ner tills nästa AI-pass implementerar dem)'}`);
  if (fullStrat) {
    const remaining = after.smells.filter(s => s.functionName === plan.targetFunction);
    if (remaining.length > 0) {
      console.log(`- Kvarvarande smell i samma funktion: ${remaining.map(s => s.type).join(', ')}`);
      console.log(`  → Logisk slutsats: funktionen har flera sammansatta problem. Nuvarande strategi fixar DEEP NESTING, nästa AI-pass kan ta nästa smell.`);
    }
  }
  console.log(`\n`);

  // Save both
  const bfPath = join(OUT, `${fileName}.BEFORE.ts`);
  const afPath = join(OUT, `${fileName}.AFTER.ts`);
  await writeFile(bfPath, code, 'utf-8');
  await writeFile(afPath, applied.transformedCode, 'utf-8');
}

// File 1: auto-refactor-applier — MUSTER: VÅR MCP FIXAR SIN EGEN KOD
await transformAndShow(
  'MCP fixar sin egen kod 🔁',
  join(REPO_ROOT, 'packages/core/src/refactor/auto-refactor-applier.ts'),
  'DeepNesting',
  '01-mcp-fixes-own-code'
);

// File 2: architecture-debt — FULL early_return transformation
await transformAndShow(
  'Architecture Debt — DeepNesting fixad 🏗️',
  join(REPO_ROOT, 'packages/core/src/analyzers/architecture-debt.ts'),
  'DeepNesting',
  '02-architecture-debt-fixed'
);
