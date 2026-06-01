# DeLong Significance — Ours vs. Each Competitor (MLCQ, recalibrated detectors)

**Date:** 2026-06-01
**Tool version:** `@healthy-ai-code/core` (branch `feat/sprints-51-60-implementation`),
**with the recalibrated GodClass / FeatureEnvy detectors** (see
`docs/calibration/godclass-featureenvy-recalibration.md`).
**Dataset:** MLCQ — human majority-vote Java code-smell labels (Madeyski & Lewowski,
*EASE 2020*; Zenodo DOI `10.5281/zenodo.3666840`). Positive = `minor|major|critical`,
negative = `none`.
**Test:** DeLong's paired test for two correlated ROC AUCs
(`packages/core/src/validation/delong.ts`), two-tailed.

**What this answers:** the competitive benchmark (`competitive-benchmark.md`) read
"lead / tie / trail" off *overlapping bootstrap CIs* and explicitly noted no paired test
was run. This document runs the formal paired DeLong test of the AUC *difference*, using
the **recalibrated** detectors, to state whether our lead is statistically significant.

---

## Method (honest)

1. **Our signal regenerated live this session.** `risk = -HealthResult.score` from
   `analyzeFile()` over `benchmark-data/mlcq/java_files/` with the compiled recalibrated
   detectors. This is the *same per-file risk definition* used to produce the 0.688 in
   `competitive-benchmark.md`. 331/341 unique files recomputed; 10 files > 500 KB skipped
   (same rule the original harness used). After recalibration the detectors now fire:
   **456 GodClass** and **1839 FeatureEnvy** detections across the corpus (both were **0**
   before — that was the recalibration's whole point).
2. **Competitor signals are the real runs already on disk** (no re-running needed, no
   fabrication):
   - **lizard** max CCN — `benchmark-data/competitive-raw.json` (lizard 1.22.2).
   - **PMD 7.10** quickstart violation count — `benchmark-data/_pmd-violations.csv`.
   - **SonarQube 26.5** `code_smells` / `sqale_index` / `cognitive_complexity` —
     `benchmark-data/_sonar-measures.json` (339/341 files).
3. **DeLong is paired**, so each comparison uses only the files where **both** tools
   produced a numeric signal (the intersection). All signals oriented higher = more risk;
   `delongTest` is fed risk directly (higher = positive class).

Reproduce: `pnpm build && node scripts/benchmarks/delong-significance.mjs`
(writes `benchmark-data/delong-significance.json`).

---

## Effect of recalibration on the file-level AUROC (full coverage, n = 343)

| | AUROC | n |
|---|---|---|
| Ours, **before** recalibration (old `competitive-raw.json` scores) | 0.6880 | 343 |
| Ours, **after** recalibration (recomputed this session) | 0.6874 | 343 |

The recalibration changed our per-file score on **149 of 343** files, but the file-level
ranking AUROC barely moved (0.688 → 0.687). Reason: the files where GodClass/FeatureEnvy
newly fire were already smell-heavy and floored near score = 1, so adding two more smell
types rarely changes their *rank* against clean files. **The recalibration fixed the two
detectors' 0-recall without inflating our headline AUROC** — we report this plainly rather
than claiming the recalibration improved the competitive number.

---

## DeLong table — Ours vs each competitor (paired, two-tailed)

Ours AUROC varies slightly per row because each comparison is on a different paired
sample set (the intersection with that competitor's coverage).

| Comparison | n (paired) | AUROC ours | AUROC comp | Δ (ours − comp) | z | p (two-tailed) | 95% CI of Δ | Significant @ 0.05? |
|---|---|---|---|---|---|---|---|---|
| Ours vs **lizard** (max CCN) | 334 | 0.6811 | 0.6848 | **−0.0037** | −0.19 | **0.847** | [−0.042, +0.034] | No (tie) |
| Ours vs **PMD** (quickstart) | 343 | 0.6874 | 0.6210 | **+0.0664** | 3.08 | **0.0021** | [+0.024, +0.109] | **Yes** |
| Ours vs **SonarQube** (code_smells) | 343 | 0.6874 | 0.6455 | **+0.0419** | 2.00 | **0.046** | [+0.001, +0.083] | **Yes** |
| Ours vs **SonarQube** (sqale_index) | 343 | 0.6874 | 0.6467 | **+0.0407** | 1.94 | **0.053** | [−0.0004, +0.082] | No (borderline) |
| Ours vs **SonarQube** (cognitive_complexity) | 280 | 0.6689 | 0.6312 | **+0.0378** | 1.81 | **0.070** | [−0.003, +0.079] | No |

Sample sizes: paired n = 280–343 (SonarQube `cognitive_complexity` is absent for trivial
files, shrinking that pair to 280; the 2 generated Thrift files that OOM'd SonarQube's
Java analyzer are excluded from the Sonar pairs).

---

## Verdict (honest)

- **Ours vs lizard: a statistical tie, not a lead.** Δ = −0.0037, p = 0.85, and the CI of
  the difference straddles zero ([−0.042, +0.034]). The paired DeLong test confirms what
  the overlapping bootstrap CIs already suggested: **we and lizard are indistinguishable at
  the top of MLCQ.** If anything the point estimate now slightly favors lizard on the
  paired set (0.6848 vs 0.6811), well inside noise. A single max-cyclomatic-complexity
  number remains a very strong MLCQ smell detector because MLCQ's smell types
  (blob, long method, feature envy, data class) are heavily size/complexity-correlated.
- **Ours vs PMD: a real, significant lead.** Δ = +0.066, p = 0.0021, CI entirely above
  zero. This survives Bonferroni (see below).
- **Ours vs SonarQube `code_smells`: significant at 0.05 but not after correction.**
  Δ = +0.042, p = 0.046 — fails the Bonferroni-corrected threshold.
- **Ours vs SonarQube `sqale_index` / `cognitive_complexity`: not significant.**
  p = 0.053 and 0.070; both CIs include zero. The point estimates favor us by ~0.04 AUROC,
  but at this n the difference is not statistically distinguishable.

**Bottom line:** Against a complexity baseline (lizard) we **tie** — there is no
statistically significant lead. Against the rule/issue-count tools we lead, but only the
**PMD** margin is robust; the SonarQube margins are at-or-below the 0.05 line and do not
survive multiple-comparison correction. The recalibrated detectors did **not** change this
picture, because they did not move the headline file-level AUROC.

---

## Multiple-comparison caveat (Bonferroni)

Five comparisons share one "ours" signal, so the family-wise error rate is inflated.
Bonferroni-corrected threshold: α = 0.05 / 5 = **0.01**.

| Comparison | p | Significant @ 0.05 | Significant @ 0.01 (Bonferroni) |
|---|---|---|---|
| Ours vs lizard | 0.847 | No | No |
| Ours vs PMD | 0.0021 | Yes | **Yes** |
| Ours vs Sonar code_smells | 0.046 | Yes | No |
| Ours vs Sonar sqale_index | 0.053 | No | No |
| Ours vs Sonar cognitive_complexity | 0.070 | No | No |

**Only the PMD comparison survives Bonferroni correction.** Every other "lead" is either a
tie (lizard) or fails the corrected threshold.

## In-sample optimism caveat

The GodClass / FeatureEnvy thresholds were tuned on the MLCQ recalibration **train** split
(stratified 60/40, seed 42). This DeLong test runs on the **full** MLCQ set, so **~60.2%**
(201 / 334 paired-with-lizard rows) of our signal is in-sample for those two detectors. In
practice this barely matters here — the recalibration moved the full-coverage AUROC by only
−0.0006 (0.6880 → 0.6874), so the in-sample portion cannot be inflating our DeLong AUC in
any material way. But it is reported for completeness: a fully held-out competitive AUROC
would use only the 138-sampleId holdout split, which is too small for a stable DeLong
comparison against all five competitors.
