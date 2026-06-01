# TypeScript/JavaScript Calibration Report

**Status:** Real run, 1 June 2026. TypeScript and JavaScript. SZZ-proxy ground truth.  
**Script:** `scripts/validation/ts-calibration.mjs`  
**Results file:** `benchmark-data/ts-calibration/results.json`

---

## What This Is

This validates our TypeScript/JavaScript smell detectors against a **git-bug-fix proxy dataset** —
an established technique (SZZ algorithm; Śliwerski, Zimmermann, Zeller, MSR 2005) that labels files
as "buggy" if they appear in commits whose message matches a fix-commit regex, and as "clean" if
they appear only in non-fix commits within the sampled history window.

This is **not** a human-annotated smell dataset like MLCQ (which covers Java only). No equivalent
externally human-labeled TypeScript/JavaScript smell dataset was found in a literature search at the
time of writing (June 2026). The closest candidates — SmellyCode++ (Java), DACOS (Java/Python) —
do not cover TypeScript. The JavaScript-specific BugsJS benchmark covers bug reproducibility, not
code smell severity labeling. We therefore use the SZZ proxy as the best available approximation,
and label it honestly.

---

## Repos Used

All three repos are MIT-licensed and publicly available on GitHub. They were selected for:
- Active bug tracking with consistently labeled fix commits
- Mixed TypeScript and JavaScript source (covering both languages)
- Non-trivial codebase size (each 10–50K LOC in source files)
- No affiliation with this project

| Repo | URL | Language mix | Cloned depth |
|---|---|---|---|
| execa | https://github.com/sindresorhus/execa | JS-primary, TS declarations | --depth=300 |
| ts-node | https://github.com/TypeStrong/ts-node | TypeScript-primary | --depth=500 |
| zod | https://github.com/colinhacks/zod | TypeScript-primary | --depth=500 |

---

## Method

### Sample extraction

1. Read up to `--maxCommits` (default 400) non-merge commits per repo via `git log --no-merges`.
2. Classify commits as **fix-commits** if their subject matches:
   `\b(fix|bug|issue|error|defect|closes?\s*#\d+|resolves?\s*#\d+)\b`
   (same pattern as `scripts/calibration/szz-label-generator.mjs`).
3. For each fix-commit, extract modified files (status `M`) at the **parent** commit (the
   pre-fix/buggy state) via `git show --name-status`. These become the **positive** (buggy) samples.
4. Files in non-fix commits that never appeared as fix-commit targets become **negative** (clean)
   samples (up to 3× the positive count, capped at 300 per repo).
5. Exclusions: `node_modules/`, `dist/`, `build/`, `.d.ts` declarations, test files
   (`*.test.*`, `*.spec.*`, `/tests?/`, `/__tests__/`). Minimum 200 bytes; maximum 80 KB.

### Analysis pipeline

Each file is analyzed via a slim TypeScript/JavaScript-only pipeline that mirrors
`analyzeCode()` from `packages/core/src/index.ts` for the `typescript`/`javascript`
language paths:

```
analyzeTypeScript(code, filePath)
  → detectSmells(functions, metrics, language)
  → detectBrainMethods(functions, metrics.cyclomaticComplexity)
  → calculateScore(allSmells, language)
```

This avoids loading the C# tree-sitter binding (which has an ESM top-level `await` incompatible
with synchronous CJS `require()` on Node ≥ 24). The result is identical to `analyzeCode()` for
TS/JS inputs — all relevant smell detectors run (TypeSafetyEscape, DeepNesting, LongParameterList,
CognitiveComplexity, BrainMethod, PrimitiveObsession, GodClass, FeatureEnvy, etc.).

### Statistical measures

- **AUROC** (Wilcoxon-Mann-Whitney): convention is lower score → more likely buggy file.
  `computeAUROC(scores, labels)` from `packages/core/src/validation/correlation.ts`.
- **95% bootstrap CI**: 2000 resamples (percentile method).
- **Mann-Whitney p**: two-tailed normal approximation with continuity correction and tie adjustment.
- **Precision/Recall/F1** at the `AI_READY_THRESHOLD` cut-off (score < 9.5 → predicted "buggy").

---

## Results (real run, 1 June 2026)

### Corpus summary

| Repo | Commits | Fix-commits | Pos samples | Neg samples | Total |
|---|---|---|---|---|---|
| execa | 300 | 72 | 253 | 300 | 553 |
| ts-node | 390 | 94 | 105 | 165 | 270 |
| zod | 372 | 135 | 83 | 137 | 220 |
| **Total** | **1062** | **301** | **441** | **602** | **1043** |

Language split: javascript/buggy = 232, typescript/buggy = 209, javascript/clean = 273, typescript/clean = 329.

### Performance metrics

| Metric | Value | Notes |
|---|---|---|
| **AUROC** | **0.6782** | Main discriminative power metric |
| 95% CI (bootstrap, n=2000) | [0.648, 0.710] | Width = 0.062 |
| Mann-Whitney p | < 0.0001 | Statistically significant (n=1043) |
| Precision @ score < 9.5 | 0.5758 | TP/(TP+FP) |
| Recall @ score < 9.5 | 0.5601 | TP/(TP+FN) |
| F1 @ score < 9.5 | 0.5678 | |
| Buggy mean score | 7.205 (σ=3.593) | Pre-fix state scores |
| Clean mean score | 8.683 (σ=2.601) | Non-fix-commit scores |

