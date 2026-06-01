#!/usr/bin/env node
/**
 * Competitive benchmark harness — Track #1a
 *
 * Runs every ACTUALLY-runnable analyzer (per tools-availability.json) on the same
 * labeled files (MLCQ + Defects4J), normalizes each tool's output to a per-file
 * risk signal [0,1], and writes raw results to benchmark-data/competitive-raw.json.
 *
 * Ground-truth labels come from external human annotations (MLCQ multi-reviewer
 * majority vote; Defects4J human-curated bug database) — NOT from our own score.
 *
 * Usage:
 *   node scripts/benchmarks/competitive/run.mjs
 *   node scripts/benchmarks/competitive/run.mjs --dry-run   # parse + show plan, no tools
 *   node scripts/benchmarks/competitive/run.mjs --skip-pmd  # skip PMD (slow)
 *   node scripts/benchmarks/competitive/run.mjs --skip-lizard
 *
 * Exit 0 on success; exit 1 on fatal error.
 */

import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execFileP = promisify(execFile);
const execP = promisify(exec);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MLCQ_DIR = path.join(REPO_ROOT, 'benchmark-data', 'mlcq');
const MLCQ_MANIFEST = path.join(MLCQ_DIR, 'mlcq-manifest.json');
const D4J_JSON = path.join(REPO_ROOT, 'benchmark-data', 'defects4j', 'defects4j-labeled.json');
const TOOLS_JSON = path.join(REPO_ROOT, 'benchmark-data', 'tools-availability.json');
const OUT_JSON = path.join(REPO_ROOT, 'benchmark-data', 'competitive-raw.json');

// On Windows, pmd is a .bat file and requires exec (shell) not execFile
const PMD_BIN = path.join(REPO_ROOT, 'tools', 'pmd-bin-7.10.0', 'bin', 'pmd.bat');
const GOCYCLO_BIN = 'C:\\Users\\david\\go\\bin\\gocyclo.exe';
// Python with lizard and radon installed
const PYTHON_BIN = 'C:\\Users\\david\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';

// PMD rulesets to use for code-smell detection
const PMD_RULESETS = 'category/java/design.xml,category/java/bestpractices.xml,category/java/performance.xml';

// Timeout for external tool calls per file (ms)
const TOOL_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const SKIP_PMD = argv.includes('--skip-pmd');
const SKIP_LIZARD = argv.includes('--skip-lizard');

// ---------------------------------------------------------------------------
// Dynamic import of our core package (CJS)
// ---------------------------------------------------------------------------
let analyzeCode;
async function loadCore() {
  const coreDist = path.join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileUrl(coreDist).href);
  analyzeCode = core.analyzeCode;
}

function pathToFileUrl(p) {
  return { href: 'file:///' + p.replace(/\\/g, '/') };
}

