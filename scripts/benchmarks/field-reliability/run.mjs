/**
 * Field-Reliability Harness — Track #4
 *
 * Runs analyzeFile (and analyzeFileWithHistory where git exists) across every
 * source file in the field-repo corpus, then runs the self-correcting refactoring
 * loop on a sample of low-scoring real files.
 *
 * Metrics collected:
 *   - Total files analyzed, crashes/errors, parse-failure rate
 *   - Throughput (files/sec, ms/file p50/p95)
 *   - Score distribution, count of files below 9.0 / 9.5 / 9.6
 *   - Loop convergence on sampled low files (iterations, before/after, improvement)
 *   - Comment-count invariant validation on loop edits
 *
 * Usage:
 *   node scripts/benchmarks/field-reliability/run.mjs [--loop-sample N] [--timeout-ms N] [--repo name]
 *
 * Outputs:
 *   docs/benchmarks/field-reliability-report.md
 *   scripts/benchmarks/field-reliability/results.json   (raw data)
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const { analyzeFile, analyzeCode, runRefactoringLoop } = require('../../../packages/core/dist/index.js');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};
const hasFlag = (flag) => args.includes(flag);

const LOOP_SAMPLE = parseInt(getArg('--loop-sample', '30'), 10);
const TIMEOUT_MS = parseInt(getArg('--timeout-ms', '30000'), 10);
const FILTER_REPO = getArg('--repo', null);
const SKIP_HISTORY = hasFlag('--skip-history');
const MAX_FILES_PER_REPO = parseInt(getArg('--max-files', '2000'), 10);

// Extension → language mapping (matches detectLanguage)
const EXT_MAP = {
  '.py': 'python',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.java': 'java',
  '.go': 'go',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.php': 'php',
  '.cs': 'csharp',
  '.kt': 'kotlin',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect all source files matching EXT_MAP in a directory. */
async function collectSourceFiles(dir, maxFiles = Infinity) {
  const results = [];
  async function walk(current) {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return; // permission or path-too-long on Windows
    }
    for (const e of entries) {
      if (results.length >= maxFiles) break;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
      const full = join(current, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        const ext = extname(e.name).toLowerCase();
        if (ext in EXT_MAP && !e.name.endsWith('.d.ts')) {
          results.push(full);
        }
      }
    }
  }
  await walk(dir);
  return results;
}

/** Check whether a repo directory has a git history (for analyzeFileWithHistory). */
async function hasGitHistory(repoPath) {
  try {
    await execFileAsync('git', ['-C', repoPath, 'log', '--oneline', '-1'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Analyze a single file with a timeout; returns { result, error, durationMs }. */
async function analyzeWithTimeout(filePath, repoPath, useHistory) {
  const start = Date.now();
  try {
    const fn = (useHistory && repoPath)
      ? () => analyzeFile(filePath, repoPath)
      : () => analyzeFile(filePath);

    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      ),
    ]);
    return { result, error: null, durationMs: Date.now() - start };
  } catch (err) {
    return { result: null, error: err, durationMs: Date.now() - start };
  }
}

/** Compute p50 and p95 of an array of numbers. */
function percentiles(arr) {
  if (arr.length === 0) return { p50: 0, p95: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { p50, p95, min, max, mean };
}

/** Count comment lines in code (same logic as refactoring-loop). */
function countCommentLines(code) {
  const lines = code.split('\n');
  let count = 0;
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlock) {
      count++;
      if (trimmed.includes('*/')) inBlock = false;
    } else if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
      count++;
      if (!trimmed.includes('*/')) inBlock = true;
    } else if (trimmed.startsWith('//') || trimmed.startsWith('#') ||
               trimmed.startsWith('--') || trimmed.startsWith('*')) {
      count++;
    }
  }
  return count;
}

/** Run the refactoring loop on a code string; returns loop result + timing. */
async function runLoopWithTimeout(code, language, filePath) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      Promise.resolve(runRefactoringLoop(code, language, filePath, 9.5, 15)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LOOP_TIMEOUT')), Math.min(TIMEOUT_MS * 5, 120_000))
      ),
    ]);
    return { result, error: null, durationMs: Date.now() - start };
  } catch (err) {
    return { result: null, error: err, durationMs: Date.now() - start };
  }
}

