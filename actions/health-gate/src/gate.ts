/**
 * actions/health-gate/src/gate.ts
 *
 * Merge-gate logic that runs analyzeChangeset on a PR diff and:
 *   1. Emits GitHub Actions annotations for each regression.
 *   2. Writes a SARIF 2.1.0 report of regressions.
 *   3. Sets step outputs (files-analyzed, regression-count, overall-safe, sarif-path).
 *   4. Exits non-zero when fail-on-regression=true and regressions exist.
 *
 * This file is compiled to dist/gate.js via tsc (CommonJS, Node 18+).
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveAnalyzeChangeset } from './bootstrap.js';
import type { ChangesetResult, FileRegression, Smell } from '@healthy-ai-code/core';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function numEnv(name: string, fallback: number): number {
  const v = parseFloat(env(name, String(fallback)));
  return isNaN(v) ? fallback : v;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = env(name, String(fallback)).toLowerCase().trim();
  return v === 'true' || v === '1';
}

// ---------------------------------------------------------------------------
// GitHub Actions output helpers
// ---------------------------------------------------------------------------

function setOutput(name: string, value: string | number | boolean): void {
  // GITHUB_OUTPUT file protocol (Actions runner >= 2.297.0)
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${String(value)}\n`);
  } else {
    // Fallback for local dry-runs without a runner
    console.log(`[OUTPUT] ${name}=${String(value)}`);
  }
}

function ghCommand(cmd: string, msg: string, props?: Record<string, string | number>): void {
  const propsStr = props
    ? Object.entries(props)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join(',')
    : '';
  const suffix = propsStr ? ` ${propsStr}` : '';
  console.log(`::${cmd}${suffix}::${msg}`);
}

function error(msg: string, file?: string, line?: number): void {
  const props: Record<string, string | number> = {};
  if (file) props['file'] = file;
  if (line !== undefined) props['line'] = line;
  ghCommand('error', msg, Object.keys(props).length ? props : undefined);
}

function warning(msg: string, file?: string, line?: number): void {
  const props: Record<string, string | number> = {};
  if (file) props['file'] = file;
  if (line !== undefined) props['line'] = line;
  ghCommand('warning', msg, Object.keys(props).length ? props : undefined);
}

function notice(msg: string): void {
  ghCommand('notice', msg);
}

// ---------------------------------------------------------------------------
// SARIF 2.1.0 builder for health regressions
// ---------------------------------------------------------------------------

interface SarifSmellResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: string;
  filePath: string;
  line: number;
}

function severityToSarifLevel(sev: string): 'error' | 'warning' | 'note' {
  if (sev === 'critical' || sev === 'high') return 'error';
  if (sev === 'medium') return 'warning';
  return 'note';
}

function buildSarif(
  regressions: FileRegression[],
  repoRoot: string,
  sha: string,
): object {
  const smellResults: SarifSmellResult[] = [];

  for (const reg of regressions) {
    // Emit one top-level regression result per file
    smellResults.push({
      ruleId: 'HAC-REGRESSION',
      level: 'error',
      message:
        `Health score regressed from ${reg.scoreBefore.toFixed(2)} to ` +
        `${reg.scoreAfter.toFixed(2)} (Δ ${(reg.scoreAfter - reg.scoreBefore).toFixed(2)})`,
      filePath: reg.filePath,
      line: 1,
    });

    // One result per new smell introduced
    for (const smell of reg.newSmells) {
      smellResults.push({
        ruleId: `HAC-${smell.type}`,
        level: severityToSarifLevel(smell.severity),
        message: `${smell.type}${smell.functionName ? ` in ${smell.functionName}` : ''}: ${smell.description}`,
        filePath: reg.filePath,
        line: smell.line ?? 1,
      });
    }
  }

  // Collect unique rule IDs
  const ruleIds = [...new Set(smellResults.map(r => r.ruleId))];
  const rules = ruleIds.map(id => ({
    id,
    name: id.replace(/^HAC-/, ''),
    shortDescription: { text: `Healthy AI Code: ${id.replace(/^HAC-/, '')}` },
    helpUri: 'https://github.com/screamm/HealthyAICode_MCP',
    properties: { tags: ['code-quality', 'healthy-ai-code'] },
  }));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'healthy-ai-code/gate',
            version: '0.1.0',
            semanticVersion: '0.1.0',
            informationUri: 'https://github.com/screamm/HealthyAICode_MCP',
            rules,
          },
        },
        versionControlProvenance: sha
          ? [{ repositoryUri: '', revisionId: sha }]
          : undefined,
        originalUriBaseIds: {
          SRCROOT: { uri: `file://${repoRoot.replace(/\\/g, '/')}/` },
        },
        results: smellResults.map(r => ({
          ruleId: r.ruleId,
          level: r.level,
          message: { text: r.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: r.filePath.replace(/\\/g, '/'),
                  uriBaseId: 'SRCROOT',
                },
                region: { startLine: Math.max(1, r.line) },
              },
            },
          ],
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// OCHS summary table
// ---------------------------------------------------------------------------

function renderOchsSummary(result: ChangesetResult, floor: number): string {
  const lines: string[] = [];
  lines.push('## Healthy AI Code — Merge Gate');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Files analysed | ${result.filesAnalyzed} |`);
  lines.push(`| Regressions | ${result.regressions.length} |`);
  lines.push(`| Improvements | ${result.improvements.length} |`);
  lines.push(`| New unhealthy files (below ${floor}) | ${result.newUnhealthyFiles.length} |`);
  lines.push(`| Gate status | ${result.overallSafe ? '**PASS**' : '**FAIL**'} |`);
  lines.push('');

  if (result.regressions.length > 0) {
    lines.push('### Regressions');
    lines.push('');
    lines.push('| File | Before | After | Delta | New smells |');
    lines.push('|---|---|---|---|---|');
    for (const r of result.regressions) {
      const delta = (r.scoreAfter - r.scoreBefore).toFixed(2);
      lines.push(
        `| \`${r.filePath}\` | ${r.scoreBefore.toFixed(2)} | ${r.scoreAfter.toFixed(2)} | ${delta} | ${r.newSmells.length} |`,
      );
    }
    lines.push('');
  }

  if (result.improvements.length > 0) {
    lines.push('### Improvements');
    lines.push('');
    lines.push('| File | Before | After | Delta |');
    lines.push('|---|---|---|---|');
    for (const imp of result.improvements) {
      const delta = `+${(imp.scoreAfter - imp.scoreBefore).toFixed(2)}`;
      lines.push(
        `| \`${imp.filePath}\` | ${imp.scoreBefore.toFixed(2)} | ${imp.scoreAfter.toFixed(2)} | ${delta} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Write GitHub step summary
// ---------------------------------------------------------------------------

function writeSummary(markdown: string): void {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile) {
    fs.appendFileSync(summaryFile, markdown + '\n');
  } else {
    console.log('\n' + markdown);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Read inputs from environment ---
  const workingDir =
    env('INPUT_WORKING_DIRECTORY') || env('GITHUB_WORKSPACE') || process.cwd();
  const repoRoot = path.resolve(workingDir);

  // Determine base branch
  let baseBranch = env('INPUT_BASE_BRANCH');
  if (!baseBranch) {
    // Use GITHUB_BASE_REF (set on pull_request events) or fall back to 'main'
    const ghBaseRef = env('GITHUB_BASE_REF');
    baseBranch = ghBaseRef ? `origin/${ghBaseRef}` : 'main';
  }

  const floor = numEnv('INPUT_FLOOR', 7.0);
  const regressionDelta = numEnv('INPUT_REGRESSION_DELTA', 0.5);
  const sarifOut = env('INPUT_SARIF_OUT', 'health-gate.sarif');
  const failOnRegression = boolEnv('INPUT_FAIL_ON_REGRESSION', true);
  const sha = env('GITHUB_SHA', '');

  notice(
    `Healthy AI Code Merge Gate — repo: ${repoRoot} | base: ${baseBranch} | floor: ${floor} | delta: ${regressionDelta}`,
  );

  // --- Import core (Node 18–24 compatible loader) ---
  let analyzeChangeset: (repoPath: string, baseBranch: string) => Promise<ChangesetResult>;
  try {
    analyzeChangeset = await resolveAnalyzeChangeset();
  } catch (e) {
    console.error(
      '::error::Cannot load @healthy-ai-code/core. Ensure the package is built ' +
        'and available (run `pnpm build` in the monorepo root or install the npm package). ' +
        `Details: ${String(e)}`,
    );
    process.exit(1);
  }

  // --- Run analysis ---
  let result: ChangesetResult;
  try {
    result = await analyzeChangeset(repoRoot, baseBranch);
  } catch (e) {
    console.error(`::error::analyzeChangeset failed: ${String(e)}`);
    process.exit(1);
  }

  // --- Apply custom floor to catch new-file regressions ---
  // The built-in NEW_FILE_UNHEALTHY_THRESHOLD in git.ts is 7.0;
  // respect the user's configured floor when it is more restrictive.
  const customUnhealthy = result.newUnhealthyFiles.filter(f => f.score < floor);
  const hasCustomUnhealthy =
    floor !== 7.0 && customUnhealthy.length !== result.newUnhealthyFiles.length;

  // --- Emit annotations ---
  for (const reg of result.regressions) {
    const delta = (reg.scoreAfter - reg.scoreBefore).toFixed(2);
    error(
      `Health regressed ${delta} (${reg.scoreBefore.toFixed(2)} → ${reg.scoreAfter.toFixed(2)}). ` +
        `New smells: ${reg.newSmells.map((s: Smell) => s.type).join(', ') || 'none'}`,
      reg.filePath,
      1,
    );
    for (const smell of reg.newSmells) {
      warning(
        `${smell.type}: ${smell.description} — ${smell.suggestion}`,
        reg.filePath,
        smell.line ?? 1,
      );
    }
  }

  for (const nf of result.newUnhealthyFiles) {
    if (nf.score < floor) {
      warning(
        `New file below floor (score ${nf.score.toFixed(2)} < ${floor}): ${nf.filePath ?? 'unknown'}`,
        nf.filePath ?? undefined,
        1,
      );
    }
  }

  // --- OCHS summary ---
  const summary = renderOchsSummary(result, floor);
  writeSummary(summary);

  // --- SARIF output ---
  let sarifAbsPath = '';
  if (sarifOut) {
    const sarif = buildSarif(result.regressions, repoRoot, sha);
    sarifAbsPath = path.isAbsolute(sarifOut)
      ? sarifOut
      : path.join(repoRoot, sarifOut);
    fs.mkdirSync(path.dirname(sarifAbsPath), { recursive: true });
    fs.writeFileSync(sarifAbsPath, JSON.stringify(sarif, null, 2), 'utf-8');
    notice(`SARIF written to ${sarifAbsPath}`);
  }

  // --- Set outputs ---
  const regressionCount = result.regressions.length + (hasCustomUnhealthy ? 1 : 0);
  setOutput('files-analyzed', result.filesAnalyzed);
  setOutput('regression-count', regressionCount);
  setOutput('overall-safe', result.overallSafe && !hasCustomUnhealthy);
  setOutput('sarif-path', sarifAbsPath);

  // --- Final pass/fail ---
  if (failOnRegression && (!result.overallSafe || hasCustomUnhealthy)) {
    console.error(
      `::error::Merge gate FAILED — ${regressionCount} regression(s) detected. ` +
        'Fix the regressions or lower your expectations (increase regression-delta / decrease floor).',
    );
    process.exit(1);
  }

  if (result.overallSafe) {
    notice(
      `Merge gate PASSED — ${result.filesAnalyzed} files analysed, ` +
        `${result.improvements.length} improvement(s), 0 regressions.`,
    );
  }
}

main().catch(e => {
  console.error(`::error::Unhandled error in health-gate: ${String(e)}`);
  process.exit(1);
});
