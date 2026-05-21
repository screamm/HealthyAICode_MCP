// verify-agents-md.mjs — Assert authoritative-voice phrases in MCP output
// Usage: node scripts/verify-agents-md.mjs
// Requires built packages: pnpm -F core build && pnpm -F mcp-server build
import { createRequire } from 'module';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// Preflight: check that dist packages are built
const CORE_DIST = resolve(ROOT, 'packages/core/dist/index.js');
const SHARED_DIST = resolve(ROOT, 'packages/mcp-server/dist/tools/shared.js');

if (!existsSync(CORE_DIST)) {
  console.error('ERROR: Core package not built. Run: pnpm -F @healthy-ai-code/core build');
  process.exit(2);
}
if (!existsSync(SHARED_DIST)) {
  console.error('ERROR: MCP server not built. Run: pnpm -F @healthy-ai-code/mcp-server build');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const { analyzeFile } = require('../packages/core/dist/index.js');
const { buildNextAction, formatReviewSummary } = require('../packages/mcp-server/dist/tools/shared.js');

const FIXTURE = resolve(ROOT, 'packages/core/tests/fixtures/unhealthy/agents-md-fixture.ts');

const REQUIRED_PHRASES_SUMMARY = [
  /AI-redo|loopComplete/i,
];

const REQUIRED_PHRASES_NEXT_ACTION = [
  /code_health_review/,
  /auktoritativ|obligatorisk|MUST|måste/i,
];

const REQUIRED_PHRASES_WHEN_SMELLS_PRESENT = [
  /3.{1,3}5/,   // matches "3-5", "3 till 5", "3–5"
];

async function main() {
  console.log('Verify AGENTS.md authoritative output');
  console.log('======================================');
  console.log(`Fixture: ${FIXTURE}`);
  console.log('');

  const result = await analyzeFile(FIXTURE);
  const loopComplete = result.score >= 9.5;
  const summary = formatReviewSummary(FIXTURE, result);
  const nextAction = buildNextAction(result, loopComplete);

  console.log(`Score: ${result.score}/10.0`);
  console.log(`Smells: ${result.smells.length}`);
  console.log(`loopComplete: ${loopComplete}`);
  console.log('');

  const checks = [
    { name: 'Score below 5.0 on fixture', pass: result.score < 5.0 },
    { name: 'Smells detected on fixture', pass: result.smells.length > 0 },
    ...REQUIRED_PHRASES_SUMMARY.map(re => ({
      name: `Summary matches ${re}`, pass: re.test(summary),
    })),
    ...REQUIRED_PHRASES_NEXT_ACTION.map(re => ({
      name: `nextAction.instruction matches ${re}`, pass: re.test(nextAction.instruction),
    })),
    ...REQUIRED_PHRASES_WHEN_SMELLS_PRESENT.map(re => ({
      name: `Refactor cadence phrase matches ${re}`,
      pass: result.smells.length === 0 || re.test(nextAction.instruction),
    })),
  ];

  let failed = 0;
  for (const c of checks) {
    console.log(`${c.pass ? 'OK  ' : 'FAIL'}  ${c.name}`);
    if (!c.pass) failed++;
  }

  console.log('');
  if (failed === 0) {
    console.log('All assertions passed. AGENTS.md authoritative phrases confirmed in MCP output.');
  } else {
    console.log(`${failed} assertion(s) failed. Check shared.ts nextAction strings.`);
    if (!checks.find(c => c.name.includes('3.{1,3}5'))?.pass) {
      console.log('  Hint: "3-5 step cadence" phrase missing — Task 6 strings may not be updated.');
    }
    if (!checks.find(c => c.name.includes('auktoritativ'))?.pass) {
      console.log('  Hint: Authoritative language missing from nextAction.instruction.');
    }
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
