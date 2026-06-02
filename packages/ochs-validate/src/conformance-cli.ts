#!/usr/bin/env node
/**
 * ochs-conformance CLI
 *
 * Runs the OCHS conformance suite against an implementation's output directory
 * or a single JSON object (for quick spot-checks).
 *
 * USAGE
 *   ochs-conformance --dir <outputs-dir>   [--label <impl-name>] [--corpus <path>] [--json]
 *   ochs-conformance --file <id:file.json> [--label <impl-name>] [--corpus <path>] [--json]
 *   ochs-conformance --help
 *
 * EXAMPLES
 *   # Run against a directory where each file is named <fixture-id>.json
 *   ochs-conformance --dir /path/to/impl-outputs --label "my-impl v0.1"
 *
 *   # Run a single fixture (useful for quick testing)
 *   ochs-conformance --file "healthy-ts-simple:/path/to/output.json"
 *
 *   # Output as JSON (for CI integration)
 *   ochs-conformance --dir ./outputs --json
 *
 * EXIT CODES
 *   0   All fixtures pass L2 (overallPass: true)
 *   1   One or more fixtures fail L1 or L2
 *   2   Usage error or I/O problem
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  runConformanceSuite,
  loadOutputsFromDirectory,
  getCorpusFixtureIds,
  type ConformanceSuiteResult,
  type FixtureConformanceResult,
} from './conformance';

const VERSION = require('../package.json').version as string;
const PACKAGE = require('../package.json').name as string;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function die(msg: string, code = 2): never {
  process.stderr.write(`ochs-conformance: ${msg}\n`);
  process.exit(code);
}

function printHelp(): void {
  process.stdout.write(`
${PACKAGE} v${VERSION} — OCHS Conformance Kit

Validates an implementation's output against the OCHS v0.1 conformance corpus.

CONFORMANCE LEVELS
  L1  Schema valid     Required fields present, types correct, score in [1.0, 10.0],
                       ochsVersion matches pattern, smell types are recognised.
  L2  Formula correct  Reported score = max(1.0, 10 − Σ(weight × sqrt(count)))
                       within the fixture's allowed tolerance. Requires L1.
  L3  Biomarker complete  Reported biomarker types match golden set (order-independent,
                          count-sensitive). Requires L2.

USAGE
  ochs-conformance --dir <outputs-dir>   [--label <name>] [--corpus <path>] [--json]
  ochs-conformance --file <id:file.json> [--label <name>] [--corpus <path>] [--json]

OPTIONS
  --dir <path>        Directory of implementation outputs. Each file must be named
                      <fixture-id>.json and contain an OCHS score JSON object.
  --file <id:path>    Single-fixture mode: "fixture-id:/path/to/output.json".
                      Can be specified multiple times.
  --label <name>      Label for the implementation under test (for reporting).
  --corpus <path>     Custom corpus.json path (defaults to built-in corpus).
  --json              Output the full ConformanceSuiteResult as JSON.
  --help, -h          Show this help.
  --version, -v       Print version.

EXIT CODES
  0   overallPass: true  (all fixtures pass at least L2)
  1   One or more fixtures fail L1 or L2
  2   Usage error or I/O error
`.trimStart());
}

// ──────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ──────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  dir?: string;
  files: Array<{ id: string; path: string }>;
  label: string;
  corpusPath?: string;
  jsonOutput: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { files: [], label: 'unknown', jsonOutput: false };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--version' || arg === '-v') {
      process.stdout.write(`${VERSION}\n`);
      process.exit(0);
    }
    if (arg === '--json') {
      args.jsonOutput = true;
    } else if (arg === '--dir') {
      const next = argv[++i];
      if (!next) die('--dir requires a path argument');
      args.dir = next;
    } else if (arg === '--file') {
      const next = argv[++i];
      if (!next) die('--file requires an argument in the form "fixture-id:/path/to/file.json"');
      const colonIdx = next.indexOf(':');
      if (colonIdx === -1) die(`--file argument "${next}" must be in the form "fixture-id:/path/to/file.json"`);
      args.files.push({ id: next.slice(0, colonIdx), path: next.slice(colonIdx + 1) });
    } else if (arg === '--label') {
      const next = argv[++i];
      if (!next) die('--label requires a name argument');
      args.label = next;
    } else if (arg === '--corpus') {
      const next = argv[++i];
      if (!next) die('--corpus requires a path argument');
      args.corpusPath = next;
    } else if (arg.startsWith('--')) {
      die(`Unknown option: ${arg}. Run ochs-conformance --help.`);
    }
    i++;
  }
  return args;
}

// ──────────────────────────────────────────────────────────────────────────────
// Text report printer
// ──────────────────────────────────────────────────────────────────────────────

function printTextReport(result: ConformanceSuiteResult): void {
  const { summary, fixtures, specGaps, implementationLabel, ochsVersion, runAt } = result;

  process.stdout.write(`\nOCHS Conformance Report\n`);
  process.stdout.write(`${'─'.repeat(60)}\n`);
  process.stdout.write(`Implementation : ${implementationLabel}\n`);
  process.stdout.write(`OCHS version   : ${ochsVersion}\n`);
  process.stdout.write(`Run at         : ${runAt}\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Summary\n`);
  process.stdout.write(`  Total fixtures : ${summary.total}\n`);
  process.stdout.write(`  L1 pass        : ${summary.l1Pass} / ${summary.total}\n`);
  process.stdout.write(`  L2 pass        : ${summary.l2Pass} / ${summary.total}\n`);
  process.stdout.write(`  L3 pass        : ${summary.l3Pass} / ${summary.total}\n`);
  process.stdout.write(`  Overall        : ${summary.overallPass ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`\n`);

  for (const fr of fixtures) {
    const badge = fr.passesL3 ? 'L3' : fr.passesL2 ? 'L2' : fr.passesL1 ? 'L1' : 'FAIL';
    const icon = fr.passesL2 ? 'PASS' : 'FAIL';
    process.stdout.write(`Fixture: ${fr.fixtureId}  [${icon} ${badge}]\n`);
    for (const a of fr.assertions) {
      const sym = a.status === 'PASS' ? '  [PASS]' : a.status === 'SKIP' ? '  [SKIP]' : '  [FAIL]';
      process.stdout.write(`  ${sym} ${a.id}`);
      if (a.message) {
        process.stdout.write(`\n         ${a.message}`);
      }
      process.stdout.write(`\n`);
    }
    process.stdout.write(`\n`);
  }

  if (specGaps.length > 0) {
    process.stdout.write(`Spec Gaps (biomarkers not produced by this implementation)\n`);
    for (const gap of specGaps) {
      process.stdout.write(`  ${gap.fixtureId}: missing [${gap.missingBiomarkerTypes.join(', ')}]\n`);
      process.stdout.write(`    ${gap.note}\n`);
    }
    process.stdout.write(`\n`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dir && args.files.length === 0) {
    printHelp();
    process.exit(2);
  }

  // Build outputs map
  const outputs: Record<string, unknown> = {};

  const fixtureIds = getCorpusFixtureIds(args.corpusPath);

  if (args.dir) {
    const loaded = loadOutputsFromDirectory(args.dir, fixtureIds);
    Object.assign(outputs, loaded);
  }

  for (const { id, path } of args.files) {
    try {
      outputs[id] = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      die(`Cannot read or parse file "${path}" for fixture "${id}": ${(e as Error).message}`);
    }
  }

  // Run suite
  const result = runConformanceSuite(outputs, {
    implementationLabel: args.label,
    corpusPath: args.corpusPath,
  });

  // Output
  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printTextReport(result);
  }

  process.exit(result.summary.overallPass ? 0 : 1);
}

main().catch((e) => die(`Unexpected error: ${(e as Error).message}`));
