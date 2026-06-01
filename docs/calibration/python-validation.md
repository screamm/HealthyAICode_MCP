# Python External Calibration — BugsInPy

**Status:** Real run, 2026-06-01. Python-only. External ground truth (BugsInPy defect database).
**Script:** `scripts/validation/python-calibration.mjs`
**Dataset:** BugsInPy (Widyasari et al., ESEC/FSE 2020,
DOI: [10.1145/3368089.3417943](https://dl.acm.org/doi/abs/10.1145/3368089.3417943)).

> Honesty note: every number below is produced by an actual run of our Python
> analyzer on real buggy/fixed Python source pairs fetched from GitHub. Nothing
> is synthetic or fabricated. Sample sizes are reported transparently.

---

## 1. Dataset

| Metric | Value |
|---|---|
| Bug entries processed | 149 |
| File records total | 298 (149 buggy + 149 fixed) |
| Fetch failures | 1 (file moved/deleted between commits) |
| Parse failures | 0 |
| Language | Python (100%) |
| Projects | pandas, keras, scrapy, youtube-dl, matplotlib, luigi |

**Provenance:** Each BugsInPy entry records a `buggy_commit_id` and a
`fixed_commit_id`. We fetch the first changed non-test `.py` file at both
commits via `raw.githubusercontent.com` and score it with our Python analyzer
(same pipeline as `analyzeCode(source, 'python')` for Python files, using
tree-sitter-python AST + smell detectors + scorer). Buggy commit → `hasBug=true`;
fixed commit → `hasBug=false`. No circular labeling.

---

## 2. Discrimination — does a lower health score predict a real Python bug?

| Metric | Value | Interpretation |
|---|---|---|
| AUROC | 0.4984 | 0.5 = chance; >0.5 means lower score ⇒ buggy |
| AUROC 95% CI (bootstrap n=2000) | [0.4375, 0.5597] | |
| Mann-Whitney U p-value | 0.9415 | two-tailed |
| Mean health — buggy | 3.4852 | |
| Mean health — fixed | 3.4611 | |
| Separation (fixed − buggy) | -0.0242 | positive ⇒ correct direction |

**Reading:** BugsInPy bugs are overwhelmingly logic defects (off-by-one, type
errors, wrong condition, API misuse) whose diffs typically change 1–10 lines
and do not alter structural metrics (cyclomatic complexity, nesting depth,
function length, god-class thresholds). The buggy and fixed versions of the
same Python file therefore receive nearly identical health scores. Near-chance
AUROC is the **honest expected result** — consistent with our Java/Defects4J
finding (AUROC ≈ 0.495). We explicitly do not claim our score predicts logic
defects; it measures structural/maintainability health.

---

## 3. Calibration — Expected Calibration Error

| Metric | Value |
|---|---|
| ECE (10 equal-width bins over [1.0, 10.0]) | 0.3501 |

ECE convention: predicted clean fraction = meanScore / 10 per bin, compared
against observed clean fraction (hasBug = false). Lower ECE = better calibrated.

---

## 4. Youden-optimal threshold T* (Python-specific)

| Metric | Value |
|---|---|
| Optimal threshold T* | 1.00 |
| Youden index (J = sensitivity + specificity − 1) | 0.0000 |
| Precision at T* (score < T* → predicted buggy) | 0.0000 |
| Recall at T* | 0.0000 |
| F1 at T* | 0.0000 |
| Confusion: TP / FP / FN / TN | 0 / 0 / 149 / 149 |

Because AUROC is near 0.5, the Youden threshold has limited discriminative
value. It is reported for completeness and future comparison. **No Python-specific
threshold is recommended from this run** — the existing defaults
(AI_READY = 9.5, HEALTHY = 9.0) remain in effect.

---

## 5. Per-band defect-rate table

| Score band | n | buggy | defect rate |
|---|---|---|---|
| [1.0, 1.5) | 172 | 86 | 50.0% |
| [1.5, 2.0) | 4 | 2 | 50.0% |
| [2.0, 2.5) | 6 | 3 | 50.0% |
| [3.0, 3.5) | 8 | 4 | 50.0% |
| [3.5, 4.0) | 8 | 4 | 50.0% |
| [4.5, 5.0) | 4 | 2 | 50.0% |
| [5.0, 5.5) | 3 | 1 | 33.3% |
| [6.0, 6.5) | 2 | 1 | 50.0% |
| [6.5, 7.0) | 9 | 4 | 44.4% |
| [7.0, 7.5) | 13 | 7 | 53.8% |
| [7.5, 8.0) | 20 | 10 | 50.0% |
| [8.0, 8.5) | 17 | 9 | 52.9% |
| [8.5, 9.0) | 14 | 7 | 50.0% |
| [9.0, 9.5) | 8 | 4 | 50.0% |
| [9.5, 10.0) | 10 | 5 | 50.0% |

---

## 6. Score distribution

| Stat | Value |
|---|---|
| min | 1.0000 |
| 25th pct | 1.0000 |
| median | 1.0000 |
| 75th pct | 7.4000 |
| max | 9.7000 |
| files scoring ≥ 9.0 | 18 / 298 |
| files scoring ≥ 9.5 | 10 / 298 |

---

## 7. Honest interpretation and limitations

- **Near-chance AUROC is expected, not a failure.** BugsInPy bugs are logic
  defects; the diff between buggy and fixed is typically 1–10 lines that
  change program behaviour without altering structural metrics. This is the
  same result we observe on Java/Defects4J (AUROC ≈ 0.495).

- **What this calibration IS for:** It validates that our Python analyzer
  does not crash on real-world Python OSS code (298 records
  from 149 bug/fix pairs, 0 parse crashes). It quantifies ECE and
  establishes the score distribution over real Python production files.

- **Sample size.** 149 bug entries, 298 records. CI
  is wide; treat AUROC as directional not precise.

- **One file per bug.** We take the first changed non-test `.py` file per
  bug. Multi-file bugs and test-only changes are excluded from counts.

- **Fetch failures (1).** Occur when a file was renamed, moved,
  or deleted between the buggy and fixed commit.

- **Score distribution skew.** Most real Python production files (large
  pandas/matplotlib internals) score very low due to file size and magic
  numbers. This is not a regression — it reflects real complexity.

- **No smell-vs-human-label study.** This run tests structural-health AUROC
  against logic-defect labels. A Python smell detection study (analogous to
  MLCQ for Java — human reviewers labeling smell elements) is a separate
  future work item that would better validate our Python smell detectors.

---

## 8. Reproduce

```bash
# Build core first (required)
pnpm --filter @healthy-ai-code/core build

# Run calibration (fetches live from GitHub, ~5 min for 150 entries)
node scripts/validation/python-calibration.mjs

# Larger run
node scripts/validation/python-calibration.mjs --projects 300

# Force re-fetch manifest
node scripts/validation/python-calibration.mjs --rebuild
```

Raw source files and the manifest JSON are gitignored under `benchmark-data/`.

---

## 9. Comparison with Java results

| Dataset | Language | AUROC | n | Interpretation |
|---|---|---|---|---|
| Defects4J | Java | 0.4954 | 96 | near chance, expected |
| BugsInPy | Python | 0.4984 | 298 | near chance, expected |
| MLCQ (long method) | Java | 0.7236 | 87 | structural smell detection |

The near-chance AUROC on both defect datasets is consistent. MLCQ (human smell
labels) shows stronger signal (0.724 for long method) because structural smells
directly map to our detectors. The Python equivalent of MLCQ (human-labeled
Python smell instances) would be the right study for Python smell calibration.
