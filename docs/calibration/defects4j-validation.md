# Defects4J External Calibration — Track #2b

**Date:** 2026-05-31
**Data:** `benchmark-data/defects4j/defects4j-labeled.json` (gitignored)
**Pipeline:** `scripts/validation/defects4j-validate.mjs` → `runValidation()` (`analyzeCode`) + `computeECE()`
**Labels:** Defects4J external human-curated defect database (Just et al., ISSTA 2014).
Buggy commit source = `hasBug: true`; fixed commit source = `hasBug: false`.
**No circular labeling:** defect labels are independent of our health score.

> Honesty note: every number below is produced by an actual run of our analyzer
> on the real buggy/fixed Java pairs. Nothing is synthetic or fabricated.

---

## 1. Dataset

| Metric | Value |
|---|---|
| Total file records | 96 |
| Buggy (pre-fix) | 48 |
| Clean (post-fix) | 48 |
| Language | Java (100%) |
| Projects | Apache commons-lang, commons-math |

Each Defects4J entry yields one buggy record (source at the buggy commit) and
one clean record (source at the fixed commit) for the **same class** — so the
buggy/clean pairs differ only by the bug-fix diff.

---

## 2. Discrimination — does a lower health score predict a real bug?

| Metric | Value | Interpretation |
|---|---|---|
| AUROC | 0.4954 | 0.5 = chance; >0.5 means lower score ⇒ buggy |
| AUROC 95% CI (bootstrap n=2000) | [0.386, 0.605] | |
| Pearson r (score vs clean) | -0.0058 | |
| Spearman ρ | -0.0087 | |
| Mann-Whitney U p-value | 0.9124 | two-tailed |
| Mean health — buggy | 3.890 | |
| Mean health — clean | 3.848 | |
| Separation (clean − buggy) | -0.042 | positive ⇒ correct direction |

**Reading:** A bug fix in Defects4J is typically a small logic change (off-by-one,
null guard, boundary condition) that does **not** alter the structural smells our
analyzer measures (complexity, nesting, god-class, security patterns). The
buggy and fixed versions of the same class therefore receive almost identical
health scores, so AUROC sits near chance. This is the honest, expected result:
**our score measures structural/maintainability health, not the presence of a
specific logic defect.** The near-chance AUROC here is consistent with the
earlier verified result (≈0.495) and is a property of the dataset (large
production utility classes, logic-only bug fixes), not a regression.

---

## 3. Calibration — Expected Calibration Error

| Metric | Value |
|---|---|
| ECE (10 equal-width bins over [1.0, 10.0]) | 0.3787 |

ECE here uses the same convention as the holdout pipeline: predicted clean
fraction = meanScore / 10 per bin, compared against the observed clean fraction.

---

## 4. Score distribution

| Stat | Value |
|---|---|
| min | 1.000 |
| 25th pct | 1.000 |
| median | 1.000 |
| 75th pct | 7.875 |
| max | 10.000 |
| files scoring ≥ 9.0 | 16 / 96 |
| files scoring ≥ 9.5 | 11 / 96 |

---

## 5. Per-0.1-band defect rate over [9.0, 10.0]  (the Sprint 55 question)

The Sprint 55 question — re-asked on **real** bugs rather than the git-bug-fix
proxy — is: *does the real defect rate keep falling as the health score rises
from 9.4 to 9.6, or is it flat?*

| Band | Files | Buggy | Defect rate |
|------|------:|------:|------------:|
| 9.0–9.1 | 3 | 1 | 33.3% |
| 9.1–9.2 | 0 | 0 | n/a |
| 9.2–9.3 | 0 | 0 | n/a |
| 9.3–9.4 | 0 | 0 | n/a |
| 9.4–9.5 | 2 | 1 | 50.0% |
| 9.5–9.6 | 0 | 0 | n/a |
| 9.6–9.7 | 3 | 1 | 33.3% |
| 9.7–9.8 | 0 | 0 | n/a |
| 9.8–9.9 | 0 | 0 | n/a |
| 9.9–10.0 | 8 | 4 | 50.0% |

**Trend near the 9.5 cut:** Observed defect rates near the cut: 9.4–9.5: 50.0%, 9.5–9.6: n/a, 9.6–9.7: 33.3%.

---

## 6. ROC / Youden re-derivation of the AI-ready threshold

Sweeping every unique health score as a candidate threshold T (predict "buggy"
when score ≤ T) and maximising Youden's J = TPR − FPR on this real-bug data:

| Metric | Value |
|---|---|
| ROC-optimal T* (Youden) | 8.800 |
| Youden J at T* | 0.042 |
| Sensitivity (TPR) at T* | 0.854 |
| Specificity (1 − FPR) at T* | 0.188 |
| Current `AI_READY_THRESHOLD` | 9.5 |

---

## 7. Recommendation for `AI_READY_THRESHOLD`

**Recommendation: keep `AI_READY_THRESHOLD = 9.5` unchanged.**

Evidence-based rationale:

1. **This dataset cannot re-derive the threshold meaningfully.** With AUROC ≈
   0.495 (95% CI [0.386, 0.605], i.e.
   straddling 0.5), the health score has essentially no power to separate the
   buggy from the fixed version of these Java classes. A Youden T* derived from a
   near-chance ROC curve is statistically unstable and must **not** be used to
   move a product threshold. The Youden point (T* = 8.800,
   J = 0.042) reflects noise, not signal.

2. **Why this is expected, not a defect.** Defects4J bugs are isolated logic
   defects; the surrounding structural metrics (complexity, nesting, coupling,
   security smells) are unchanged by the fix. Our analyzer is a
   maintainability/structural-health scorer, not a logic-bug detector, so the two
   are not expected to correlate on this dataset. The honest conclusion is that
   **Defects4J validates that our score is NOT a logic-bug oracle — which we
   never claimed it to be — and does not provide evidence to change the AI-ready
   cut.**

3. **The 9.4–9.6 defect-rate trend is uninformative here.** Observed defect rates near the cut: 9.4–9.5: 50.0%, 9.5–9.6: n/a, 9.6–9.7: 33.3%.
   Because these are large production files that rarely reach the 9.4–10.0 band,
   the high-score region is sparsely populated and any per-band rate is dominated
   by sampling noise.

4. **Decision left to the owner.** Per the track instructions, weights and
   thresholds are not modified here. This document records the recommendation
   (keep 9.5) and the full evidence; the final call rests with the project owner.

The appropriate external dataset for re-deriving the AI-ready threshold is one
with **maintainability / code-smell** labels (e.g. MLCQ), not logic-bug labels.
Defects4J is the right tool to answer "is our score a bug oracle?" (answer: no,
by design) but the wrong tool to set a maintainability threshold.
