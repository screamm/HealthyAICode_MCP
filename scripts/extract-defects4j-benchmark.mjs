#!/usr/bin/env node
/**
 * extract-defects4j-benchmark.mjs
 *
 * Extracts Defects4J bug/fixed source code pairs into a JSON benchmark file
 * compatible with loadDefects4JFromJson().
 *
 * Prerequisites:
 *   - Linux or macOS
 *   - Defects4J installed (https://github.com/rjust/defects4j)
 *   - DEFECTS4J_HOME environment variable set, or Defects4J at ~/defects4j
 *   - Java 8+
 *
 * Usage:
 *   node scripts/extract-defects4j-benchmark.mjs [--projects Lang,Math] [--bugs 1-10]
 *
 * Default behaviour: processes ALL 835 bugs across ALL 17 projects.
 * Use --projects and --bugs to extract a subset for testing.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Project definitions ──────────────────────────────────────────────────────
const PROJECTS = [
  { name: 'Chart', bugs: 26 },
  { name: 'Cli', bugs: 40 },
  { name: 'Closure', bugs: 176 },
  { name: 'Codec', bugs: 18 },
  { name: 'Collections', bugs: 4 },
  { name: 'Compress', bugs: 47 },
  { name: 'Csv', bugs: 16 },
  { name: 'Gson', bugs: 18 },
  { name: 'JacksonCore', bugs: 26 },
  { name: 'JacksonDatabind', bugs: 112 },
  { name: 'JacksonXml', bugs: 6 },
  { name: 'Jsoup', bugs: 93 },
  { name: 'JxPath', bugs: 22 },
  { name: 'Lang', bugs: 65 },
  { name: 'Math', bugs: 106 },
  { name: 'Mockito', bugs: 38 },
  { name: 'Time', bugs: 27 },
];

const TOTAL_BUGS = PROJECTS.reduce((s, p) => s + p.bugs, 0);

// ── CLI arg parsing ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { projects: null, bugs: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--projects' && i + 1 < args.length) {
      opts.projects = args[++i].split(',').map((s) => s.trim());
    }
    if (args[i] === '--bugs' && i + 1 < args.length) {
      const parts = args[++i].split('-');
      opts.bugs = parts.length === 2 ? { from: parseInt(parts[0], 10), to: parseInt(parts[1], 10) } : null;
    }
  }
  return opts;
}

// ── Find Defects4J ───────────────────────────────────────────────────────────
function findDefects4J() {
  const envHome = process.env.DEFECTS4J_HOME;
  if (envHome) {
    const candidate = path.resolve(envHome);
    try {
      execSync('test -d "$DEFECTS4J_HOME"', { shell: true, stdio: 'ignore' });
      return candidate;
    } catch { /* fall through */ }
  }

  const defaultHome = path.resolve(process.env.HOME || '~', 'defects4j');
  try {
    execSync(`test -d "${defaultHome}"`, { shell: true, stdio: 'ignore' });
    return defaultHome;
  } catch { /* fall through */ }
  return null;
}

// ── Helper: read modified class paths for a bug ──────────────────────────────
function readModifiedClasses(d4jHome, project, bugNum) {
  const srcPath = path.join(d4jHome, 'framework', 'projects', project, 'modified_classes', `${bugNum}.src`);
  try {
    const content = fs.readFileSync(srcPath, 'utf-8');
    return content.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Helper: resolve source root from a checked-out project ───────────────────
function findSrcRoot(checkoutDir) {
  const candidates = ['src', 'src/java', 'src/main/java', 'source', 'src/java/org'];
  for (const c of candidates) {
    const full = path.join(checkoutDir, c);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) return full;
    } catch { /* not found */ }
  }
  return checkoutDir;
}

