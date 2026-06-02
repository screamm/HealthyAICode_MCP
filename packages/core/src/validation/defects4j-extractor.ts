/**
 * Defects4J and BugsJS dataset information and extraction instructions.
 *
 * This module is a **specification / plan** — it does not execute extraction.
 * Defects4J requires a Java runtime and the Defects4J CLI tool.
 * BugsJS requires Node.js and the bugsjs npm package.
 * Both run on Linux/macOS only (Windows is not supported by the tooling).
 */

/** Static metadata describing the Defects4J dataset (version, size, projects, citation). */
export interface Defects4JInfo {
  version: string;
  totalBugs: number;
  /** Project names as used by the `defects4j checkout -p` flag. */
  projects: string[];
  url: string;
  license: string;
  citation: string;
}

/** Canonical Defects4J 2.0.0 metadata: 835 bugs across 17 Apache/Google projects. */
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

/** Returns the prerequisites and environment setup steps (steps 1–3) for Defects4J. */
function defects4jSetupSteps(): string {
  return `Prerequisites:
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
  cd ~/defects4j-benchmark`;
}

/** Returns the defect count table for all Defects4J projects. */
function defects4jProjectTable(): string {
  return `Project — Defect count mapping:
  Chart:    26 defects (1–26)
  Cli:      40 defects (1–40)
  Closure:  176 defects (1–176)
  Codec:    18 defects (1–18)
  Collections: 4 defects (1–4)
  Compress: 47 defects (1–47)
  Csv:      16 defects (1–16)
  Gson:     18 defects (1–18)
  JacksonCore: 26 defects (1–26)
  JacksonDatabind: 112 defects (1–112)
  JacksonXml: 6 defects (1–6)
  Jsoup:    93 defects (1–93)
  JxPath:   22 defects (1–22)
  Lang:     65 defects (1–65)
  Math:     106 defects (1–106)
  Mockito:  38 defects (1–38)
  Time:     27 defects (1–27)
  Total:    835 defects`;
}

/** Returns the extraction notes section for Defects4J. */
function defects4jExtractionNotes(): string {
  return `Notes:
  - Some defects modify multiple source files. Each modified file becomes a separate
    Defects4JEntry with the same project/defectId but different className.
  - Some files may not exist in the pre-fix version (added as part of the fix).
    In that case set buggyCode to an empty string.
  - Some files may not exist in the post-fix version (deleted as part of the fix).
    In that case set fixedCode to an empty string.
  - The extraction can be parallelised per project (each project is independent).
  - Expected output size: roughly 5000–8000 entries (multiple files per defect).`;
}

/**
 * Returns detailed step-by-step instructions for extracting Defects4J defect data
 * into the Defects4JEntry[] JSON format consumed by loadDefects4JFromJson().
 */
export function generateExtractionInstructions(): string {
  return `
Defects4J — Extraction to Healthy AI Code JSON format
======================================================

${defects4jSetupSteps()}

Step 4 — Iterate over every project and defect
  For each defect (project P, id N):
    4a. Checkout the pre-fix version:
        defects4j checkout -p <P> -v <N>b -w /tmp/defects4j-checkout-<P>-<N>b
    4b. Checkout the post-fix version:
        defects4j checkout -p <P> -v <N>f -w /tmp/defects4j-checkout-<P>-<N>f
    4c. Read the modified classes for defect N:
        cat $DEFECTS4J_HOME/framework/projects/<P>/modified_classes/<N>.src
        This lists one source path per line, relative to the project's src dir.
    4d. For each modified class:
        - Resolve the source file under the pre-fix checkout
        - Resolve the same path under the post-fix checkout
        - Read both source files
        - Create a Defects4JEntry:
            { "project": "<P>", "bugId": "<N>", "className": "<path>",
              "buggyCode": "<source from pre-fix checkout>",
              "fixedCode": "<source from post-fix checkout>" }
    4e. Clean up temp checkouts:
        rm -rf /tmp/defects4j-checkout-<P>-<N>b /tmp/defects4j-checkout-<P>-<N>f

Step 5 — Save output
  Write the array of Defects4JEntry objects to a JSON file, e.g.:
    benchmarks/defects4j-benchmark.json
  This file can be loaded directly by loadDefects4JFromJson().

${defects4jProjectTable()}

${defects4jExtractionNotes()}
`.trim();
}

/** Returns the BugsJS defect count table. */
function bugsJSProjectTable(): string {
  return `Projects and defect counts:
  Express:      13 defects
  Grabbag:      23 defects
  HTTP:         10 defects
  Karma:        28 defects
  Kryo:         16 defects
  Mongoose:     34 defects
  Node-Mongodb: 35 defects
  Node-Helmet:  25 defects
  Node-Proxy:   2 defects
  Node-Types:   2 defects
  Node-Utils:   3 defects
  Node-Ws:      4 defects
  Octokit:      24 defects
  Pencilblue:   26 defects
  Pug:          12 defects
  Query:        9 defects
  Sails:        30 defects
  Shogun:       26 defects
  Socket.io:    16 defects
  Strapi:       40 defects
  Total:        453 defects`;
}

/** Returns the extraction notes for BugsJS. */
function bugsJSExtractionNotes(): string {
  return `Notes:
  - The Defects4JEntry schema is the same as for Defects4J.
  - Set language to "javascript" for the generated BugRecord.
  - Some defects modify files in test directories — skip those (test code is not
    relevant for code health validation).
  - The total number of entries will vary since some defects modify many files.`;
}

/**
 * Returns instructions for extracting BugsJS (JavaScript) defect data.
 * BugsJS provides 453 JavaScript defects modelled after Defects4J.
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

Step 2 — Extract defect information
  BugsJS stores defect data as git commits. Each defect has:
    - A "pre-fix" commit (the last commit before the fix)
    - A "post-fix" commit (the commit that applies the fix)

  Defect metadata is in:
    bugsjs/<project>/info/<defect-id>.json

Step 3 — For each defect
  3a. Read the defect info JSON to find:
      - The pre-fix commit hash
      - The post-fix commit hash
      - The list of modified files
  3b. Checkout the pre-fix commit:
      cd <project-dir>
      git checkout <pre-fix-hash>
  3c. Read each modified source file and record as buggyCode
  3d. Checkout the post-fix commit:
      git checkout <post-fix-hash>
  3e. Read each modified source file and record as fixedCode
  3f. Create a Defects4JEntry (same JSON schema):
      { "project": "<project>", "bugId": "<defect-num>", "className": "<file-path>",
        "buggyCode": "<pre-fix source>", "fixedCode": "<post-fix source>" }

Step 4 — Save output
  Output a JSON array of Defects4JEntry objects, e.g.:
    benchmarks/bugsjs-benchmark.json

${bugsJSProjectTable()}

${bugsJSExtractionNotes()}
`.trim();
}