// Node 22+ supports import(file:///...) but let's use createRequire for CJS compat
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function loadCoreSync() {
  const coreDist = path.join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js');
  const core = require(coreDist);
  analyzeCode = core.analyzeCode;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Our tool: score is 1–10 (10=healthy, 1=worst).
 * riskSignal = (10 - score) / 9  => 0 (healthy) to 1 (worst).
 */
function normalizeOurs(score) {
  const clamped = Math.max(1, Math.min(10, score));
  return (10 - clamped) / 9;
}

/**
 * PMD: violation count per 100 NLOC.
 * We normalize with a soft cap: signal = log1p(density) / log1p(5)
 * where density = violationCount / max(1, nlocEst / 100)
 *
 * If NLOC is not available, use raw count with log1p(count)/log1p(30) cap.
 */
function normalizePmd(violationCount, nloc) {
  if (nloc && nloc > 0) {
    const density = violationCount / (nloc / 100);
    return Math.min(1, Math.log1p(density) / Math.log1p(5));
  }
  return Math.min(1, Math.log1p(violationCount) / Math.log1p(30));
}

/**
 * lizard: use max CCN across all functions.
 * signal = min(1, maxCCN / 30)   (linear; CCN>30 => saturated at 1.0)
 * If no functions found, signal = 0.
 */
function normalizeLizard(maxCCN) {
  if (maxCCN == null || maxCCN <= 0) return 0;
  return Math.min(1, maxCCN / 30);
}

/**
 * radon: Maintainability Index (A=100, F=0).
 * Lower MI = worse. signal = (100 - MI) / 100.
 */
function normalizeRadon(mi) {
  if (mi == null) return null;
  return Math.max(0, Math.min(1, (100 - mi) / 100));
}

/**
 * gocyclo: max cyclomatic complexity.
 * signal = min(1, maxCC / 30).
 */
function normalizeGocyclo(maxCC) {
  if (maxCC == null || maxCC <= 0) return 0;
  return Math.min(1, maxCC / 30);
}

// ---------------------------------------------------------------------------
// Ground truth helpers
// ---------------------------------------------------------------------------

/**
 * MLCQ: positive = minor/major/critical, negative = none.
 */
function mlcqHasSmell(severityLabel) {
  return severityLabel !== 'none';
}

// ---------------------------------------------------------------------------
// Our tool runner
// ---------------------------------------------------------------------------

function runOurs(code, language) {
  try {
    const result = analyzeCode(code, language);
    return {
      score: result.score,
      smellCount: result.smells ? result.smells.length : 0,
      smellTypes: result.smells ? result.smells.map(s => s.type) : [],
      riskSignal: normalizeOurs(result.score),
    };
  } catch (err) {
    return { error: err.message, riskSignal: null };
  }
}

// ---------------------------------------------------------------------------
// PMD runner — batch via --file-list, with huge-file fallback
// ---------------------------------------------------------------------------

/** Max file size to include in a PMD batch (bytes). Larger files run individually. */
const PMD_BATCH_MAX_FILE_SIZE = 1_000_000; // 1MB
/** Batch size for --file-list invocations. */
const PMD_BATCH_SIZE = 50;
/** Timeout for a batch of 50 files (ms). */
const PMD_BATCH_TIMEOUT_MS = 120_000; // 2 minutes
/** Timeout for a single huge file (ms). */
const PMD_HUGE_FILE_TIMEOUT_MS = 60_000;

/**
 * Run PMD on a list of files, returning a map of basename -> pmdResult.
 * Files > PMD_BATCH_MAX_FILE_SIZE are run individually (with longer timeout).
 * Files that timeout or error get { error, riskSignal: null }.
 */
async function runPmdBatch(filePaths) {
  const results = new Map(); // basename -> pmdResult

  // Partition by size
  const normal = [];
  const huge = [];
  for (const fp of filePaths) {
    let size = 0;
    try { size = fsSync.statSync(fp).size; } catch {}
    if (size > PMD_BATCH_MAX_FILE_SIZE) huge.push(fp);
    else normal.push(fp);
  }

  // Process normal files in batches of PMD_BATCH_SIZE
  for (let offset = 0; offset < normal.length; offset += PMD_BATCH_SIZE) {
    const batch = normal.slice(offset, offset + PMD_BATCH_SIZE);
    const batchResults = await runPmdSingleInvocation(batch, PMD_BATCH_TIMEOUT_MS);
    for (const [k, v] of batchResults) results.set(k, v);
  }

  // Process huge files individually
  for (const fp of huge) {
    const r = await runPmdSingleInvocation([fp], PMD_HUGE_FILE_TIMEOUT_MS);
    for (const [k, v] of r) results.set(k, v);
  }

  return results;
}

/**
 * Single PMD invocation on a list of files via --file-list.
 * Returns Map<basename, pmdResult>.
 */
async function runPmdSingleInvocation(filePaths, timeoutMs) {
  const fileListPath = path.join(os.tmpdir(), `pmd-fl-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const reportFile = path.join(os.tmpdir(), `pmd-out-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const results = new Map();

  // Pre-populate with error for all files (will be overwritten on success)
  for (const fp of filePaths) {
    results.set(path.basename(fp), { error: 'not-run', riskSignal: null });
  }

  try {
    await fs.writeFile(fileListPath, filePaths.join('\n'), 'utf8');

    // PMD on Windows is a .bat file — must use exec (shell) not execFile
    const cmd = `"${PMD_BIN}" check --file-list "${fileListPath}" -R "${PMD_RULESETS}" -f json -r "${reportFile}" --no-progress`;
    try {
      await withTimeout(
        execP(cmd, { timeout: timeoutMs }),
        timeoutMs,
        'PMD batch timeout'
      );
    } catch (err) {
      // exit code 4 = violations found (expected) — PMD still writes the report
      // Check if timeout vs. actual failure
      if (err.message && err.message.includes('PMD batch timeout')) {
        for (const fp of filePaths) {
          results.set(path.basename(fp), { error: 'timeout', riskSignal: null });
        }
        return results;
      }
      // Non-zero exit (e.g. code 4) is normal for PMD — fall through and read report
    }

    // Read report
    let report;
    try {
      const raw = await fs.readFile(reportFile, 'utf8');
      report = JSON.parse(raw);
    } catch {
      // Could not read report — all files get error
      return results;
    }

    // Parse per-file results
    for (const fileEntry of (report.files || [])) {
      const fname = path.basename(fileEntry.filename || '');
      const violations = fileEntry.violations || [];
      const violationCount = violations.length;
      const ruleHits = {};
      for (const v of violations) {
        ruleHits[v.rule] = (ruleHits[v.rule] || 0) + 1;
      }
      results.set(fname, {
        violationCount,
        topRules: Object.entries(ruleHits).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([r,c])=>({rule:r,count:c})),
        riskSignal: normalizePmd(violationCount, null),
      });
    }

    // Files in the batch but NOT in the report had 0 violations (PMD omits them)
    for (const fp of filePaths) {
      const fname = path.basename(fp);
      if (!results.has(fname) || results.get(fname)?.error === 'not-run') {
        results.set(fname, { violationCount: 0, topRules: [], riskSignal: 0 });
      }
    }

    return results;
  } finally {
    try { await fs.unlink(fileListPath); } catch {}
    try { await fs.unlink(reportFile); } catch {}
  }
}

/**
 * Run PMD on a single temp file (for Defects4J inline code).
 * Returns a single pmdResult.
 */
async function runPmdSingleFile(filePath) {
  const batchMap = await runPmdSingleInvocation([filePath], PMD_HUGE_FILE_TIMEOUT_MS);
  return batchMap.get(path.basename(filePath)) ?? { error: 'no-result', riskSignal: null };
}

// ---------------------------------------------------------------------------
// lizard runner (per-file via Python)
// ---------------------------------------------------------------------------

async function runLizard(filePath) {
  try {
    const { stdout } = await withTimeout(
      execFileP(PYTHON_BIN, ['-m', 'lizard', filePath, '--csv'], { timeout: TOOL_TIMEOUT_MS, windowsHide: true }),
      TOOL_TIMEOUT_MS,
      'lizard timeout'
    );

    // CSV cols (0-indexed): 0=CCN, 1=NLOC, 2=token, 3=param, 4=nesting, 5=fullname, 6=file, 7=name, 8=sig, 9=start, 10=end
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    let maxCCN = 0;
    let totalCCN = 0;
    let funcCount = 0;
    let warningCount = 0;
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const ccn = parseInt(parts[0], 10);
      if (isNaN(ccn)) continue;
      funcCount++;
      totalCCN += ccn;
      if (ccn > maxCCN) maxCCN = ccn;
      if (ccn > 15) warningCount++;
    }

    return {
      maxCCN,
      avgCCN: funcCount > 0 ? Math.round((totalCCN / funcCount) * 100) / 100 : 0,
      funcCount,
      warningCount,
      riskSignal: normalizeLizard(maxCCN),
    };
  } catch (err) {
    if (err.message && err.message.includes('lizard timeout')) return { error: 'timeout', riskSignal: null };
    return { error: err.message, riskSignal: null };
  }
}

