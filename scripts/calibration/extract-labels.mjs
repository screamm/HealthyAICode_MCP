#!/usr/bin/env node
// Extraherar bug-labels (buggy-rader) från Defects4J-checkouts via git diff.
// Output: .calibration-cache/labels.json

import { execSync } from 'child_process';
import { writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const createRequireFromMeta = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');

const checkoutDir = join(ROOT, '.calibration-cache', 'checkouts');
const outputFile = join(ROOT, '.calibration-cache', 'labels.json');

if (!existsSync(checkoutDir)) {
  console.error('No checkouts found. Run fetch-defects4j.mjs first.');
  process.exit(1);
}

const labels = {};
const dirs = readdirSync(checkoutDir);

for (const dir of dirs) {
  const projectDir = join(checkoutDir, dir);
  try {
    // Get diff between buggy and fixed versions (+-3 line tolerance around each hunk)
    const diff = execSync(
      'git diff HEAD~1 HEAD --unified=0 -- "*.java"',
      { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }
    );

    const buggyLines = new Map();
    let currentFile = '';

    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6);
        if (!buggyLines.has(currentFile)) buggyLines.set(currentFile, new Set());
      } else if (line.startsWith('@@ ')) {
        // Parse hunk header: @@ -<lineNo>,<count> +... @@
        const match = line.match(/^@@ -(\d+)/);
        if (match && currentFile) {
          const lineNo = parseInt(match[1], 10);
          const fileLines = buggyLines.get(currentFile);
          // Apply +-3 line tolerance around the buggy hunk start
          for (let i = Math.max(1, lineNo - 3); i <= lineNo + 3; i++) {
            fileLines?.add(i);
          }
        }
      }
    }

    for (const [file, lines] of buggyLines) {
      labels[`${dir}/${file}`] = [...lines].sort((a, b) => a - b);
    }
  } catch {
    // Skip projects with git issues
  }
}

writeFileSync(outputFile, JSON.stringify(labels, null, 2));
console.log(`Extracted labels for ${Object.keys(labels).length} files`);
