// scripts/generate-llms-full.mjs
// Generate docs/llms-full.txt from tool/smell metadata.
// Usage: node scripts/generate-llms-full.mjs
//
// Requires the core package to be built first (pnpm build).

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

// Load from built output
const { generateLlmsFullTxt } = require('../packages/core/dist/llms-full.js');

const output = generateLlmsFullTxt();
const outPath = join(ROOT, 'docs', 'llms-full.txt');
writeFileSync(outPath, output, 'utf8');

console.log(`Written: ${outPath} (${output.length} chars)`);
if (!output.includes('healthy_ai_code_')) {
  console.error('ERROR: generated file does not contain healthy_ai_code_ prefix');
  process.exit(1);
}
console.log('OK: llms-full.txt contains healthy_ai_code_ prefix');
