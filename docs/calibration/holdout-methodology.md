# Holdout Corpus Methodology — Sprint 55

## Overview

The Sprint 55 holdout corpus is a curated set of source files with human-assigned
maintainability ratings used to empirically validate the `AI_READY_THRESHOLD = 9.5`
beyond the Java/Defects4J dataset.  The corpus covers Python, Go, TypeScript, and
JavaScript (79 execa JS files, 111 golang/tools Go files, 25 psf/requests Python
files, 9 hand-crafted TypeScript files — 224 records total).

---

## Provenance and Limitations

### Labeling proxy: git-bug-fix-commit

Labels are assigned by a **heuristic proxy**, not by direct measurement of defects or
LLM break rates.  The proxy logic:

| Condition | Rating | `hasBug` | Estimated accuracy |
|-----------|--------|----------|--------------------|
| In "fix" commit AND score < 5.0 | 1–2 | true | Moderate — see FP note |
| In "fix" commit AND score 5.0–7.0 | 2 | true | Low confidence |
| NOT in "fix" commit AND score < 5.0 | 2 | true | Moderate |
| score 5.0–7.9 (any) | 3 | false | Borderline |
| score >= 8.0, stable | 4–5 | false | High |

**Known false-positive rate:** The git `--grep=fix` pattern matches commit messages
containing the word "fix" anywhere, including documentation fixes, typo fixes, and
version bumps.  The estimated false-positive rate is **~20–30%** — i.e., roughly one
in four "bug-fix" labeled files may not reflect a real maintainability defect.

**LLM break rates are synthetic:** The `llmBreakRate` values in `corpus-labels.json`
are manually assigned based on expected difficulty (0.0 for clean files, 0.6–0.8 for
defective ones).  No actual LLM refactoring runs were performed to measure these values.
Replacing synthetic values with measured ones requires an API key and the
`runRefactoringLoop()` pipeline.

**Language coverage is narrow:** The corpus covers Go, Python, and JavaScript from
three well-maintained OSS projects.  Generalisation to other languages (Java, C#, Rust,
etc.) or to different project styles is untested.

**Single rater:** Hand-crafted fixture labels were assigned by a single reviewer.
Cohen's κ (inter-rater agreement) has not been measured.

---

## File Selection Criteria

### Score span

The committed `corpus.json` covers the **full score range [1.0, 10.0]** — this is
required for computing AUROC and ECE across the defective/clean decision boundary.

The `build-holdout-corpus.mjs` wrapper (which uses `holdout-builder.ts`) defaults to
`--min-score 8.0` for targeted threshold validation in the sprint-55 decision zone.
Pass `--min-score 0` to produce a full-range corpus from an arbitrary source directory.

### Fixture directories

| Directory | Contents | Approx score range |
|-----------|----------|-------------------|
| `healthy/` | Hand-crafted clean files | 9.0–10.0 |
| `borderline/` | Hand-crafted borderline + real OSS borderline | 7.0–9.0 |
| `unhealthy/` | Hand-crafted complex + real OSS defective | 1.0–7.0 |
| `real/` | Real OSS files rated clean (rating 4–5) | 8.0–10.0 |

---

## Maintainability Rating Protocol

Each file in the corpus is assigned a `maintainabilityRating` on a 1–5 integer scale:

| Rating | Meaning |
|--------|---------|
| 1 | Unreadable / unmaintainable — typical legacy or auto-generated code |
| 2 | Hard to maintain — requires significant refactoring |
| 3 | Acceptable — functional but with identifiable smells |
| 4 | Well-maintained — clear structure, minor improvements possible |
| 5 | Exemplary — documentation, types, and structure are all excellent |

### Conversion to bug label

```
maintainabilityRating < 3  → hasBug: true   (ratings 1 and 2)
maintainabilityRating >= 3 → hasBug: false  (ratings 3, 4, and 5)
```

A sentinel value of `-1` means no rating is available; such files are excluded from
statistical analysis.

---

## Calibration Pipeline — Reproducible Commands

All scripts below are run from the **repository root**.  The committed `corpus.json`
is already valid; regeneration is only needed when fixture files or labels change.

### Step 0: Build the core library

```bash
pnpm build
```

Required before any script that imports `packages/core/dist/`.

---

### Step 1a: Regenerate `corpus.json` from in-repo fixtures (no network)

This is the normal regeneration path.  It reads the fixture directories that are
already committed to the repo and rebuilds `corpus.json` deterministically.

```bash
node scripts/validation/holdout/generate-corpus-json.mjs
```

Optional flags:
```
  --fixture-dir <path>   (default: packages/core/tests/fixtures/holdout)
  --labels <path>        (default: <fixture-dir>/corpus-labels.json)
  --out <path>           (default: <fixture-dir>/corpus.json)
  --min-score <number>   (default: 0 — include all scores for ECE/ROC)
```

