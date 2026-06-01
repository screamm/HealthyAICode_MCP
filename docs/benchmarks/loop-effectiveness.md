# Loop Effectiveness on Mid-Complexity Real Code

Generated: 2026-06-01. Aggregates the loop-bench runs under `benchmark-data/loop-bench/`.

## What was actually measured (and what was not)

This report aggregates the loop-effectiveness artifacts that **exist on disk**. The originally
planned inputs `results-dynamic.json`, `results-static.json`, and `behavior-check.json` were
**never generated** — those harnesses do not exist in this repo. The artifacts present are:

| File | What it is |
|---|---|
| `baseline-results.json` | "BEFORE" run: 30 mid-complexity field-repo files (score 5–8), py/js/ts/go only, via `scripts/loop-baseline.mjs`. |
| `midfiles.json` | The current 55-file mid-complexity manifest (12 languages), regenerated after the baseline. |
| `results-full.json` | "AFTER" run I generated for this report: the full 55-file manifest through `scripts/benchmarks/loop/run.mjs` (current calibration). |
| `results.json` | A 3-file `--smoke` run only; superseded by `results-full.json`. |

**The loop under test is the static, rule-based `runRefactoringLoop` — no LLM is in the loop.**
It applies deterministic refactoring strategies until the score reaches 9.5 or no strategy improves the score.

**Two caveats that bound every conclusion below:**

1. **The BEFORE and AFTER sets are different file populations**, not a controlled A/B. The baseline
   covers 30 files in 4 languages; the full run covers 55 files in 12 languages. Only **4 filenames
   overlap**. So "before-vs-after recalibration" can only be read as *two independent snapshots of the
   same static loop on similar (but not identical) mid-complexity corpora* — it is **not** evidence
   that any recalibration changed behavior on held-out data. No recalibration A/B was run.
2. **Behaviour preservation was not tested.** No test-execution / equivalence harness exists
   (`behavior-check.json` is absent). The only invariant actually checked is a **comment-count
   invariant** (post-refactor comment lines ≥ 90% of pre). That is a formatting guard, not a
   behaviour-equivalence proof.

## Summary table — full 55-file run (current calibration)

| Metric | Value |
|---|---|
| Files | 55 (0 errors) |
| Reached ≥9.5 (AI-ready target) | **1 / 55 (2%)** |
| Reached ≥9.0 (healthy) | **1 / 55 (2%)** |
| Improved / Unchanged / Degraded | 9 / 46 / 0 |
| Avg score before → after | 5.96 → 6.21 |
| Avg score delta | +0.24 |
| Median score delta | **0.00** |
| Avg / median iterations | 0.18 / **0** |
| Comment-invariant held | 55 / 55 (100%) |

### Iteration distribution
| Iterations | Files |
|---|---|
| 0 | 46 |
| 1 | 8 |
| 2 | 1 |

84% of files (46/55) trigger **zero** refactoring steps — the static loop finds no strategy that
raises the score, so the file is returned unchanged.

### Score-delta distribution
| Delta bucket | Files |
|---|---|
| < 0 (regressed) | 0 |
| = 0 | 46 |
| (0, 0.5] | 3 |
| (0.5, 1.0] | 2 |
| (1.0, 2.0] | 1 |
| > 2.0 | 3 |

When the loop *does* move, it usually helps a little; the few large gains (>2.0) are small files
where one strategy clears the dominant smell.

### Per-language convergence (full run)
| Language | n | avg Δ | reached ≥9.5 | reached ≥9.0 |
|---|---|---|---|---|
| python | 3 | +1.00 | 0 | 0 |
| ruby | 4 | +0.95 | 1 | 1 |
| rust | 6 | +0.28 | 0 | 0 |
| typescript | 12 | +0.24 | 0 | 0 |
| go | 8 | +0.13 | 0 | 0 |
| java | 5 | +0.08 | 0 | 0 |
| csharp | 6 | +0.07 | 0 | 0 |
| php | 6 | +0.00 | 0 | 0 |
| javascript | 2 | +0.00 | 0 | 0 |
| scala | 1 | +0.00 | 0 | 0 |
| kotlin | 1 | +0.00 | 0 | 0 |
| swift | 1 | +0.00 | 0 | 0 |

