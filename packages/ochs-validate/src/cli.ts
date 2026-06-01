#!/usr/bin/env node
/**
 * ochs-validate CLI
 *
 * Usage:
 *   ochs-validate <file.json>       Validate a single OCHS score JSON file
 *   ochs-validate --help            Show help
 *   ochs-validate --version         Show package version
 *   echo '{"ochsVersion":"0.1",...}' | ochs-validate  Read from stdin
 *
 * Exit codes:
 *   0  — validation passed
 *   1  — validation failed (structural errors or formula mismatch)
 *   2  — bad CLI arguments or I/O error
 */

import { readFileSync } from 'fs';
import { validateOchsJson } from './validate';

const VERSION = require('../package.json').version as string;
const PACKAGE = require('../package.json').name as string;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(
    `
${PACKAGE} v${VERSION}

Validate an OCHS score JSON object against the OCHS v0.1 specification.
Checks structural correctness AND re-derives the score from the smell
vector to verify formula consistency.

USAGE
  ochs-validate [options] [file.json]

ARGUMENTS
  file.json   Path to a JSON file containing an OCHS score object.
              If omitted, reads from stdin.

OPTIONS
  --strict            Treat unknown biomarker types as hard errors
                      (default: warnings only, since OCHS v0.1 allows extensions)
  --tolerance <n>     Maximum allowed score delta for formula check
                      (default: 0.05)
  --json              Output results as JSON instead of human-readable text
  --help, -h          Show this help message
  --version, -v       Print the package version

EXIT CODES
  0   Validation passed
  1   Validation failed (structural or formula error)
  2   Bad arguments or I/O error

EXAMPLES
  ochs-validate result.json
  cat result.json | ochs-validate
  ochs-validate --strict result.json
  ochs-validate --json result.json
`.trimStart()
  );
}

function die(message: string, code = 2): never {
  process.stderr.write(`ochs-validate: ${message}\n`);
  process.exit(code);
}

// ──────────────────────────────────────────────────────────────────────────────
// Argument parsing (no external deps — keep it simple)
// ──────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  file?: string;
  strict: boolean;
  tolerance: number;
  jsonOutput: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { strict: false, tolerance: 0.05, jsonOutput: false };
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
    if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--json') {
      args.jsonOutput = true;
    } else if (arg === '--tolerance') {
      const next = argv[++i];
      if (next === undefined || isNaN(Number(next))) {
        die('--tolerance requires a numeric argument (e.g., --tolerance 0.01)');
      }
      args.tolerance = Number(next);
    } else if (arg.startsWith('--')) {
      die(`Unknown option: ${arg}. Run ochs-validate --help for usage.`);
    } else {
      if (args.file !== undefined) {
        die('Only one file argument is supported. Run ochs-validate --help for usage.');
      }
      args.file = arg;
    }
    i++;
  }
  return args;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Read input
  let json: string;
  if (args.file) {
    try {
      json = readFileSync(args.file, 'utf8');
    } catch (e) {
      die(`Cannot read file "${args.file}": ${(e as Error).message}`);
    }
  } else if (!process.stdin.isTTY) {
    json = await readStdin();
  } else {
    // No file and no piped input — show help
    printHelp();
    process.exit(2);
  }

  // Validate
  const result = validateOchsJson(json, {
    scoreTolerance: args.tolerance,
    strictSmellTypes: args.strict,
  });

  // Output
  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    if (result.valid) {
      process.stdout.write('PASS — OCHS score object is valid.\n');
      if (result.derivedScore !== undefined) {
        process.stdout.write(
          `  Derived score : ${result.derivedScore.toFixed(4)}\n` +
            `  Category      : ${result.derivedCategory}\n` +
            `  Loop complete : ${result.derivedLoopComplete}\n`
        );
      }
      // Print any warnings
      const warnings = result.errors.filter((e) => e.startsWith('[warning]'));
      for (const w of warnings) {
        process.stdout.write(`  ${w}\n`);
      }
    } else {
      process.stderr.write('FAIL — OCHS score object is invalid.\n');
      for (const err of result.errors) {
        process.stderr.write(`  - ${err}\n`);
      }
      if (result.derivedScore !== undefined) {
        process.stderr.write(
          `  Derived score : ${result.derivedScore.toFixed(4)}\n` +
            `  Category      : ${result.derivedCategory}\n`
        );
      }
    }
  }

  process.exit(result.valid ? 0 : 1);
}

main().catch((e) => {
  die(`Unexpected error: ${(e as Error).message}`);
});
