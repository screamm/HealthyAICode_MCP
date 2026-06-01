#!/usr/bin/env node
/**
 * @healthy-ai-code/init CLI
 *
 * Usage:
 *   npx @healthy-ai-code/init           # interactive install
 *   npx @healthy-ai-code/init --dry-run  # preview without writing
 *   npx @healthy-ai-code/init --no-telemetry  # decline telemetry
 *   npx @healthy-ai-code/init --help    # show help
 */

import { runInstaller } from './installer';

function parseArgs(argv: string[]): {
  dryRun: boolean;
  telemetryEnabled: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    telemetryEnabled: !args.includes('--no-telemetry'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function printHelp(): void {
  console.log(`
  @healthy-ai-code/init — one-command installer

  Usage:
    npx @healthy-ai-code/init [options]

  Options:
    --dry-run        Preview changes without writing anything to disk.
    --no-telemetry   Opt out of anonymous, content-free install telemetry.
    --help, -h       Show this help text.

  What it does:
    1. Detects your AI coding assistant (Claude Code, Cursor, VS Code).
    2. Registers the Healthy AI Code MCP server in its config file.
    3. Installs a PreToolUse gate hook (~/.claude/settings.json).
    4. Runs a first health score on up to 5 source files in the cwd.

  Target: <60 seconds from npx invocation to first score printed.

  Telemetry (opt-in, content-free):
    Sends only: event name, tool version, Node version, platform, harness slug,
    score bucket (integer floor), score band, elapsed ms, and a random install ID.
    NEVER sends: file paths, source code, repo URL, usernames, or env vars.
    Opt out permanently: edit ~/.healthy-ai-code/telemetry.json → optedIn: false
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  try {
    await runInstaller({
      dryRun: opts.dryRun,
      telemetryEnabled: opts.telemetryEnabled,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nInstaller failed: ${msg}\n`);
    process.exit(1);
  }
}

void main();