The single ≥9.5 success is one small Ruby file. Every other language converges to target **0%** of the time.

### Comment-invariant adherence
55/55 (100%). No run violated the ≥90% comment-line floor. This is the only behaviour-adjacent
invariant available — see caveat 2.

### Smell-resolution rates (full run, top smells by frequency)
| Smell | seen | resolved | rate |
|---|---|---|---|
| DuplicateCode | 27 | 0 | 0% |
| ComplexMethod | 25 | 4 | 16% |
| LongParameterList | 24 | 1 | 4% |
| LowDocCoverage | 22 | 0 | 0% |
| MagicNumber | 21 | 0 | 0% |
| DeepNesting | 17 | 1 | 6% |
| GodClass | 14 | 0 | 0% |
| LargeMethod | 14 | 0 | 0% |
| BumpyRoad | 8 | 3 | 38% |
| ComplexityMassConcentration | 8 | 1 | 13% |
| FeatureEnvy | 3 | 1 | 33% |

The static loop resolves almost none of the highest-frequency smells (DuplicateCode, LowDocCoverage,
MagicNumber, GodClass, LargeMethod all at 0%). Its modest gains come from a minority of ComplexMethod
/ BumpyRoad cases.

## BEFORE vs AFTER (two independent snapshots — NOT a controlled A/B)

| Metric | BEFORE (baseline, 30 files, py/js/ts/go) | AFTER (full, 55 files, 12 langs) | AFTER restricted to py/js/ts/go (25 files) |
|---|---|---|---|
| Reached ≥9.5 | 1 / 30 (3.3%) | 1 / 55 (2%) | 0 / 25 (0%) |
| Reached ≥9.0 | 1 / 30 | 1 / 55 | 0 / 25 |
| Mean score delta | +0.15 | +0.24 | +0.28 |
| Median score delta | 0.00 | 0.00 | 0.00 |
| Mean iterations | 0.33 | 0.18 | — |
| Improved / Unchanged / Degraded | 4 / 25 / 1 | 9 / 46 / 0 | 5 / 20 / 0 |

Restricting the AFTER run to the four baseline languages (the closest available approximation to a
like-for-like comparison) gives **0/25 reaching ≥9.5** — i.e. on the language subset the baseline
covered, the current loop reaches target *less* often, not more. The headline numbers are essentially
**flat**: both snapshots sit at ~2–3% target convergence with a median delta of exactly 0. There is
**no evidence here of a recalibration that improved loop effectiveness**; the differences are within
the noise of two different file populations.

## Verdict (no spin)

**No — the static, rule-based self-correcting loop does not demonstrably improve mid-complexity real
code.** On 55 real files scoring 5–8:

- It reaches the AI-ready target (≥9.5) on **1 file (2%)** and the healthy floor (≥9.0) on the **same
  1 file**.
- It leaves **84% of files completely untouched** (0 iterations, median delta 0).
- The mean delta of +0.24 is carried by a handful of small files; the median file gains **nothing**.
- It fails to resolve the most common smells (DuplicateCode, LowDocCoverage, MagicNumber, GodClass,
  LargeMethod) at all.

The one genuine positive: it is **safe** — 0 regressions and the comment-count invariant held on
every file. But "does no harm" is not "demonstrably improves."

**Two honesty flags that the planned methodology did not deliver:**

1. **The recalibration comparison was not run as designed.** The requested `results-static` /
   `results-dynamic` splits and a held-out recalibration A/B do not exist. What exists is two
   independent snapshots on different file sets, which show flat results and cannot attribute any
   change to recalibration. Claiming a before/after recalibration win from this data would be
   unsupported.
2. **Behaviour preservation was not validated.** No `behavior-check.json` / test-execution harness
   exists. Only a comment-count formatting invariant was checked. The loop's behaviour-equivalence is
   therefore **unverified**, not "preserved."

This benchmark exercises the deterministic loop with no LLM. If the intended product loop puts an LLM
in the refactoring step, these numbers are a **floor**, not a measure of that product — and that LLM
loop has not been benchmarked here.