Example — rebuild with score >= 8.0 filter (sprint-55 threshold zone only):
```bash
node scripts/validation/holdout/generate-corpus-json.mjs --min-score 8.0
```

---

### Step 1b: Re-fetch real OSS files and rebuild labels (REQUIRES NETWORK)

Run this only when you want to update the corpus with new OSS file versions or add
new repositories.  This step clones three repositories (~150 MB total):

- `psf/requests` — Python
- `golang/tools` — Go
- `sindresorhus/execa` — JavaScript

```bash
# Clone repos into ../holdout-oss (sibling of repo root, not committed)
node scripts/validation/holdout/fetch-real-oss-files.mjs

# After cloning, rebuild corpus.json from updated fixture dirs
node scripts/validation/holdout/generate-corpus-json.mjs
```

Optional flags for `fetch-real-oss-files.mjs`:
```
  --oss-dir <path>        (default: ../holdout-oss relative to repo root)
  --fixture-dir <path>    (default: packages/core/tests/fixtures/holdout)
  --labels-out <path>     (default: <fixture-dir>/corpus-labels.json)
  --skip-clone            (skip git clone/pull; use existing checkouts)
```

On subsequent runs, `fetch-real-oss-files.mjs` performs a `git pull --ff-only`
instead of a full clone, so only new commits are downloaded.

---

### Step 2: Run ECE validation

```bash
node scripts/validation/run-ece-validation.mjs \
  --corpus packages/core/tests/fixtures/holdout/corpus.json
```

Expected output (from committed corpus.json, 2026-05-30):
```
Total files: 224  Buggy: 62  Clean: 162
AUROC: 0.993   Pearson r: 0.884
Overall ECE: 0.1240
```

---

### Step 3: Run per-language ROC thresholds

```bash
node scripts/validation/run-per-language-thresholds.mjs \
  --corpus packages/core/tests/fixtures/holdout/corpus.json \
  --out docs/calibration/per-language-roc.json
```

Expected output (from committed corpus.json, 2026-05-30):
```
Languages with sufficient data: 2

Språk           ROC-optimal tröskel   Youden J  Alves P90    Delta
go                            4.900      0.960     10.000   -5.100
python                        4.400      1.000      9.700   -5.300
```

Note: Go and Python are the only languages with >= 5 buggy + 5 clean files in the
current corpus.  TypeScript and JavaScript do not meet the minimum coverage threshold.

---

### Step 4: Run validation tests

```bash
pnpm --filter @healthy-ai-code/core test tests/validation/
```

All 56 tests must pass (including the holdout integration test that exercises
`buildHoldoutDataset()` against the 224-file fixture corpus).

---

## Network Requirement Summary

| Step | Network needed? | What is fetched |
|------|----------------|-----------------|
| `pnpm build` | No | — |
| `generate-corpus-json.mjs` | **No** | Reads in-repo fixtures only |
| `run-ece-validation.mjs` | **No** | Reads in-repo `corpus.json` only |
| `run-per-language-thresholds.mjs` | **No** | Reads in-repo `corpus.json` only |
| `fetch-real-oss-files.mjs` | **Yes** | Clones psf/requests, golang/tools, sindresorhus/execa |
| `inspect-oss-files.mjs` | No (post-clone) | Reads cloned repos from `--oss-dir` |

The large OSS clones (`holdout-oss/`) are **not committed** to this repository.
The committed `corpus.json` (1.45 MB, inline source code + labels) is the source of
truth for validation and reproduces the ECE/ROC numbers without network access.

---

## What Is Self-Contained vs. What Requires Network

**Fully in-repo (no network ever needed):**
- `packages/core/tests/fixtures/holdout/` — all 224 fixture files
- `packages/core/tests/fixtures/holdout/corpus-labels.json` — all 224 labels
- `packages/core/tests/fixtures/holdout/corpus.json` — full corpus (224 records, 1.45 MB)
- `scripts/validation/holdout/generate-corpus-json.mjs` — rebuilds corpus.json from fixtures
- `scripts/validation/run-ece-validation.mjs` — reads corpus.json
- `scripts/validation/run-per-language-thresholds.mjs` — reads corpus.json

**Requires network (to update the OSS portion of the corpus):**
- `scripts/validation/holdout/fetch-real-oss-files.mjs` — clones/pulls OSS repos,
  copies files into fixture dirs, regenerates `corpus-labels.json`

---

## Calibration Pipeline Summary

```
# Normal path (no network):
pnpm build
node scripts/validation/holdout/generate-corpus-json.mjs
node scripts/validation/run-ece-validation.mjs \
  --corpus packages/core/tests/fixtures/holdout/corpus.json
node scripts/validation/run-per-language-thresholds.mjs \
  --corpus packages/core/tests/fixtures/holdout/corpus.json \
  --out docs/calibration/per-language-roc.json

# Update OSS files (network required):
node scripts/validation/holdout/fetch-real-oss-files.mjs
node scripts/validation/holdout/generate-corpus-json.mjs
```
