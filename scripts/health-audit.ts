import { readdir } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { analyzeFile } from '../packages/core/src/index';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const TARGET = 9.6;

const SRC_DIRS = [
  join(ROOT, 'packages/core/src'),
  join(ROOT, 'packages/mcp-server/src'),
];

async function collectTs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await collectTs(full));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

interface Row { file: string; score: number; category: string; smells: string[]; }

async function main() {
  const files = (await Promise.all(SRC_DIRS.map(collectTs))).flat();
  console.log(`\nAnalyserar ${files.length} källfiler mot tröskel ${TARGET}...\n`);

  const rows: Row[] = [];
  for (const f of files) {
    const r = await analyzeFile(f);
    rows.push({
      file: relative(ROOT, f).replace(/\\/g, '/'),
      score: r.score,
      category: r.category,
      smells: r.smells.map(s => s.type),
    });
  }

  rows.sort((a, b) => a.score - b.score);

  const failed = rows.filter(r => r.score < TARGET);
  const passed = rows.filter(r => r.score >= TARGET);

  const fmt = (r: Row) => {
    const smellStr = r.smells.length ? `  ← ${r.smells.join(', ')}` : '';
    return `  ${String(r.score.toFixed(1)).padEnd(5)} ${r.category.padEnd(8)} ${r.file}${smellStr}`;
  };

  if (failed.length > 0) {
    console.log(`\x1b[31m── Under ${TARGET} (${failed.length} filer) ──────────────────────────────\x1b[0m`);
    for (const r of failed) console.log('\x1b[31m' + fmt(r) + '\x1b[0m');
    console.log();
  }

  console.log(`\x1b[32m── Godkänd ${TARGET}+ (${passed.length} filer) ──────────────────────────────\x1b[0m`);
  for (const r of passed) console.log('\x1b[32m' + fmt(r) + '\x1b[0m');

  const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`Filer: ${rows.length}  |  Medel: ${avg.toFixed(2)}  |  Godkänd: ${passed.length}  |  Underkänd: ${failed.length}`);
  console.log(failed.length === 0
    ? `\x1b[32m✓ Hela kodbasen håller ${TARGET}+\x1b[0m`
    : `\x1b[31m✗ ${failed.length} filer under ${TARGET}\x1b[0m`);
}

main().catch(e => { console.error(e); process.exit(1); });
