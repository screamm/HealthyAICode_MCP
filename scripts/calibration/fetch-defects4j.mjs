#!/usr/bin/env node
// Hämtar och checkar ut Defects4J-buggar för Java-kalibrering.
// Kräver Java 8+, Perl, och att Defects4J är installerat.
// Usage: node scripts/calibration/fetch-defects4j.mjs [--max-bugs 50]

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const createRequireFromMeta = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Defects4J v2.0.0: 835 buggar, 17 Java-projekt
const D4J_PROJECTS = [
  'Chart', 'Closure', 'Lang', 'Math', 'Time', 'Collections',
  'Compress', 'Csv', 'Gson', 'JacksonCore', 'JacksonDatabind',
  'JacksonXml', 'Jsoup', 'JxPath', 'Mockito', 'Cli', 'Codec'
];

const args = process.argv.slice(2);
const maxBugsIdx = args.indexOf('--max-bugs');
const maxBugs = parseInt(maxBugsIdx !== -1 ? args[maxBugsIdx + 1] ?? '50' : '50', 10);
const outputDir = join(ROOT, '.calibration-cache', 'checkouts');

mkdirSync(outputDir, { recursive: true });

// Verifiera att defects4j är tillgänglig
try {
  execSync('defects4j info -p Chart', { stdio: 'pipe' });
} catch {
  console.error('ERROR: defects4j CLI not found. Install from https://github.com/rjust/defects4j');
  process.exit(1);
}

console.log(`Fetching up to ${maxBugs} Defects4J checkouts into ${outputDir}`);

let checked = 0;
for (const project of D4J_PROJECTS) {
  if (checked >= maxBugs) break;

  let bugId = 1;
  while (checked < maxBugs) {
    const checkoutDir = join(outputDir, `${project}-${bugId}b`);
    if (!existsSync(checkoutDir)) {
      try {
        execSync(
          `defects4j checkout -p ${project} -v ${bugId}b -w "${checkoutDir}"`,
          { stdio: 'pipe', timeout: 30_000 }
        );
        console.log(`+ Checked out ${project}-${bugId}b`);
        checked++;
      } catch {
        break; // No more bugs for this project
      }
    } else {
      console.log(`- ${project}-${bugId}b already exists, skipping`);
      checked++;
    }
    bugId++;
  }
}

console.log(`Total checkouts: ${checked}`);