// ── Main harness ──────────────────────────────────────────────────────────────

async function main() {
  const manifestPath = join(ROOT, 'field-repos', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const repos = manifest.repos.filter(r => !FILTER_REPO || r.name === FILTER_REPO);

  console.log(`\n=== Field-Reliability Harness ===`);
  console.log(`Repos: ${repos.length}, Loop sample: ${LOOP_SAMPLE}, Timeout: ${TIMEOUT_MS}ms`);
  console.log(`Max files/repo: ${MAX_FILES_PER_REPO}, Skip history: ${SKIP_HISTORY}`);
  console.log('');

  // ── Phase 1: File analysis across all repos ───────────────────────────────
  const allFileResults = [];
  const repoSummaries = [];

  for (const repo of repos) {
    const repoPath = join(ROOT, repo.path);
    if (!existsSync(repoPath)) {
      console.warn(`  [skip] ${repo.name}: path not found`);
      continue;
    }

    const hasHistory = !SKIP_HISTORY && await hasGitHistory(repoPath);
    console.log(`\nRepo: ${repo.name} (${repo.lang}, ${repo.size}, git=${hasHistory})`);

    const files = await collectSourceFiles(repoPath, MAX_FILES_PER_REPO);
    console.log(`  Found ${files.length} source files`);

    const repoDurations = [];
    const repoResults = [];
    let crashCount = 0;
    let parseFailCount = 0;
    const errorSamples = [];

    // Analyze in batches of 8 (parallel I/O)
    const BATCH = 8;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const settled = await Promise.all(
        batch.map(fp => analyzeWithTimeout(fp, repoPath, hasHistory))
      );
      for (let j = 0; j < batch.length; j++) {
        const fp = batch[j];
        const { result, error, durationMs } = settled[j];
        repoDurations.push(durationMs);

        if (error) {
          crashCount++;
          if (errorSamples.length < 5) {
            errorSamples.push({
              file: relative(ROOT, fp),
              message: error.message,
              stack: (error.stack || '').split('\n').slice(0, 4).join('\n'),
            });
          }
          allFileResults.push({ repo: repo.name, file: relative(ROOT, fp), error: error.message });
        } else {
          const isParseFail = result.score <= 0 && result.smells.length === 0;
          if (isParseFail) parseFailCount++;
          const entry = {
            repo: repo.name,
            file: relative(ROOT, fp),
            lang: result.language,
            score: result.score,
            smells: result.smells.length,
            durationMs,
            parseFail: isParseFail,
          };
          repoResults.push(entry);
          allFileResults.push(entry);
        }
      }
      if ((i / BATCH) % 20 === 0) {
        process.stdout.write(`  [${i + batch.length}/${files.length}] `);
      }
    }
    if (files.length > 0) console.log(`  done`);

    const scores = repoResults.filter(r => !r.parseFail).map(r => r.score);
    const throughput = repoDurations.length > 0
      ? (repoDurations.length / repoDurations.reduce((a, b) => a + b, 0) * 1000)
      : 0;

    const summary = {
      name: repo.name,
      lang: repo.lang,
      size: repo.size,
      hasGitHistory: hasHistory,
      totalFiles: files.length,
      analyzed: repoResults.length,
      crashes: crashCount,
      parseFailures: parseFailCount,
      parseFailRate: files.length > 0 ? parseFailCount / files.length : 0,
      crashRate: files.length > 0 ? crashCount / files.length : 0,
      throughput: throughput.toFixed(1),
      durations: percentiles(repoDurations),
      scores: scores.length > 0 ? {
        mean: scores.reduce((a, b) => a + b, 0) / scores.length,
        ...percentiles(scores),
        below9_0: scores.filter(s => s < 9.0).length,
        below9_5: scores.filter(s => s < 9.5).length,
        below9_6: scores.filter(s => s < 9.6).length,
        perfect10: scores.filter(s => s >= 9.9).length,
      } : null,
      errorSamples,
    };
    repoSummaries.push(summary);

    console.log(`  Analyzed: ${summary.analyzed}, Crashes: ${crashCount}, ParseFails: ${parseFailCount}`);
    if (summary.scores) {
      console.log(`  Score: mean=${summary.scores.mean.toFixed(2)}, p50=${summary.scores.p50.toFixed(2)}, <9.0=${summary.scores.below9_0}, <9.5=${summary.scores.below9_5}`);
    }
    console.log(`  Throughput: ${summary.throughput} files/sec, p50=${summary.durations.p50}ms, p95=${summary.durations.p95}ms`);
  }

  // ── Phase 2: Loop convergence on low-scoring files ────────────────────────
  console.log(`\n=== Phase 2: Refactoring Loop on low-scoring files ===`);

  // Select low-scoring files across all repos (score < 7.0), diverse by repo
  const lowFiles = allFileResults
    .filter(r => !r.error && !r.parseFail && r.score != null && r.score < 7.0 && r.score > 0)
    .sort((a, b) => a.score - b.score);

  // Take up to LOOP_SAMPLE from diverse repos
  const selectedForLoop = [];
  const repoQuota = {};
  const maxPerRepo = Math.max(2, Math.ceil(LOOP_SAMPLE / repos.length));
  for (const entry of lowFiles) {
    if (selectedForLoop.length >= LOOP_SAMPLE) break;
    repoQuota[entry.repo] = (repoQuota[entry.repo] || 0);
    if (repoQuota[entry.repo] >= maxPerRepo) continue;
    selectedForLoop.push(entry);
    repoQuota[entry.repo]++;
  }

  console.log(`Selected ${selectedForLoop.length} files for loop testing (score < 7.0)`);
  if (selectedForLoop.length < LOOP_SAMPLE) {
    // Also pull files between 7.0-9.0 if we don't have enough
    const midFiles = allFileResults
      .filter(r => !r.error && !r.parseFail && r.score != null && r.score >= 7.0 && r.score < 9.0)
      .sort((a, b) => a.score - b.score);
    for (const entry of midFiles) {
      if (selectedForLoop.length >= LOOP_SAMPLE) break;
      selectedForLoop.push(entry);
    }
    console.log(`  (augmented to ${selectedForLoop.length} including score 7.0-9.0 files)`);
  }

  const loopResults = [];
  for (const entry of selectedForLoop) {
    const absPath = join(ROOT, entry.file);
    let code;
    try {
      code = await readFile(absPath, 'utf-8');
    } catch (err) {
      console.warn(`  [skip] can't read ${entry.file}: ${err.message}`);
      continue;
    }

    const lang = entry.lang;
    const commentsBefore = countCommentLines(code);
    console.log(`  Loop: ${entry.file} (score=${entry.score.toFixed(2)}, lang=${lang})`);

    const { result: loopResult, error: loopError, durationMs } = await runLoopWithTimeout(code, lang, absPath);

    if (loopError) {
      console.log(`    ERROR: ${loopError.message}`);
      loopResults.push({
        file: entry.file,
        lang,
        scoreBefore: entry.score,
        error: loopError.message,
        durationMs,
      });
      continue;
    }

    const commentsAfter = countCommentLines(loopResult.finalCode);
    const commentInvariantOk = commentsBefore === 0 || commentsAfter >= commentsBefore * 0.9;
    const improved = loopResult.finalScore > entry.score;

    console.log(`    ${entry.score.toFixed(2)} → ${loopResult.finalScore.toFixed(2)} (${loopResult.steps.length} steps, complete=${loopResult.loopComplete}, comments=${commentsBefore}→${commentsAfter} ok=${commentInvariantOk})`);

    loopResults.push({
      file: entry.file,
      lang,
      scoreBefore: entry.score,
      scoreAfter: loopResult.finalScore,
      steps: loopResult.steps.length,
      loopComplete: loopResult.loopComplete,
      improved,
      commentsBefore,
      commentsAfter,
      commentInvariantOk,
      durationMs,
    });
  }

  // ── Phase 3: Aggregate stats ──────────────────────────────────────────────
  const allScores = allFileResults.filter(r => !r.error && !r.parseFail && r.score != null).map(r => r.score);
  const allDurations = allFileResults.filter(r => r.durationMs != null).map(r => r.durationMs);
  const allCrashes = allFileResults.filter(r => r.error);
  const allParseFails = allFileResults.filter(r => r.parseFail);

  const globalStats = {
    totalFiles: allFileResults.length,
    analyzed: allFileResults.filter(r => !r.error).length,
    crashes: allCrashes.length,
    parseFailures: allParseFails.length,
    crashRate: allFileResults.length > 0 ? allCrashes.length / allFileResults.length : 0,
    parseFailRate: allFileResults.length > 0 ? allParseFails.length / allFileResults.length : 0,
    throughputFilesPerSec: allDurations.length > 0
      ? allDurations.length / allDurations.reduce((a, b) => a + b, 0) * 1000
      : 0,
    durations: percentiles(allDurations),
    scoreDistribution: allScores.length > 0 ? {
      mean: allScores.reduce((a, b) => a + b, 0) / allScores.length,
      ...percentiles(allScores),
      below9_0: allScores.filter(s => s < 9.0).length,
      below9_5: allScores.filter(s => s < 9.5).length,
      below9_6: allScores.filter(s => s < 9.6).length,
      perfect10: allScores.filter(s => s >= 9.9).length,
      dist: {
        '1.0-3.0': allScores.filter(s => s >= 1 && s < 3).length,
        '3.0-5.0': allScores.filter(s => s >= 3 && s < 5).length,
        '5.0-7.0': allScores.filter(s => s >= 5 && s < 7).length,
        '7.0-9.0': allScores.filter(s => s >= 7 && s < 9).length,
        '9.0-9.5': allScores.filter(s => s >= 9 && s < 9.5).length,
        '9.5-10.0': allScores.filter(s => s >= 9.5).length,
      },
    } : null,
  };

  const loopStats = {
    totalTested: loopResults.length,
    errors: loopResults.filter(r => r.error).length,
    improved: loopResults.filter(r => r.improved).length,
    converged: loopResults.filter(r => r.loopComplete).length,
    commentInvariantViolations: loopResults.filter(r => !r.error && !r.commentInvariantOk).length,
    avgScoreBefore: loopResults.filter(r => !r.error).map(r => r.scoreBefore).reduce((a, b) => a + b, 0) / Math.max(1, loopResults.filter(r => !r.error).length),
    avgScoreAfter: loopResults.filter(r => !r.error && r.scoreAfter != null).map(r => r.scoreAfter).reduce((a, b) => a + b, 0) / Math.max(1, loopResults.filter(r => !r.error && r.scoreAfter != null).length),
    avgSteps: loopResults.filter(r => !r.error && r.steps != null).map(r => r.steps).reduce((a, b) => a + b, 0) / Math.max(1, loopResults.filter(r => !r.error && r.steps != null).length),
  };

  const robustnessBugs = [];
  for (const crash of allCrashes.slice(0, 20)) {
    robustnessBugs.push({ file: crash.file, error: crash.message });
  }
  for (const r of loopResults.filter(r => r.error)) {
    robustnessBugs.push({ type: 'loop', file: r.file, error: r.error });
  }
  for (const r of loopResults.filter(r => !r.error && !r.commentInvariantOk)) {
    robustnessBugs.push({ type: 'comment-invariant', file: r.file, before: r.commentsBefore, after: r.commentsAfter });
  }

  // ── Save raw JSON results ──────────────────────────────────────────────────
  const resultsDir = join(ROOT, 'scripts', 'benchmarks', 'field-reliability');
  await mkdir(resultsDir, { recursive: true });
  const resultsPath = join(resultsDir, 'results.json');
  await writeFile(resultsPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    globalStats,
    loopStats,
    repoSummaries,
    loopResults,
    robustnessBugs,
    crashes: allCrashes.slice(0, 50),
  }, null, 2));
  console.log(`\nRaw results saved: ${relative(ROOT, resultsPath)}`);

  // ── Generate Markdown report ──────────────────────────────────────────────
  const report = buildReport(globalStats, loopStats, repoSummaries, loopResults, robustnessBugs, allCrashes);
  const reportPath = join(ROOT, 'docs', 'benchmarks', 'field-reliability-report.md');
  await mkdir(join(ROOT, 'docs', 'benchmarks'), { recursive: true });
  await writeFile(reportPath, report);
  console.log(`Report saved: ${relative(ROOT, reportPath)}`);

  // ── Print summary to stdout ───────────────────────────────────────────────
  printSummary(globalStats, loopStats, robustnessBugs);
}