// ---------------------------------------------------------------------------
// radon runner (per-file, Python only)
// ---------------------------------------------------------------------------

async function runRadon(filePath) {
  try {
    const { stdout } = await withTimeout(
      execFileP(PYTHON_BIN, ['-m', 'radon', 'mi', filePath, '-s'], { timeout: TOOL_TIMEOUT_MS, windowsHide: true }),
      TOOL_TIMEOUT_MS,
      'radon timeout'
    );
    // Output: "filename - Grade (MI)"  e.g.  "foo.py - A (72.3)"
    const match = stdout.match(/\(([0-9.]+)\)/);
    if (!match) return { error: 'parse-error', riskSignal: null };
    const mi = parseFloat(match[1]);
    return { mi, riskSignal: normalizeRadon(mi) };
  } catch (err) {
    if (err.message && err.message.includes('radon timeout')) return { error: 'timeout', riskSignal: null };
    return { error: err.message, riskSignal: null };
  }
}

// ---------------------------------------------------------------------------
// gocyclo runner
// ---------------------------------------------------------------------------

async function runGocyclo(filePath) {
  try {
    const { stdout } = await withTimeout(
      execFileP(GOCYCLO_BIN, [filePath], { timeout: TOOL_TIMEOUT_MS, windowsHide: true }),
      TOOL_TIMEOUT_MS,
      'gocyclo timeout'
    );
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    let maxCC = 0;
    for (const line of lines) {
      const m = line.match(/^(\d+)\s/);
      if (m) {
        const cc = parseInt(m[1], 10);
        if (cc > maxCC) maxCC = cc;
      }
    }
    return { maxCC, riskSignal: normalizeGocyclo(maxCC) };
  } catch (err) {
    if (err.message && err.message.includes('gocyclo timeout')) return { error: 'timeout', riskSignal: null };
    return { error: err.message, riskSignal: null };
  }
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100);
  process.stderr.write(`\r  ${label}: ${current}/${total} (${pct}%)  `);
}

