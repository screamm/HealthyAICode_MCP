# MLCQ External Validation (Human-Rated Code Smells)

**Status:** Real run, 31 May 2026. Java-only. External ground truth (human reviewers).
**Script:** `scripts/validation/mlcq-validate.mjs` (read-only consumer of `@healthy-ai-code/core`).

## What this is

This validates our smell detectors against **human judgement**, not against our own
health score and not against a git-bug-fix proxy. The labels come from the **MLCQ**
dataset (Madeyski & Lewowski, *EASE 2020*; Zenodo DOI `10.5281/zenodo.3666840`), in which
26 professional reviewers rated real Java code elements for four smell types on a severity
scale (`none` / `minor` / `major` / `critical`). We treat **severity ≠ `none` as a
positive** ("a reviewer considered this a smell") and run our detectors on the *same* Java
source files at the *same* commit the reviewers saw.

This is the external-label replacement for the earlier git-proxy approach. There is no
circular labeling: the positive/negative ground truth is entirely human-assigned.

## Method

1. The manifest (`benchmark-data/mlcq/mlcq-manifest.json`, 358 entries → 341 unique Java
   files on disk) records each labeled element with its `smellType`, `severityLabel`, and
   the `[startLine, endLine]` range in the downloaded file. Line numbers align exactly with
   the raw file content (verified: `startLine` of the first sample is the `public class …`
   declaration).
2. For each sample we run `analyzeCode(code, 'java', file)` (whole-file analysis, cached so
   each file is analyzed once) and keep only the detector smell types that map to the MLCQ
   smell type:

   | MLCQ smell type | Our detector types |
   |---|---|
   | blob | `GodClass` |
   | long method | `ComplexMethod`, `BrainMethod`, `LargeMethod`, `CognitiveComplexity` |
   | feature envy | `FeatureEnvy` |
   | data class | `DataClumps`, `PrimitiveObsession` |

3. A **detection** is counted when at least one matching smell falls inside the labeled
   `[startLine, endLine]` range (±3-line slack to absorb annotation/javadoc lines above a
   declaration). This range-overlap rule is necessary because 13 files contain more than one
   labeled element.
4. **Precision / recall / F1** use the binary detected-vs-positive outcome.
   **AUROC** uses a graded intensity score per sample = Σ severity-weight of the matching
   in-range smells (`critical=4, high=3, medium=2, low=1`).

### AUROC orientation note

`computeAUROC(scores, labels)` in core follows the Defects4J convention where a **lower**
score predicts the positive class (lower health → buggy). Our smell intensity is the
opposite (higher intensity → more likely a smell), so the script negates the intensity
before calling `computeAUROC`. The reported AUROC is therefore the proper "higher intensity
ranks positives above negatives" value. (An earlier run that fed raw intensity returned the
mirror value `1 − AUROC`, e.g. 0.276 instead of 0.724 for long method — corrected here.)

## Results (real run, 358 samples, 0 missing files)

| smell type | n | pos | neg | TP | FP | FN | TN | precision | recall | F1 | AUROC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| blob | 88 | 43 | 45 | 0 | 0 | 43 | 45 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| long method | 87 | 44 | 43 | 21 | 2 | 23 | 41 | 0.9130 | 0.4773 | 0.6269 | 0.7236 |
| feature envy | 93 | 48 | 45 | 0 | 0 | 48 | 45 | 0.0000 | 0.0000 | 0.0000 | 0.5000 |
| data class | 90 | 44 | 46 | 7 | 3 | 37 | 43 | 0.7000 | 0.1591 | 0.2593 | 0.5442 |

**Micro-averaged (all four types pooled):** precision = 0.8485, recall = 0.1564, F1 = 0.2642
(TP = 28, FP = 5, FN = 151, TN = 174).

Reproduce: `node scripts/validation/mlcq-validate.mjs` (table) or `--json` (machine-readable).

## Honest interpretation

- **High precision, low recall.** When our detectors do fire on a labeled element they are
  usually right (long method precision 0.91, data class 0.70; only 5 false positives across
  202 negatives, micro-precision 0.85). But recall is low (micro 0.16) — we miss most
  elements that humans flagged. Our thresholds are tuned conservatively to avoid noise in
  the refactoring loop, which trades recall for precision. Against human "is this a smell?"
  labels that trade-off is now quantified.

- **`GodClass` and `FeatureEnvy` fire zero times** across all 341 real Java files, not just
  within the labeled ranges. This is a genuine calibration finding, not a wiring bug — both
  detectors are reachable through `analyzeCode` for Java (`packages/core/src/analyzers/java.ts`
  lines 72–73) and `DataClumps`/`PrimitiveObsession` on the same path fire 693/515 times.
  `GodClass` requires `ATFD > 5` **AND** `WMC ≥ 20` **AND** `LCOM4 > 1` simultaneously; no
  MLCQ blob-labeled file satisfies all three. `FeatureEnvy` is similarly conservative. The
  existing `god-class` unit test only asserts the *negative* case (does not flag a small
  cohesive class), so this gap was not previously visible. **Result: 0 recall on human blob
  and feature-envy labels.** AUROC is exactly 0.5 for these two because the intensity signal
  is constant (all zero), i.e. no discriminative power.

- **`long method` is the strongest signal** (AUROC 0.724, F1 0.627). The graded intensity
  cleanly separates the classes: mean intensity 4.45 on positives vs 0.16 on negatives, with
  21/44 positives detected vs only 2/43 negatives. This is the detector family where our
  thresholds align best with human judgement.

- **`data class` (AUROC 0.544)** is only marginally above chance. Our `DataClumps` /
  `PrimitiveObsession` detectors fire often globally but rarely inside the specific
  human-labeled data-class ranges, and when they do the positive/negative separation is
  weak. This suggests our "data clump" notion (repeated parameter groups, primitive-heavy
  signatures) only partially overlaps with the human "data class" concept (a class that is
  mostly fields with getters/setters and little behaviour).

## Scope and limitations

- **Java only.** MLCQ covers only Java, so these numbers say nothing about the other 40
  supported languages.
- **Sample size is modest** (87–93 per smell type, ~358 total). Confidence intervals on the
  per-smell metrics are wide; treat the AUROC values as directional, not precise.
- **Sampling.** 100 samples per smell type were drawn (50 positive across minor/major/critical,
  50 negative), seed 42; 42 dropped because their source files were unfetchable (deleted from
  upstream repos), leaving the counts above. Severity strata are uneven (few `critical`).
- **Whole-file analysis vs element labels.** We analyze the whole downloaded file and map
  detections back to the labeled range. A file can contain several labeled elements; the
  ±3-line slack and range-overlap rule mitigate but do not eliminate cross-element leakage.
- **Concept mismatch.** Our detector taxonomy was not designed to reproduce MLCQ's four
  categories one-to-one; the mapping table above is a best-effort correspondence.

## Provenance

- Labels: `benchmark-data/mlcq/MLCQCodeSmellSamples.csv` (14,739 reviews → 9,517 majority-vote
  samples), aggregated and sampled into `mlcq-manifest.json`.
- Source files: fetched from `raw.githubusercontent.com` at the exact `commitHash` each
  reviewer saw (341 `.java` files, 76.8 MB, gitignored under `benchmark-data/`).
- No core scoring code was modified; the validation script is a read-only consumer.
