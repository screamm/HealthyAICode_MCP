#!/usr/bin/env node
/**
 * core_reference.mjs — reference-engine harness for the OCHS cross-implementation check.
 *
 * This is the ONLY file in ochs-ref-py/ that touches @healthy-ai-code/core, and it
 * does so purely as a black box: it calls the public `analyzeCode(code, language,
 * filePath)` entry point and emits the resulting OCHS score + smell vector as JSON.
 * No core internals are imported or inspected. The Python implementation
 * (ochs_ref.py) never sees this output during its own computation — the cross-check
 * (cross_check.py) compares the two independently-produced JSON artifacts.
 *
 * Usage:  node core_reference.mjs > core_reference.json
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const core = require(join(here, '..', 'packages', 'core', 'dist', 'index.js'));

const fixturesDir = join(here, 'fixtures');
const files = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.py'))
  .sort();

const out = [];
for (const f of files) {
  const code = readFileSync(join(fixturesDir, f), 'utf8');
  const r = core.analyzeCode(code, 'python', f);
  // Aggregate smell counts by type (the OCHS score depends only on type+count).
  const counts = {};
  for (const s of r.smells || []) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  out.push({
    file: f,
    score: r.score,
    category: r.category,
    smellCounts: counts,
  });
}

process.stdout.write(JSON.stringify({ engine: 'core', ochsVersion: '0.1', results: out }, null, 2) + '\n');