// ── Report builder ────────────────────────────────────────────────────────────

function fmt(n, d = 2) { return typeof n === 'number' ? n.toFixed(d) : '—'; }
function pct(n) { return typeof n === 'number' ? (n * 100).toFixed(1) + '%' : '—'; }

function buildReport(globalStats, loopStats, repoSummaries, loopResults, robustnessBugs, allCrashes) {
  const g = globalStats;
  const ls = loopStats;
  const sd = g.scoreDistribution;
  const dur = g.durations;

  const lines = [
    `# Field-Reliability Report — Healthy AI Code MCP`,
    ``,
    `*Generated: ${new Date().toISOString()}*`,
    ``,
    `## Executive Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total files analyzed | ${g.totalFiles.toLocaleString()} |`,
    `| Crashes (analyzer errors) | ${g.crashes} (${pct(g.crashRate)}) |`,
    `| Parse failures | ${g.parseFailures} (${pct(g.parseFailRate)}) |`,
    `| Throughput | ${fmt(g.throughputFilesPerSec, 1)} files/sec |`,
    `| p50 latency | ${fmt(dur.p50, 0)} ms/file |`,
    `| p95 latency | ${fmt(dur.p95, 0)} ms/file |`,
    `| Mean score | ${sd ? fmt(sd.mean) : '—'} |`,
    `| Files below 9.0 | ${sd ? sd.below9_0.toLocaleString() : '—'} (${sd ? pct(sd.below9_0 / g.analyzed) : '—'}) |`,
    `| Files below 9.5 | ${sd ? sd.below9_5.toLocaleString() : '—'} (${sd ? pct(sd.below9_5 / g.analyzed) : '—'}) |`,
    `| Files below 9.6 | ${sd ? sd.below9_6.toLocaleString() : '—'} (${sd ? pct(sd.below9_6 / g.analyzed) : '—'}) |`,
    `| Loop: files tested | ${ls.totalTested} |`,
    `| Loop: improved | ${ls.improved} / ${ls.totalTested - ls.errors} (${pct(ls.improved / Math.max(1, ls.totalTested - ls.errors))}) |`,
    `| Loop: converged (>=9.5) | ${ls.converged} |`,
    `| Comment-invariant violations | ${ls.commentInvariantViolations} |`,
    ``,
    `## Score Distribution`,
    ``,
    `| Bucket | Count | % of analyzed |`,
    `|--------|-------|---------------|`,
  ];

  if (sd) {
    for (const [bucket, count] of Object.entries(sd.dist)) {
      lines.push(`| ${bucket} | ${count.toLocaleString()} | ${pct(count / g.analyzed)} |`);
    }
  }

  lines.push(
    ``,
    `## Per-Repo Summary`,
    ``,
    `| Repo | Lang | Files | Crashes | ParseFails | Mean score | <9.0 | <9.5 | p50ms | p95ms | files/sec |`,
    `|------|------|-------|---------|------------|------------|------|------|-------|-------|-----------|`,
  );

  for (const r of repoSummaries) {
    const s = r.scores;
    lines.push(
      `| ${r.name} | ${r.lang} | ${r.totalFiles} | ${r.crashes} | ${r.parseFailures} ` +
      `| ${s ? fmt(s.mean) : '—'} | ${s ? s.below9_0 : '—'} | ${s ? s.below9_5 : '—'} ` +
      `| ${fmt(r.durations.p50, 0)} | ${fmt(r.durations.p95, 0)} | ${r.throughput} |`
    );
  }

  lines.push(
    ``,
    `## Loop Convergence Results`,
    ``,
    `| File | Lang | Score before | Score after | Steps | Converged | Comment invariant OK |`,
    `|------|------|-------------|-------------|-------|-----------|---------------------|`,
  );

  const loopDisplay = loopResults.slice(0, 50);
  for (const r of loopDisplay) {
    if (r.error) {
      lines.push(`| ${r.file.replace(/\\/g, '/')} | ${r.lang || '?'} | ${fmt(r.scoreBefore)} | ERROR: ${r.error.slice(0, 40)} | — | — | — |`);
    } else {
      lines.push(
        `| ${r.file.replace(/\\/g, '/')} | ${r.lang} | ${fmt(r.scoreBefore)} | ${fmt(r.scoreAfter)} ` +
        `| ${r.steps} | ${r.loopComplete ? 'yes' : 'no'} | ${r.commentInvariantOk ? 'yes' : 'NO'} |`
      );
    }
  }

  lines.push(
    ``,
    `### Loop Aggregate Stats`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files tested | ${ls.totalTested} |`,
    `| Loop errors | ${ls.errors} |`,
    `| Files improved | ${ls.improved} |`,
    `| Files converged (>=9.5) | ${ls.converged} |`,
    `| Comment-invariant violations | ${ls.commentInvariantViolations} |`,
    `| Avg score before | ${fmt(ls.avgScoreBefore)} |`,
    `| Avg score after | ${fmt(ls.avgScoreAfter)} |`,
    `| Avg steps per file | ${fmt(ls.avgSteps)} |`,
  );

  if (robustnessBugs.length > 0) {
    lines.push(
      ``,
      `## Robustness Issues Found`,
      ``,
      `| # | Type | File | Detail |`,
      `|---|------|------|--------|`,
    );
    robustnessBugs.slice(0, 30).forEach((bug, i) => {
      const type = bug.type || 'crash';
      const detail = bug.error || `comments: ${bug.before}→${bug.after}`;
      lines.push(`| ${i + 1} | ${type} | ${(bug.file || '').replace(/\\/g, '/').slice(0, 60)} | ${(detail || '').slice(0, 80)} |`);
    });
  } else {
    lines.push(
      ``,
      `## Robustness Issues Found`,
      ``,
      `None detected.`,
    );
  }

  lines.push(
    ``,
    `## Methodology`,
    ``,
    `- **Corpus**: 13 OSS repos across 10 languages (Python, TypeScript, JavaScript, Go, Java, Ruby, Rust, PHP, C#, Kotlin)`,
    `- **Analysis**: \`analyzeFile()\` per file; \`analyzeFileWithHistory()\` where git depth-50 history available`,
    `- **Loop sample**: top-${Math.min(loopResults.length, LOOP_SAMPLE)} lowest-scoring files (score < 9.0) run through \`runRefactoringLoop(maxIterations=15)\``,
    `- **Timeout**: ${TIMEOUT_MS}ms per file, 5× for loop`,
    `- **Comment invariant**: loop edit rejected if comments drop below 90% of original count`,
    ``,
  );

  return lines.join('\n');
}

