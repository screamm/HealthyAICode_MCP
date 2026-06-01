# Benchmark Methodology: Reproducible Eval Design

**Sprint 60 — 2026-05-30**
**Status:** Draft — awaiting first corpus run

---

## Overview

This document describes the reproducible benchmark design for evaluating the Healthy AI Code refactoring pipeline. The design follows the SWE-bench approach ([SWE-Refactor, arXiv 2602.03712](https://arxiv.org/html/2602.03712v1)) and uses RefactoringMiner 3.0 as the primary oracle for Java instances.

The benchmark answers a single question: **given a file with known code smells, does the pipeline's `applyAutoRefactor` transform produce code that is (a) compilable, (b) test-passing, and (c) verified as a correct refactoring by an AST oracle?**

---

## 1. Corpus Construction

### 1.1 Source Repositories

Benchmark instances are extracted from open-source repositories whose commit history contains clean refactoring commits. A commit is considered "clean" if it:

- Compiles before and after the change.
- Has all tests passing before and after.
- Was verified by RefactoringMiner as a single refactoring type (no mixed feature+refactoring commits).

Initial corpus covers 18 Java repositories (same selection as SWE-Refactor), to be extended with TypeScript and Python repositories in a later phase.

### 1.2 Extraction Pipeline

```
1. Clone repository at HEAD.
2. Run RefactoringMiner 3.0 on commit history → JSON list of refactoring instances.
3. For each instance:
   a. Checkout commit BEFORE the refactoring.
   b. Extract the single file being refactored (the "before" snapshot).
   c. Checkout commit AFTER the refactoring.
   d. Extract the same file (the "after" snapshot).
   e. Run PurityChecker (95% precision / 88% recall) to reject mixed commits.
4. Compute health scores: analyzeCode(before) and analyzeCode(after).
5. Keep only instances where after.score >= before.score + 0.1 (detectable improvement).
6. Store as JSONL: { id, language, refactoringType, before, after, beforeScore, afterScore }.
```

### 1.3 Running the Pipeline

```bash
node scripts/run-benchmark.mjs \
  --corpus path/to/corpus.jsonl \
  --outputDir results/ \
  --oracle refactoringminer  # 'refactoringminer' | 'rope' | 'ts-morph'
```

No manual steps are required after corpus extraction.

---

## 2. Oracle: RefactoringMiner

**RefactoringMiner 3.0** achieves F1 = 99.7% on the Oracle dataset ([documentation](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)).

For each benchmark instance, RefactoringMiner verifies that:

1. The pipeline's output contains the expected refactoring type (e.g., Extract Method, Rename Variable).
2. The transformation made no unintended structural changes beyond the target refactoring.

Verification command:

```bash
java -jar RefactoringMiner.jar \
  -bc /path/to/before.java /path/to/after.java \
  -json results/verification.json
```

A pipeline output is marked as **oracle-verified** if RefactoringMiner reports the expected refactoring type and no unintended changes.

---

## 3. Evaluation Metrics

| Metric | Definition | Target |
|---|---|---|
| Compilation success rate | % of pipeline outputs that compile successfully | ≥ 90% |
| Test-suite pass rate | % of compilation-successful outputs that pass all tests | ≥ 80% |
| RefactoringMiner AST verification | % of test-passing outputs confirmed by oracle | ≥ 70% |
| Score delta MAE | Mean absolute error: `|predictedDelta - actualDelta|` | ≤ 0.5 |
| CodeBLEU | Structural + textual similarity to human-refactored ground truth | ≥ 0.6 |

### 3.1 Score Delta MAE

The calibration telemetry pipeline (see `packages/core/src/telemetry/calibration-telemetry.ts`) captures `predictedDelta` and `actualDelta` per refactoring pass. MAE is computed by `flushAggregates()` → `meanAbsError` across all instances.

This metric directly feeds the threshold calibration flywheel: if MAE exceeds 0.5 over 1 000+ instances, the `AI_READY_THRESHOLD` (currently 9.5) may need recalibration.

### 3.2 CodeBLEU

CodeBLEU ([arXiv 2009.10297](https://arxiv.org/abs/2009.10297)) combines:

- n-gram match (syntactic similarity)
- AST match (structural similarity)
- data flow match (semantic similarity)

Score computed via the reference implementation: `python codeBLEU/calc_code_bleu.py`.

---

## 4. Validity Threats

The following threats must be acknowledged when interpreting benchmark results.

### 4.1 Java Bias

RefactoringMiner is Java-only. The corpus is therefore skewed toward Java refactoring patterns. Findings for TypeScript and Python instances use alternative oracles with lower accuracy:

- **TypeScript**: `ts-morph` confirms that the refactored AST is syntactically valid and that the intended transformation occurred. No semantic equivalence check.
- **Python**: `rope` confirms Python correctness but does not classify refactoring types.

This means AST verification rates for TypeScript and Python are not directly comparable to Java rates.

### 4.2 Selection Bias

Repositories that label commits as refactorings are not representative of all codebases. Developers who make clean, single-purpose refactoring commits may already have higher baseline code quality. The benchmark may therefore overestimate pipeline performance on "typical" codebases with mixed commits.

Mitigation: report results stratified by repository and smell type, not as a single aggregate.

### 4.3 Goodhart's Trap

The scoring system's goal is to produce behaviorally correct refactorings — not to maximize score. A pipeline that trivially renames variables to improve score without meaningful structural change would score well on MAE but fail on RefactoringMiner verification and CodeBLEU.

The primary acceptance criterion is therefore: **compilation + test-suite pass**, with score delta as a secondary signal. Oracle verification is the definitive measure of refactoring correctness.

### 4.4 LLM Contamination

Benchmark instances must come from repositories with commits dated **after the training data cutoff** of the model being evaluated. Instances from before the cutoff may have been seen by the model during pre-training, inflating performance.

Mitigation: filter corpus to commits dated 2026-01-01 or later for models with cutoffs before that date. Document cutoff dates in the corpus metadata.

### 4.5 Language Coverage Gap

The benchmark currently covers 3 languages (Java, TypeScript, Python) out of 41 supported by the analysis engine. Results should not be extrapolated to Tier B or Tier C languages without additional validation.

---

## 5. Reproducibility

All benchmark steps run without manual intervention:

```bash
# Step 1: Extract corpus from repositories
node scripts/extract-benchmark-corpus.mjs \
  --repoList docs/benchmark/repo-list.txt \
  --outputFile corpus/corpus.jsonl

# Step 2: Run pipeline evaluation
node scripts/run-benchmark.mjs \
  --corpus corpus/corpus.jsonl \
  --outputDir results/2026-05-30/

# Step 3: Compute metrics
node scripts/compute-benchmark-metrics.mjs \
  --resultsDir results/2026-05-30/ \
  --outputFile results/2026-05-30/metrics.json

# Step 4: Print summary
node scripts/print-benchmark-summary.mjs \
  --metricsFile results/2026-05-30/metrics.json
```

All scripts are deterministic for a given corpus and pipeline version. Random seeds are fixed. No network access during evaluation.

---

## 6. Example Mini-Corpus Run

The following 3 synthetic instances are used for smoke-testing the eval pipeline in CI (`packages/core/tests/benchmark/`):

| ID | Language | Refactoring Type | Before Score | After Score | Expected Delta |
|---|---|---|---|---|---|
| `instance-extract-method` | TypeScript | Extract Method | ~7.5 | ~9.0 | ≥ 0.5 |
| `instance-early-return` | TypeScript | Guard Clause (Early Return) | ~8.0 | ~9.2 | ≥ 0.5 |
| `instance-god-class` | TypeScript | Class Split | ~6.0 | ~8.5 | ≥ 0.5 |

These instances are defined in `packages/core/tests/fixtures/benchmark/`. They verify that:

1. `analyzeCode(after).score > analyzeCode(before).score` for all three instances.
2. Score improvement meets the minimum threshold (≥ 0.5).

The smoke test is intentionally minimal — it does not invoke RefactoringMiner (which requires Java 21). Full oracle verification runs only in the offline benchmark pipeline.

---

## 7. Open Questions

1. **ts-morph oracle precision**: ts-morph confirms AST validity but not refactoring type classification. A higher-precision TypeScript oracle is needed before TypeScript results can be compared to the Java 99.7% F1 baseline.

2. **Corpus size for statistical significance**: how many instances are needed for a 95% confidence interval of ±2% on each metric? Estimate: ~500 instances per language per refactoring type.

3. **Threshold recalibration trigger**: at what MAE level does the score delta exceed acceptable calibration error, triggering a threshold review? Proposed: MAE > 0.5 over ≥ 1 000 instances with sampleCount ≥ 100 per (smellType, language) cell.

---

## 8. References

- SWE-Refactor: [arXiv 2602.03712](https://arxiv.org/html/2602.03712v1)
- RefactoringMiner 3.0: [github.com/tsantalis/RefactoringMiner](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)
- CodeBLEU: [arXiv 2009.10297](https://arxiv.org/abs/2009.10297)
- Expected Calibration Error in JIT defect models: [arXiv 2504.12051](https://arxiv.org/abs/2504.12051)
- CodeScene Code Red study: [ar5iv.labs.arxiv.org/html/2203.04374](https://ar5iv.labs.arxiv.org/html/2203.04374)

---

*© 2026 Healthy AI Code contributors — CC BY 4.0*
