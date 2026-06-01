# RefactoringMiner Behavior-Preservation Oracle

Resolves Caveat 2c: the RefactoringMiner oracle is now wired and runnable.

## What it is

[RefactoringMiner](https://github.com/tsantalis/RefactoringMiner) is a Java AST-diff tool
that classifies the refactorings performed between two revisions of a Java code base with
very high precision/recall (F1 ≈ 99.7% on its Oracle dataset). We use it as an independent
oracle to confirm that an `applyAutoRefactor` transform produced the **intended** refactoring
type (e.g. Extract Method) and nothing unintended — i.e. that the change is behavior-preserving
in the structural sense RefactoringMiner verifies.

Implementation: `packages/core/src/refactor/refactoring-miner-oracle.ts`
Test (real end-to-end run): `packages/core/tests/refactor/refactoring-miner-oracle.test.ts`
Java fixtures: `packages/core/tests/fixtures/refactoring-miner/Calculator.{before,after}.java`

## Version

Pinned to **RefactoringMiner 3.1.4** (released 2026-05-24). This is the first release line
with full TypeScript support; Python and merge-commit handling were also improved. It
requires **Java 17+** (the environment has OpenJDK 21).

## Vendoring / fetch (on demand)

The distribution zip is ~157 MB and is **never committed**. It is fetched on demand into
`tools/refactoringminer/`, which is gitignored (see `.gitignore`).

### Fetch command (bash / curl)

```bash
mkdir -p tools/refactoringminer
curl -sL -o tools/refactoringminer/RefactoringMiner-3.1.4.zip \
  https://github.com/tsantalis/RefactoringMiner/releases/download/3.1.4/RefactoringMiner-3.1.4.zip
cd tools/refactoringminer && unzip -o -q RefactoringMiner-3.1.4.zip
# Jars land at: tools/refactoringminer/RefactoringMiner-3.1.4/lib/*.jar
```

### Fetch command (PowerShell)

```powershell
New-Item -ItemType Directory -Force tools\refactoringminer | Out-Null
Invoke-WebRequest `
  -Uri https://github.com/tsantalis/RefactoringMiner/releases/download/3.1.4/RefactoringMiner-3.1.4.zip `
  -OutFile tools\refactoringminer\RefactoringMiner-3.1.4.zip
Expand-Archive tools\refactoringminer\RefactoringMiner-3.1.4.zip tools\refactoringminer -Force
```

The latest asset URL can always be discovered with:

```bash
curl -sL https://api.github.com/repos/tsantalis/RefactoringMiner/releases/latest
```

## Invocation

The oracle does **not** use the shipped `.bat`/shell launcher. On Windows the launcher cannot
be spawned reliably when the install path contains spaces (cmd.exe re-splits the path). Instead
it invokes the JVM directly:

```
java -cp "<libDir>/*" org.refactoringminer.RefactoringMiner -bc <repo> <startSha> <endSha> -json <out>
```

The JVM itself expands the `<libDir>/*` classpath wildcard (the `lib/` directory holds the main
jar plus all ~120 dependency jars), so no shell quoting is involved.

Resolution order:

1. `HEALTHY_AI_REFACTORING_MINER` — absolute path to an alternative `lib/` directory, if set
   (`refactoringMinerLibDir()`).
2. Vendored default: `tools/refactoringminer/RefactoringMiner-3.1.4/lib`.
3. `HEALTHY_AI_JAVA` — overrides the `java` executable (defaults to `java` on PATH).

A missing JRE, a missing/empty `lib/` directory, or a bad classpath never throw —
`canUseRefactoringMiner()` returns `false` and the verification entry points return
`{ verified: false, error: '...unavailable...' }`.

## How it works

RefactoringMiner's detection CLI operates on **git commits**, not loose files, and is
**Java-only**. The oracle therefore offers two entry points:

- `verifyRefactoringBetweenCommits(repoPath, startSha, endSha, expectedType)` — run on an
  existing repo + two commit SHAs.
- `verifyRefactoringBetweenFileVersions(before, after, relativePath, expectedType)` — build a
  throwaway 2-commit git repo (before → after) in a temp dir, then run the commit-range
  detector. Used by the test against the static Java fixtures.

Under the hood it invokes:

```bash
java -cp "<libDir>/*" org.refactoringminer.RefactoringMiner -bc <repo> <startSha> <endSha> -json <out.json>
```

then parses `commits[].refactorings[].{type,description}` from the JSON. A run is
`verified: true` only when a detected refactoring's `type` matches `expectedType`
(case-insensitive). `unexpectedChanges` flags any co-occurring refactoring of a different
type so callers can judge whether the transform stayed minimal.

## Running the test

```bash
pnpm --filter @healthy-ai-code/core test refactoring-miner-oracle
```

When the distribution is present, the end-to-end test fetches nothing — it builds the temp
repo, runs RefactoringMiner, and asserts an `Extract Method` (extracting `accumulate`) is
detected. When the distribution is absent, the end-to-end assertions are skipped with a
console warning (the tool-availability and graceful-unavailability tests still run).