function printSummary(g, ls, robustnessBugs) {
  const sd = g.scoreDistribution;
  console.log('\n' + '='.repeat(60));
  console.log('FIELD-RELIABILITY SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total files:        ${g.totalFiles.toLocaleString()}`);
  console.log(`Crashes:            ${g.crashes} (${pct(g.crashRate)})`);
  console.log(`Parse failures:     ${g.parseFailures} (${pct(g.parseFailRate)})`);
  console.log(`Throughput:         ${fmt(g.throughputFilesPerSec, 1)} files/sec`);
  console.log(`Latency p50/p95:    ${fmt(g.durations.p50, 0)}ms / ${fmt(g.durations.p95, 0)}ms`);
  if (sd) {
    console.log(`Mean score:         ${fmt(sd.mean)}`);
    console.log(`Below 9.0:          ${sd.below9_0.toLocaleString()} (${pct(sd.below9_0 / g.analyzed)})`);
    console.log(`Below 9.5:          ${sd.below9_5.toLocaleString()} (${pct(sd.below9_5 / g.analyzed)})`);
    console.log(`Below 9.6:          ${sd.below9_6.toLocaleString()} (${pct(sd.below9_6 / g.analyzed)})`);
  }
  console.log(`Loop tested:        ${ls.totalTested}`);
  console.log(`Loop improved:      ${ls.improved} / ${ls.totalTested - ls.errors}`);
  console.log(`Loop converged:     ${ls.converged}`);
  console.log(`Comment invariant:  ${ls.commentInvariantViolations} violations`);
  console.log(`Robustness bugs:    ${robustnessBugs.length}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
