/**
 * Collect per-file SonarQube measures from all successfully-scanned MLCQ projects
 * and write benchmark-data/_sonar-measures.json keyed by .java basename.
 *
 * Successful projects were scanned in batches (the Java AST analyzer OOMs on 2
 * pathological generated files; everything else analyzed cleanly). We query every
 * project and union the per-file measures — each file appears in exactly one project.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const OUT = join(REPO, 'benchmark-data', '_sonar-measures.json');

const SONAR = 'http://localhost:9000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');
const METRICS = 'code_smells,sqale_index,complexity,cognitive_complexity,ncloc,bugs,vulnerabilities';

// All project keys we created (failed OOM ones simply return 0 files — harmless).
const projects = [];
for (let i = 1; i <= 7; i++) projects.push(`mlcq-b${i}`);
for (let i = 1; i <= 10; i++) projects.push(`mlcq-sub${i}`);
for (let i = 1; i <= 20; i++) projects.push(`mlcq-one${i}`);

const byFile = {};
let totalFiles = 0;

for (const key of projects) {
  let page = 1;
  for (;;) {
    const url = `${SONAR}/api/measures/component_tree?component=${key}&qualifiers=FIL&metricKeys=${METRICS}&ps=500&p=${page}`;
    const resp = await fetch(url, { headers: { Authorization: AUTH } });
    if (!resp.ok) break;
    const data = await resp.json();
    const comps = data.components || [];
    for (const c of comps) {
      const base = c.name; // e.g. "463215ef_TestCommentsTable.java"
      const m = {};
      for (const meas of c.measures || []) m[meas.metric] = Number(meas.value);
      // Avoid double-counting if a file somehow appears twice: keep first seen.
      if (!byFile[base]) {
        byFile[base] = m;
        totalFiles++;
      }
    }
    const total = data.paging?.total ?? 0;
    if (page * 500 >= total || comps.length === 0) break;
    page++;
  }
}

writeFileSync(OUT, JSON.stringify(byFile, null, 2));
console.error(`SonarQube measures collected for ${totalFiles} unique files -> ${OUT}`);
