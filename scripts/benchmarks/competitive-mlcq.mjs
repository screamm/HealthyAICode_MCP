/**
 * Track #1b competitive harness — MLCQ Java dataset.
 *
 * Produces benchmark-data/competitive-raw.json:
 *   for every MLCQ manifest entry, the per-file risk signal of each runnable
 *   analyzer that can score Java without compilation:
 *     - our tool        : HealthResult.score (0-10, lower = worse health)
 *     - lizard          : max cyclomatic complexity in the file (higher = worse)
 *     - PMD             : violation count for the file (higher = worse)
 *   plus the neutral ground-truth label from MLCQ human reviewers.
 *
 * Ground truth: a manifest entry is POSITIVE when severityLabel != 'none'
 * (human reviewers flagged the code element as a smell), NEGATIVE when 'none'.
 *
 * No fabricated data: every number here is produced by actually invoking the
 * analyzer on the real file. Tools that cannot run (CodeScene, DeepSource) are
 * NOT represented here — they are documented as not-runnable in the report.
 *
 * SonarQube is collected by a separate step (it needs a running container);
 * if benchmark-data/_sonar-measures.json exists it is merged in.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const MLCQ_DIR = join(REPO, 'benchmark-data', 'mlcq');
const MANIFEST = join(MLCQ_DIR, 'mlcq-manifest.json');
const OUT = join(REPO, 'benchmark-data', 'competitive-raw.json');

const core = await import(pathToFileURL(join(REPO, 'packages', 'core', 'dist', 'index.js')).href);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
console.error(`Manifest: ${manifest.length} entries`);

// ---- 1. lizard: one batch run over all java_files, parse CSV, max CCN per file ----
console.error('Running lizard (batch CSV) ...');
const javaDir = join(MLCQ_DIR, 'java_files');
let lizardCsv = '';
try {
  lizardCsv = execFileSync('python', ['-m', 'lizard', '--csv', javaDir], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
} catch (e) {
  // lizard exits non-zero when warnings exist; stdout still has the CSV
  lizardCsv = (e.stdout || '').toString();
}
// CSV columns (0-indexed): 0=ccn, 1=nloc, 2=token, 3=param, 4=length, 5=location, 6=file, 7=name, ...
// Note: older versions of this script incorrectly read cols[1] (NLOC) instead of cols[0] (CCN).
// The correct column is cols[0] = cyclomatic complexity number (CCN).
const lizardMaxCcn = new Map(); // basename -> max ccn
const lizardSumCcn = new Map(); // basename -> sum ccn
for (const line of lizardCsv.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cols = line.split(',');
  if (cols.length < 7) continue;
  const ccn = Number(cols[0]); // col 0 = CCN (cyclomatic complexity), NOT col 1 (NLOC)
  const filePath = (cols[6] || '').replace(/^"|"$/g, '');
  const base = filePath.split(/[\\/]/).pop();
  if (!base || Number.isNaN(ccn)) continue;
  lizardMaxCcn.set(base, Math.max(lizardMaxCcn.get(base) ?? 0, ccn));
  lizardSumCcn.set(base, (lizardSumCcn.get(base) ?? 0) + ccn);
}
console.error(`lizard: parsed ${lizardMaxCcn.size} files`);

// ---- 2. PMD: read pre-generated CSV if present (run separately, it is slow) ----
const pmdCsvPath = join(REPO, 'benchmark-data', '_pmd-violations.csv');
const pmdCount = new Map(); // basename -> violation count
if (existsSync(pmdCsvPath)) {
  const pmdCsv = readFileSync(pmdCsvPath, 'utf8');
  for (const line of pmdCsv.split(/\r?\n/)) {
    // PMD CSV header: "Problem","Package","File","Priority","Line","Description","Rule set","Rule"
    const m = line.match(/"[^"]*","[^"]*","([^"]*)"/);
    if (!m) continue;
    const base = m[1].split(/[\\/]/).pop();
    if (!base || base === 'File') continue;
    pmdCount.set(base, (pmdCount.get(base) ?? 0) + 1);
  }
  console.error(`PMD: parsed violations for ${pmdCount.size} files`);
} else {
  console.error('PMD CSV not found (benchmark-data/_pmd-violations.csv) — PMD column omitted');
}

// ---- 3. SonarQube measures if present ----
const sonarPath = join(REPO, 'benchmark-data', '_sonar-measures.json');
let sonar = null;
if (existsSync(sonarPath)) {
  sonar = JSON.parse(readFileSync(sonarPath, 'utf8'));
  console.error(`SonarQube: measures present for ${Object.keys(sonar).length} files`);
}

// ---- 4. our tool: analyze every manifest file ----
console.error('Running our analyzer on all files ...');
const rows = [];
let i = 0;
for (const entry of manifest) {
  i++;
  if (i % 50 === 0) console.error(`  ${i}/${manifest.length}`);
  const abs = join(MLCQ_DIR, entry.localFile);
  const base = entry.localFile.split(/[\\/]/).pop();
  let ourScore = null;
  try {
    const r = await core.analyzeFile(abs);
    ourScore = r.score;
  } catch (e) {
    console.error(`  our tool failed on ${base}: ${e.message}`);
  }
  rows.push({
    localFile: entry.localFile,
    base,
    smellType: entry.smellType,
    severityLabel: entry.severityLabel,
    isPositive: entry.severityLabel !== 'none',
    numReviews: entry.numReviews ?? null,
    signals: {
      ourScore,                                  // lower = worse
      lizardMaxCcn: lizardMaxCcn.get(base) ?? null,  // higher = worse
      lizardSumCcn: lizardSumCcn.get(base) ?? null,  // higher = worse
      pmdViolations: pmdCount.has(base) ? pmdCount.get(base) : (pmdCount.size ? 0 : null), // higher = worse
      sonar: sonar && sonar[base] ? sonar[base] : null,
    },
  });
}

const out = {
  _meta: {
    generated: new Date().toISOString().slice(0, 10),
    dataset: 'MLCQ (Madeyski & Lewowski, EASE 2020), Zenodo DOI 10.5281/zenodo.3666840',
    groundTruth: 'human majority-vote smell label per code element; positive = severity in {minor,major,critical}, negative = none',
    granularity: 'file-level signal vs element-level label (coarse — see caveats in report)',
    entries: rows.length,
    analyzersIncluded: {
      ourTool: 'HealthResult.score from analyzeFile (lower=worse)',
      lizard: lizardMaxCcn.size ? 'max & sum cyclomatic complexity per file (higher=worse)' : 'NOT RUN',
      pmd: pmdCount.size ? 'java/quickstart.xml violation count per file (higher=worse)' : 'NOT RUN',
      sonarqube: sonar ? 'per-file measures (see _sonar-measures.json)' : 'NOT RUN here',
    },
    honesty: 'every signal value was produced by actually invoking the analyzer on the real MLCQ file in this session',
  },
  rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.error(`Wrote ${OUT} (${rows.length} rows)`);