// ---------------------------------------------------------------------------
// MLCQ benchmark
// ---------------------------------------------------------------------------

async function runMlcq(toolsConfig) {
  console.log('\n[MLCQ] Loading manifest...');
  const manifest = JSON.parse(await fs.readFile(MLCQ_MANIFEST, 'utf8'));
  console.log(`  ${manifest.length} manifest entries`);

  // Build per-file work list (deduplicated by localFile)
  const fileMap = new Map(); // basename -> entry (first occurrence)
  for (const entry of manifest) {
    const key = path.basename(entry.localFile);
    if (!fileMap.has(key)) fileMap.set(key, entry);
  }
  const uniqueFiles = [...fileMap.values()];
  console.log(`  ${uniqueFiles.length} unique Java files`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would run: ours' +
      (toolsConfig.lizard && !SKIP_LIZARD ? ' + lizard' : '') +
      (toolsConfig.pmd && !SKIP_PMD ? ' + PMD' : ''));
    return [];
  }

  // Cache per-file tool results
  const fileResults = new Map(); // basename -> { ours, pmd?, lizard? }

  // Files > OURS_MAX_FILE_SIZE take too long for our tree-sitter analysis.
  // Skip them and document in metadata. (7 files, 12 manifest entries out of 358.)
  const OURS_MAX_FILE_SIZE = 500_000; // 500KB — above this, analysis takes >30s

  // 1. Our tool — run inline (skip files > 500KB)
  console.log('  Running: healthy-ai-code (ours)...');
  let i = 0;
  let ourSkipped = 0;
  for (const entry of uniqueFiles) {
    i++;
    progress(i, uniqueFiles.length, 'ours');
    const filePath = path.join(MLCQ_DIR, entry.localFile);
    let code;
    let fileSize = 0;
    try {
      fileSize = fsSync.statSync(filePath).size;
    } catch {}
    if (fileSize > OURS_MAX_FILE_SIZE) {
      fileResults.set(path.basename(entry.localFile), { ours: { error: 'file-too-large', fileSizeKB: Math.round(fileSize/1024), riskSignal: null } });
      ourSkipped++;
      continue;
    }
    try {
      code = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      fileResults.set(path.basename(entry.localFile), { ours: { error: 'file-read-error', riskSignal: null } });
      continue;
    }
    const oursResult = runOurs(code, 'java');
    fileResults.set(path.basename(entry.localFile), { ours: oursResult });
  }
  process.stderr.write('\n');
  if (ourSkipped > 0) console.log(`    [NOTE] ${ourSkipped} files >500KB skipped for ours (tree-sitter too slow; documented in meta)`);

  // 2. lizard — batch run on directory, then parse CSV
  if (toolsConfig.lizard && !SKIP_LIZARD) {
    console.log('  Running: lizard (batch on java_files/)...');
    try {
      const javaDir = path.join(MLCQ_DIR, 'java_files');
      const csvOut = path.join(os.tmpdir(), `lizard-mlcq-${Date.now()}.csv`);
      await withTimeout(
        execFileP(PYTHON_BIN, ['-m', 'lizard', javaDir, '--csv', '-o', csvOut], { timeout: 180_000, windowsHide: true }),
        180_000,
        'lizard batch timeout'
      );
      // Parse CSV and aggregate per file
      const lizardCsv = await fs.readFile(csvOut, 'utf8');
      await fs.unlink(csvOut).catch(() => {});
      const lizardByFile = parseLizardCsv(lizardCsv);
      for (const [fname, lz] of lizardByFile) {
        const existing = fileResults.get(fname) || {};
        existing.lizard = lz;
        fileResults.set(fname, existing);
      }
      console.log(`    lizard parsed ${lizardByFile.size} files`);
    } catch (err) {
      console.error(`  [WARN] lizard batch failed: ${err.message}. Falling back to per-file.`);
      // Fallback: per-file
      let j = 0;
      for (const entry of uniqueFiles) {
        j++;
        progress(j, uniqueFiles.length, 'lizard');
        const filePath = path.join(MLCQ_DIR, entry.localFile);
        const lzResult = await runLizard(filePath);
        const existing = fileResults.get(path.basename(entry.localFile)) || {};
        existing.lizard = lzResult;
        fileResults.set(path.basename(entry.localFile), existing);
      }
      process.stderr.write('\n');
    }
  }

  // 3. PMD — batched via --file-list (50 files/batch), huge files individually
  if (toolsConfig.pmd && !SKIP_PMD) {
    const allPaths = uniqueFiles.map(e => path.join(MLCQ_DIR, e.localFile));
    const hugeCount = allPaths.filter(p => { try { return fsSync.statSync(p).size > PMD_BATCH_MAX_FILE_SIZE; } catch { return false; } }).length;
    const batchCount = Math.ceil((allPaths.length - hugeCount) / PMD_BATCH_SIZE);
    console.log(`  Running: PMD (${batchCount} batches of ${PMD_BATCH_SIZE} + ${hugeCount} huge files individually)...`);
    const pmdAllResults = await runPmdBatch(allPaths);
    for (const [fname, pmdResult] of pmdAllResults) {
      const existing = fileResults.get(fname) || {};
      existing.pmd = pmdResult;
      fileResults.set(fname, existing);
    }
    const covered = [...pmdAllResults.values()].filter(r => r.riskSignal != null).length;
    console.log(`    PMD: ${covered}/${allPaths.length} files with signal`);
  }

  // Build output rows (one per manifest entry, joined back)
  const rows = [];
  for (const entry of manifest) {
    const fname = path.basename(entry.localFile);
    const fileRes = fileResults.get(fname) || {};
    rows.push({
      sampleId: entry.sampleId,
      localFile: entry.localFile,
      smellType: entry.smellType,
      severityLabel: entry.severityLabel,
      hasSmell: mlcqHasSmell(entry.severityLabel),
      codeName: entry.codeName,
      results: {
        healthy_ai_code: fileRes.ours ?? null,
        ...(toolsConfig.lizard && !SKIP_LIZARD ? { lizard: fileRes.lizard ?? null } : {}),
        ...(toolsConfig.pmd && !SKIP_PMD ? { pmd: fileRes.pmd ?? null } : {}),
      },
    });
  }

  const positives = rows.filter(r => r.hasSmell).length;
  const negatives = rows.filter(r => !r.hasSmell).length;
  console.log(`  MLCQ: ${rows.length} rows (${positives} positive, ${negatives} negative)`);

  // Quick sanity: count null risk signals
  for (const tool of ['healthy_ai_code', 'lizard', 'pmd']) {
    if (!rows[0]?.results[tool] === undefined) continue;
    const nullCount = rows.filter(r => r.results[tool]?.riskSignal == null).length;
    if (nullCount > 0) console.log(`    [WARN] ${tool}: ${nullCount} null riskSignal`);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Parse lizard CSV output (per-function) -> per-file aggregates
// ---------------------------------------------------------------------------

function parseLizardCsv(csv) {
  const byFile = new Map();
  for (const line of csv.trim().split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 7) continue;
    const ccn = parseInt(parts[0], 10);
    if (isNaN(ccn)) continue;
    // File path is field index 6 (0-indexed), quoted
    const rawFile = parts[6].replace(/"/g, '').trim();
    const fname = path.basename(rawFile);
    if (!byFile.has(fname)) {
      byFile.set(fname, { maxCCN: 0, totalCCN: 0, funcCount: 0, warningCount: 0 });
    }
    const agg = byFile.get(fname);
    agg.funcCount++;
    agg.totalCCN += ccn;
    if (ccn > agg.maxCCN) agg.maxCCN = ccn;
    if (ccn > 15) agg.warningCount++;
  }
  // Convert to normalized form
  const result = new Map();
  for (const [fname, agg] of byFile) {
    result.set(fname, {
      maxCCN: agg.maxCCN,
      avgCCN: agg.funcCount > 0 ? Math.round((agg.totalCCN / agg.funcCount) * 100) / 100 : 0,
      funcCount: agg.funcCount,
      warningCount: agg.warningCount,
      riskSignal: normalizeLizard(agg.maxCCN),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Defects4J benchmark
// ---------------------------------------------------------------------------

async function runDefects4j(toolsConfig) {
  console.log('\n[Defects4J] Loading labeled JSON...');
  // Raw JSON: [{project, bugId, className, buggyCode, fixedCode}, ...]
  // We expand each record into 2 rows: one buggy (hasBug=true) + one fixed (hasBug=false).
  const rawRecords = JSON.parse(await fs.readFile(D4J_JSON, 'utf8'));
  console.log(`  ${rawRecords.length} base records => ${rawRecords.length * 2} rows (buggy+fixed)`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would run: ours' +
      (toolsConfig.lizard && !SKIP_LIZARD ? ' + lizard' : '') +
      (toolsConfig.pmd && !SKIP_PMD ? ' + PMD' : ''));
    return [];
  }

  // Expand: each raw record produces 2 work items
  const workItems = [];
  for (const rec of rawRecords) {
    if (rec.buggyCode) workItems.push({ ...rec, hasBug: true, code: rec.buggyCode });
    if (rec.fixedCode) workItems.push({ ...rec, hasBug: false, code: rec.fixedCode });
  }

  const rows = [];
  let i = 0;
  for (const item of workItems) {
    i++;
    progress(i, workItems.length, 'Defects4J');

    const { code, hasBug, project, bugId, className } = item;
    const language = 'java';
    const variant = hasBug ? 'buggy' : 'fixed';
    const codeSizeBytes = Buffer.byteLength(code, 'utf8');
    const D4J_MAX_SIZE = 500_000;

    // Write code to temp file (needed for PMD and lizard)
    const tmpFile = path.join(os.tmpdir(), `d4j-bench-${project}-${bugId}-${variant}-${Date.now()}.java`);
    let tmpFileWritten = false;
    try {
      await fs.writeFile(tmpFile, code, 'utf8');
      tmpFileWritten = true;
    } catch (err) {
      // Will fall back to ours-only
    }

    let oursResult;
    if (codeSizeBytes > D4J_MAX_SIZE) {
      oursResult = { error: 'file-too-large', fileSizeKB: Math.round(codeSizeBytes/1024), riskSignal: null };
    } else {
      oursResult = runOurs(code, language);
    }
    const results = { healthy_ai_code: oursResult };

    if (tmpFileWritten) {
      if (toolsConfig.lizard && !SKIP_LIZARD) {
        results.lizard = await runLizard(tmpFile);
      }
      if (toolsConfig.pmd && !SKIP_PMD) {
        results.pmd = await runPmdSingleFile(tmpFile);
      }
    }

    rows.push({
      project,
      bugId,
      variant,
      className: className || '',
      hasBug,
      language,
      results,
    });

    // Clean up temp file
    if (tmpFileWritten) {
      try { await fs.unlink(tmpFile); } catch {}
    }
  }
  process.stderr.write('\n');

  const buggy = rows.filter(r => r.hasBug).length;
  const fixed = rows.filter(r => !r.hasBug).length;
  console.log(`  Defects4J: ${rows.length} rows (${buggy} buggy, ${fixed} fixed)`);

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Competitive Benchmark Harness (Track #1a) ===');
  console.log(`  Repo: ${REPO_ROOT}`);
  console.log(`  Output: ${OUT_JSON}`);
  if (DRY_RUN) console.log('  [DRY RUN MODE]');
  if (SKIP_PMD) console.log('  [--skip-pmd]');
  if (SKIP_LIZARD) console.log('  [--skip-lizard]');

  // Load tools availability
  const toolsAvail = JSON.parse(await fs.readFile(TOOLS_JSON, 'utf8'));
  const toolMap = {};
  for (const t of toolsAvail.tools) {
    toolMap[t.tool.toLowerCase().replace(/[^a-z0-9]/g, '_')] = t;
  }

  const toolsConfig = {
    ours: true, // always
    pmd: toolMap['pmd']?.runnable ?? false,
    lizard: toolMap['lizard']?.runnable ?? false,
    radon: toolMap['radon']?.runnable ?? false,
    gocyclo: toolMap['gocyclo']?.runnable ?? false,
    sonarqube: toolMap['sonarqube_community']?.runnable ?? false, // heavy, skip in harness
  };

  console.log('\nRunnable tools (per tools-availability.json):');
  console.log('  ours (healthy-ai-code): always');
  for (const [t, v] of Object.entries(toolsConfig)) {
    if (t === 'ours' || t === 'sonarqube') continue;
    console.log(`  ${t}: ${v ? 'YES' : 'NO (skipped)'}`);
  }
  // SonarQube: too heavy for per-file harness (needs Docker + scanner)
  console.log('  sonarqube: excluded (Docker-based, not suitable for per-file harness)');

  // Load our core
  console.log('\nLoading healthy-ai-code core...');
  loadCoreSync();
  console.log('  analyzeCode loaded.');

  // Run benchmarks
  const startAll = Date.now();

  const mlcqRows = await runMlcq(toolsConfig);
  const d4jRows = await runDefects4j(toolsConfig);

  const elapsed = Math.round((Date.now() - startAll) / 1000);

  // Build meta summary
  const toolsRan = ['healthy_ai_code'];
  if (toolsConfig.lizard && !SKIP_LIZARD) toolsRan.push('lizard');
  if (toolsConfig.pmd && !SKIP_PMD) toolsRan.push('pmd');

  // Compute basic coverage stats
  const mlcqStats = computeStats(mlcqRows, toolsRan);
  const d4jStats = computeStats(d4jRows, toolsRan);

  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      elapsedSeconds: elapsed,
      toolsRan,
      toolsSkipped: [
        ...(SKIP_PMD || !toolsConfig.pmd ? ['pmd'] : []),
        ...(SKIP_LIZARD || !toolsConfig.lizard ? ['lizard'] : []),
        'sonarqube_community (excluded: Docker/per-file not practical)',
        'codescene (no license)',
        'deepsource (hosted SaaS)',
        'radon (Python-only; MLCQ+D4J are Java)',
        'gocyclo (Go-only; MLCQ+D4J are Java)',
      ],
      normalizationSchema: {
        healthy_ai_code: '(10 - score) / 9  [0=healthy, 1=worst]',
        pmd: 'log1p(violationCount) / log1p(30)  [soft-capped]',
        lizard: 'min(1, maxCCN / 30)  [linear, saturates at 30]',
        radon: '(100 - MI) / 100  [Maintainability Index inverted]',
        gocyclo: 'min(1, maxCC / 30)',
      },
      groundTruth: {
        mlcq: 'External human majority-vote labels (Madeyski & Lewowski, EASE 2020, Zenodo DOI 10.5281/zenodo.3666840). positive=minor|major|critical, negative=none.',
        defects4j: 'External human-curated bug database (Just et al., ISSTA 2014). hasBug=true for buggy commit, false for fixed commit.',
      },
      mlcqStats,
      d4jStats,
    },
    mlcq: mlcqRows,
    defects4j: d4jRows,
  };

  if (!DRY_RUN) {
    await fs.writeFile(OUT_JSON, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\nWrote ${OUT_JSON}`);
  } else {
    console.log('\n[DRY RUN] Would write competitive-raw.json');
  }

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Tools ran: ${toolsRan.join(', ')}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`\nMLCQ (${mlcqRows.length} entries, ${mlcqRows.filter(r=>r.hasSmell).length} positive):`);
  for (const tool of toolsRan) {
    const covered = mlcqRows.filter(r => r.results[tool]?.riskSignal != null).length;
    console.log(`  ${tool}: ${covered}/${mlcqRows.length} covered`);
    if (mlcqRows.length > 0 && covered > 0) {
      printSample(tool, mlcqRows);
    }
  }
  console.log(`\nDefects4J (${d4jRows.length} records, ${d4jRows.filter(r=>r.hasBug).length} buggy):`);
  for (const tool of toolsRan) {
    const covered = d4jRows.filter(r => r.results[tool]?.riskSignal != null).length;
    console.log(`  ${tool}: ${covered}/${d4jRows.length} covered`);
  }
}

function computeStats(rows, toolsRan) {
  const out = {};
  for (const tool of toolsRan) {
    const covered = rows.filter(r => r.results[tool]?.riskSignal != null);
    // Support both MLCQ (hasSmell) and Defects4J (hasBug)
    const positive = covered.filter(r => r.hasSmell === true || r.hasBug === true);
    const negative = covered.filter(r => r.hasSmell === false || r.hasBug === false);
    const avgPos = positive.length > 0
      ? positive.reduce((s,r) => s + r.results[tool].riskSignal, 0) / positive.length : null;
    const avgNeg = negative.length > 0
      ? negative.reduce((s,r) => s + r.results[tool].riskSignal, 0) / negative.length : null;
    out[tool] = {
      covered: covered.length,
      total: rows.length,
      positiveCount: positive.length,
      negativeCount: negative.length,
      avgRiskPositive: avgPos != null ? Math.round(avgPos * 1000) / 1000 : null,
      avgRiskNegative: avgNeg != null ? Math.round(avgNeg * 1000) / 1000 : null,
    };
  }
  return out;
}

function printSample(tool, rows) {
  // Show one positive and one negative
  const pos = rows.find(r => (r.hasSmell === true || r.hasBug === true) && r.results[tool]?.riskSignal != null);
  const neg = rows.find(r => (r.hasSmell === false || r.hasBug === false) && r.results[tool]?.riskSignal != null);
  if (pos) {
    const f = path.basename(pos.localFile || pos.className || pos.codeName || '');
    const label = pos.severityLabel || (pos.hasBug ? 'bug' : 'fixed');
    console.log(`    + positive: ${f} | signal=${pos.results[tool].riskSignal.toFixed(3)} | label=${label}`);
  }
  if (neg) {
    const f = path.basename(neg.localFile || neg.className || neg.codeName || '');
    const label = neg.severityLabel || (neg.hasBug ? 'bug' : 'none/fixed');
    console.log(`    - negative: ${f} | signal=${neg.results[tool].riskSignal.toFixed(3)} | label=${label}`);
  }
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