// ── Helper: read file content safely ─────────────────────────────────────────
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Defects4J benchmark extractor — ${TOTAL_BUGS} total bugs\n`);

  // ── Platform check ───────────────────────────────────────────────────────
  if (process.platform === 'win32') {
    console.error(
      'ERROR: Defects4J does not support Windows.\n' +
      'Run this script on Linux or macOS where Defects4J is installed.\n' +
      'On Windows, consider:\n' +
      '  1. WSL2 with Ubuntu and Defects4J installed\n' +
      '  2. Using a pre-extracted benchmark JSON file\n' +
      '  3. Using the synthetic benchmark (createSyntheticBenchmark())',
    );
    process.exit(1);
  }

  // ── Find Defects4J ───────────────────────────────────────────────────────
  const d4jHome = findDefects4J();
  if (!d4jHome) {
    console.error(
      'Defects4J not found.\n' +
      '  Set DEFECTS4J_HOME or clone to ~/defects4j:\n' +
      '    git clone https://github.com/rjust/defects4j.git ~/defects4j\n' +
      '    cd ~/defects4j && ./init.sh\n' +
      '    export DEFECTS4J_HOME="$PWD"\n' +
      '    export PATH="$DEFECTS4J_HOME/framework/bin:$PATH"',
    );
    process.exit(1);
  }
  console.log(`Defects4J home: ${d4jHome}\n`);

  // ── Parse filters ────────────────────────────────────────────────────────
  const opts = parseArgs();
  const filteredProjects = opts.projects
    ? PROJECTS.filter((p) => opts.projects.includes(p.name))
    : PROJECTS;

  if (filteredProjects.length === 0) {
    console.error('No matching projects found.');
    process.exit(1);
  }

  const totalTarget = filteredProjects.reduce((s, p) => s + p.bugs, 0);
  console.log(`Projects to process: ${filteredProjects.map((p) => p.name).join(', ')}`);
  console.log(`Target entries: ~${totalTarget} bugs\n`);

  // ── Extract ──────────────────────────────────────────────────────────────
  const entries = [];
  const tmpBase = '/tmp/defects4j-benchmark-extraction';
  let processed = 0;
  let errors = 0;

  for (const project of filteredProjects) {
    console.log(`\n── ${project.name} (${project.bugs} bugs) ──`);

    for (let bugNum = 1; bugNum <= project.bugs; bugNum++) {
      if (opts.bugs && (bugNum < opts.bugs.from || bugNum > opts.bugs.to)) continue;

      const buggyDir = `${tmpBase}/${project.name}-${bugNum}b`;
      const fixedDir = `${tmpBase}/${project.name}-${bugNum}f`;

      try {
        // Checkout buggy version
        execSync(
          `defects4j checkout -p ${project.name} -v ${bugNum}b -w ${buggyDir} 2>/dev/null`,
          { stdio: 'ignore', timeout: 120_000 },
        );

        // Checkout fixed version
        execSync(
          `defects4j checkout -p ${project.name} -v ${bugNum}f -w ${fixedDir} 2>/dev/null`,
          { stdio: 'ignore', timeout: 120_000 },
        );

        // Read modified classes
        const modifiedClasses = readModifiedClasses(d4jHome, project.name, bugNum);

        if (modifiedClasses.length === 0) {
          errors++;
          process.stdout.write('E');
          continue;
        }

        const buggySrcRoot = findSrcRoot(buggyDir);
        const fixedSrcRoot = findSrcRoot(fixedDir);

        for (const cls of modifiedClasses) {
          const buggyFile = path.join(buggySrcRoot, cls.replace('.java', '.java'));
          const fixedFile = path.join(fixedSrcRoot, cls.replace('.java', '.java'));

          const buggyCode = readFileSafe(buggyFile);
          const fixedCode = readFileSafe(fixedFile);

          if (buggyCode || fixedCode) {
            entries.push({
              project: project.name,
              bugId: String(bugNum),
              className: cls,
              fixedCode,
              buggyCode,
            });
          }
        }

        processed++;
        process.stdout.write('.');
      } catch (err) {
        errors++;
        process.stdout.write('x');
      } finally {
        // Cleanup temp dirs
        execSync(`rm -rf "${buggyDir}" "${fixedDir}"`, { stdio: 'ignore' });
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n');
  console.log(`Processed: ${processed}/${totalTarget} bugs`);
  console.log(`Errors:    ${errors}`);
  console.log(`Entries:   ${entries.length}`);

  if (entries.length === 0) {
    console.error('\nERROR: No entries extracted. Nothing to save.');
    process.exit(1);
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const outputDir = path.join(REPO_ROOT, 'benchmarks');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'defects4j-benchmark.json');
  await fs.writeFile(outputPath, JSON.stringify(entries, null, 2), 'utf-8');

  console.log(`\nBenchmark saved to: ${outputPath}`);
  console.log(`File size: ${(Buffer.byteLength(JSON.stringify(entries), 'utf-8') / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(2);
});