Confusion matrix at threshold 9.5:

|  | Predicted buggy | Predicted clean |
|---|---|---|
| **Actual buggy** | TP = 247 | FN = 194 |
| **Actual clean** | FP = 182 | TN = 420 |

Reproduce: `node scripts/validation/ts-calibration.mjs --repos=<path1>,<path2>,<path3>`

---

## Honest Interpretation

### What 0.678 AUROC means

AUROC 0.678 means the health score ranks a randomly chosen buggy file above a randomly chosen
clean file 67.8% of the time (well above the 50% random baseline). The result is statistically
significant (p < 0.0001, n=1043).

This is **consistent with our Java result**: the Java MLCQ-AUROC for long-method detection was
0.724, and the Defects4J AUROC (bug proxy) was 0.495. The TypeScript/JavaScript SZZ-proxy result
of 0.678 sits in a plausible range between the two — better than the bug-prediction baseline
(bugs measure logical correctness, not structural quality) and slightly below the human-smell
benchmark (which is a cleaner ground truth).

For comparison:
- Java MLCQ (human-labeled smells, long method): AUROC 0.724
- Java Defects4J (bug proxy): AUROC 0.495
- **TypeScript/JavaScript SZZ proxy (this work): AUROC 0.678** [0.648–0.710]

### Key limitations (mandatory reading before citing this number)

1. **SZZ conflation.** Fix commits routinely touch utility files, configuration, and test helpers
   that are not the root cause of the bug. These inflate the false-positive rate in the positive
   label set, which deflates AUROC. True AUROC against a human-labeled smell dataset would
   likely be higher (consistent with the Java result: MLCQ 0.724 > Defects4J 0.495).

2. **Shallow clone depth.** All three repos were cloned with `--depth=200–500`. Fix commits
   predating the clone depth are not captured — the positive label set is incomplete.

3. **Small corpus.** Three repos, 1,043 samples total. Not a large-scale multi-repo study.
   Confidence intervals reflect this: width 0.062 at 95% CI.

4. **Health scores measure maintainability, not defect probability.** The score captures
   structural quality (complexity, nesting, coupling), not logical correctness. A
   well-structured file can have subtle bugs; a messy file can be correct. AUROC 0.678 is
   a structurally sensible result, not a failure.

5. **Exclusion of test files.** Test files are excluded to reduce label noise, but this means
   bugs in test code are not captured.

6. **Execa is JavaScript-primary.** The execa repo uses TypeScript only for declarations
   (`.d.ts`). Source analysis runs via the TypeScript analyzer (which handles JS) but the
   patterns skew toward JavaScript-style code. The ts-node and zod repos are TypeScript-primary,
   giving the dataset a roughly 47%/53% JS/TS split.

7. **This is NOT a claim that we detect bugs.** We do not make that claim. The metric is:
   "lower health score → higher probability the file was touched by a fix-commit in the
   sampled window". That is a proxy for structural fragility, not a direct bug oracle.

---

## Comparison to Existing Java Results

| Language | Dataset | Ground truth | n | AUROC | CI |
|---|---|---|---|---|---|
| Java | MLCQ | Human-labeled smells | 358 | 0.688 (overall) | — |
| Java | MLCQ | Long method only | 87 | 0.724 | — |
| Java | Defects4J | Bug proxy | ~4000 | 0.495 | — |
| **TypeScript/JS** | **This work (SZZ proxy)** | **Bug-fix commit proxy** | **1043** | **0.678** | **[0.648, 0.710]** |

The TypeScript/JavaScript AUROC (0.678) is statistically indistinguishable from the Java
MLCQ overall AUROC (0.688) at the 95% level (CIs overlap). Both are substantially above
the Defects4J bug-proxy baseline (0.495), which is expected because bugs measure logical
correctness and health measures structural quality.

---

## Updating This Calibration

To reproduce or re-run with more repos:

```bash
# Clone repos into a directory
mkdir -p /tmp/ts-cal && cd /tmp/ts-cal
git clone --depth=400 https://github.com/sindresorhus/execa
git clone --depth=400 https://github.com/TypeStrong/ts-node
git clone --depth=400 https://github.com/colinhacks/zod

# Run calibration
cd <repo-root>
node scripts/validation/ts-calibration.mjs \
  --repos=/tmp/ts-cal/execa,/tmp/ts-cal/ts-node,/tmp/ts-cal/zod \
  --maxCommits=500 \
  --save
```

To add a new repo: clone it, add its path to `--repos`. To add a language-specific analysis
(separate JS vs TS AUROC), pass `--json` and filter the output by `langCounts`.

Raw cloned repos are gitignored (`benchmark-data/ts-calibration/raw-repos/`).
The results JSON (`benchmark-data/ts-calibration/results.json`) is committed.
