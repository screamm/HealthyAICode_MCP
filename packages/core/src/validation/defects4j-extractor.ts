/**
 * Defects4J and BugsJS dataset information and extraction instructions.
 *
 * This module is a **specification / plan** — it does not execute extraction.
 * Defects4J requires a Java runtime and the Defects4J CLI tool.
 * BugsJS requires Node.js and the bugsjs npm package.
 * Both run on Linux/macOS only (Windows is not supported by the tooling).
 */

export interface Defects4JInfo {
  version: string;
  totalBugs: number;
  /** Project names as used by the `defects4j checkout -p` flag. */
  projects: string[];
  url: string;
  license: string;
  citation: string;
}

export const DEFECTS4J_INFO: Defects4JInfo = {
  version: '2.0.0',
  totalBugs: 835,
  projects: [
    'Chart', 'Cli', 'Closure', 'Codec', 'Collections', 'Compress', 'Csv',
    'Gson', 'JacksonCore', 'JacksonDatabind', 'JacksonXml', 'Jsoup',
    'JxPath', 'Lang', 'Math', 'Mockito', 'Time',
  ],
  url: 'https://github.com/rjust/defects4j',
  license: 'MIT',
  citation: 'Just et al., "Defects4J: A Database of Existing Faults to Enable Controlled Testing Studies for Java Programs", ISSTA 2014',
};

/**
 * Returns detailed step-by-step instructions for extracting Defects4J bug data
 * into the Defects4JEntry[] JSON format consumed by loadDefects4JFromJson().
 */
export function generateExtractionInstructions(): string {
  return `
Defects4J — Extraction to Healthy AI Code JSON format
======================================================

Prerequisites:
  - Linux or macOS (Windows is not supported by Defects4J)
  - Java 8+ (OpenJDK recommended)
  - Git
  - Perl 5

Step 1 — Clone and install Defects4J
  git clone https://github.com/rjust/defects4j.git
  cd defects4j
  ./init.sh
  export DEFECTS4J_HOME="$PWD"
  export PATH="$DEFECTS4J_HOME/framework/bin:$PATH"

Step 2 — Verify installation
  defects4j info -p Lang
  # Should print project metadata for Apache Commons Lang

Step 3 — Create a working directory
  mkdir -p ~/defects4j-benchmark
  cd ~/defects4j-benchmark

Step 4 — Iterate over every project and bug
  For each bug (project P, bug N):
    4a. Checkout the buggy version:
        defects4j checkout -p <P> -v <N>b -w /tmp/defects4j-checkout-<P>-<N>b
    4b. Checkout the fixed version:
        defects4j checkout -p <P> -v <N>f -w /tmp/defects4j-checkout-<P>-<N>f
    4c. Read the modified classes for bug N:
        cat $DEFECTS4J_HOME/framework/projects/<P>/modified_classes/<N>.src
        This lists one source path per line, relative to the project's src dir.
    4d. For each modified class:
        - Resolve the source file under the buggy checkout
        - Resolve the same path under the fixed checkout
        - Read both source files
        - Create a Defects4JEntry:
            { "project": "<P>", "bugId": "<N>", "className": "<path>",
              "buggyCode": "<source from buggy checkout>",
              "fixedCode": "<source from fixed checkout>" }
    4e. Clean up temp checkouts:
        rm -rf /tmp/defects4j-checkout-<P>-<N>b /tmp/defects4j-checkout-<P>-<N>f

Step 5 — Save output
  Write the array of Defects4JEntry objects to a JSON file, e.g.:
    benchmarks/defects4j-benchmark.json
  This file can be loaded directly by loadDefects4JFromJson().

Project — Bug count mapping:
  Chart:    26 bugs (1–26)
  Cli:      40 bugs (1–40)
  Closure:  176 bugs (1–176)
  Codec:    18 bugs (1–18)
  Collections: 4 bugs (1–4)
  Compress: 47 bugs (1–47)
  Csv:      16 bugs (1–16)
  Gson:     18 bugs (1–18)
  JacksonCore: 26 bugs (1–26)
  JacksonDatabind: 112 bugs (1–112)
  JacksonXml: 6 bugs (1–6)
  Jsoup:    93 bugs (1–93)
  JxPath:   22 bugs (1–22)
  Lang:     65 bugs (1–65)
  Math:     106 bugs (1–106)
  Mockito:  38 bugs (1–38)
  Time:     27 bugs (1–27)
  Total:    835 bugs

Notes:
  - Some bugs modify multiple source files. Each modified file becomes a separate
    Defects4JEntry with the same project/bugId but different className.
  - Some files may not exist in the buggy version (added as part of the fix).
    In that case set buggyCode to an empty string.
  - Some files may not exist in the fixed version (deleted as part of the fix).
    In that case set fixedCode to an empty string.
  - The extraction can be parallelised per project (each project is independent).
  - Expected output size: roughly 5000–8000 entries (multiple files per bug).
`.trim();
}

/**
 * Returns instructions for extracting BugsJS (JavaScript) bug data.
 * BugsJS provides 453 JavaScript bugs modelled after Defects4J.
 */
export function generateBugsJSInstructions(): string {
  return `
BugsJS — Extraction to Healthy AI Code JSON format
===================================================

Prerequisites:
  - Linux or macOS
  - Node.js 12+
  - Git
  - MongoDB (for some BugsJS features, but source extraction works without it)

Step 1 — Clone BugsJS
  git clone https://github.com/BugsJS/BugsJS.git
  cd BugsJS
  npm install

Step 2 — Extract bug information
  BugsJS stores bug data as git commits. Each bug has:
    - A "buggy" commit (the last commit before the fix)
    - A "fixed" commit (the commit that applies the fix)
  
  Bug metadata is in:
    bugsjs/<project>/info/<bug>.json

Step 3 — For each bug
  3a. Read the bug info JSON to find:
      - The buggy commit hash
      - The fixed commit hash
      - The list of modified files
  3b. Checkout the buggy commit:
      cd <project-dir>
      git checkout <buggy-hash>
  3c. Read each modified source file and record as buggyCode
  3d. Checkout the fixed commit:
      git checkout <fixed-hash>
  3e. Read each modified source file and record as fixedCode
  3f. Create a Defects4JEntry (same JSON schema):
      { "project": "<project>", "bugId": "<bug-num>", "className": "<file-path>",
        "buggyCode": "<buggy source>", "fixedCode": "<fixed source>" }

Step 4 — Save output
  Output a JSON array of Defects4JEntry objects, e.g.:
    benchmarks/bugsjs-benchmark.json

Projects and bug counts:
  Express:      13 bugs
  Grabbag:      23 bugs
  HTTP:         10 bugs
  Karma:        28 bugs
  Kryo:         16 bugs
  Mongoose:     34 bugs
  Node-Mongodb: 35 bugs
  Node-Helmet:  25 bugs
  Node-Proxy:   2 bugs
  Node-Types:   2 bugs
  Node-Utils:   3 bugs
  Node-Ws:      4 bugs
  Octokit:      24 bugs
  Pencilblue:   26 bugs
  Pug:          12 bugs
  Query:        9 bugs
  Sails:        30 bugs
  Shogun:       26 bugs
  Socket.io:    16 bugs
  Strapi:       40 bugs
  Total:        453 bugs

Notes:
  - The Defects4JEntry schema is the same as for Defects4J.
  - Set language to "javascript" for the generated BugRecord.
  - Some bugs modify files in test directories — skip those (test code is not
    relevant for code health validation).
  - The total number of entries will vary since some bugs modify many files.
`.trim();
}
