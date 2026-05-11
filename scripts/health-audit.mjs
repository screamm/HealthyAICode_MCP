// Quick health audit — runs analyzeFile over all source .ts files
// Usage: node scripts/health-audit.mjs
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

// Load the built core package directly
const { analyzeFile } = require('./node_modules/@healthy-ai-code/core/dist/index.cjs');

const TARGET_SCORE = 9.6;
const SRC_DIRS = [
  join(ROOT, 'packages/core/src'),
  join(ROOT, 'packages/mcp-server/src'),
];

async function collectTs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await collectTs(full));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

async function main() {
  const files = (await Promise.all(SRC_DIRS.map(collectTs))).flat();
  console.log(`\nAnalyserar ${files.length} källfiler...\n`);

  const results = [];
  for (const f of files) {
    try {
      const r = await analyzeFile(f);
      results.push({ file: relative(ROOT, f), score: r.score, category: r.category, smells: r.smells });
    } catch (e) {
      results.push({ file: relative(ROOT, f), score: null, error: e.message });
    }
  }

  results.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const passed = results.filter(r => r.score !== null && r.score >= TARGET_SCORE);
  const failed = results.filter(r => r.score !== null && r.score < TARGET_SCORE);
  const errored = results.filter(r => r.score === null);

  const pad = (s, n) => String(s).padEnd(n);
  const fmt = r => `  ${pad(r.score?.toFixed(1) ?? 'ERR', 5)} ${pad(r.category ?? '?', 8)} ${r.file}${r.smells?.length ? `  [${r.smells.map(s=>s.type).join(', ')}]` : ''}`;

  if (failed.length > 0) {
    console.log(`\x1b[31m── Under ${TARGET_SCORE} (${failed.length} filer) ──\x1b[0m`);
    failed.forEach(r => console.log('\x1b[31m' + fmt(r) + '\x1b[0m'));
  }

  if (errored.length > 0) {
    console.log(`\n\x1b[33m── Fel (${errored.length} filer) ──\x1b[0m`);
    errored.forEach(r => console.log(`  ERR   ${r.file}: ${r.error}`));
  }

  console.log(`\n\x1b[32m── Passerade ${TARGET_SCORE}+ (${passed.length} filer) ──\x1b[0m`);
  passed.forEach(r => console.log('\x1b[32m' + fmt(r) + '\x1b[0m'));

  const avg = results.filter(r => r.score !== null).reduce((s, r) => s + r.score, 0) / (results.length - errored.length);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Totalt: ${results.length} filer  |  Medel: ${avg.toFixed(2)}  |  Under ${TARGET_SCORE}: ${failed.length}`);
  if (failed.length === 0 && errored.length === 0) {
    console.log(`\x1b[32m✓ Hela kodbasen håller ${TARGET_SCORE}+\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ ${failed.length + errored.length} filer klarar inte ${TARGET_SCORE}\x1b[0m`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
