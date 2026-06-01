# Behavior-Equivalence Feasibility Spike (Sats 2)

**Question:** Can we cheaply detect *functionally non-equivalent* LLM refactorings
by synthesizing characterization tests from the `before` version and
differential-executing `before` vs `after`, for TS/JS + Python — neutralizing
nondeterminism (time / IO / randomness)?

**Motivation:** arXiv [2602.15761](https://arxiv.org/abs/2602.15761) ("A Differential
Fuzzing-Based Evaluation of Functional Equivalence in LLM-Generated Code Refactorings",
submitted 17 Feb 2026) reports LLMs produce **19–35 % functionally non-equivalent
refactorings**, and **~21 % of those breaks are missed by the datasets' existing
test suites**. Their method: Atheris coverage-guided fuzzing, 1000 inputs/program and
2000 inputs/function, comparing outputs across all inputs (`Eq@DFuzz`). The paper gives
aggregate rates but **no concrete bug examples** (it explicitly defers qualitative
analysis to future work), so this spike constructs its own labelled corpus of common
LLM-refactoring break classes.

## How it works

```
node scripts/spikes/behavior-equiv/run.mjs
```

- `corpus/index.json` — labelled pairs (`equivalent: true|false`, bug class).
- `corpus/ts/pairs.mjs`, `corpus/py/pairs.py` — `before`/`after` function pairs +
  an `argSpec` declaring each argument's *shape* (the only thing inferred from `before`).
- `sandbox/diff_run_ts.mjs`, `sandbox/diff_run_py.py` — differential-execution sandboxes:
  - synthesize 2000 inputs/pair from `argSpec` with a **seeded** PRNG (mulberry32 / `random.Random(1337)`),
  - **freeze nondeterminism**: `Date.now`/`Math.random` (TS) and `time.time`/`random` (Py)
    are pinned identically for both sides, so a divergence is a real semantic difference,
  - **observe** = return value OR thrown exception name (a thrown error vs a value is a divergence),
  - deep-copy args per call so mutable-default / aliasing bugs surface and the two sides never share state.
- `run.mjs` joins verdicts to the labels and prints detection rate + false-positive rate
  and a GO / NO-GO verdict.

The harness never sees the injected bug or expected outputs — only the `before`
signature shape — mirroring "synthesize characterization tests from `before`".

## Result (2026-06-01, node v24.14, python 3.10.11)

| metric | value | target |
|---|---|---|
| Detection rate (breaks caught) | **100 % (14/14)** | ≥ 80 % |
| False-positive rate (clean pairs flagged) | **0 % (0/7)** | ≤ 10 % |
| Unverified | 0 | — |
| Determinism | identical across 2 runs | — |

Bug classes caught: off-by-one (loop & slice), boundary-condition (inclusive/exclusive),
dropped default arg, integer truncation, falsy/None coercion (`||`/`or` vs `??`/`is None`),
comparator sign swap, dropped empty-collection guard, mutable-default accumulation,
dropped dict default (KeyError). Equivalent refactorings correctly passed: recursive→iterative,
extract-method, switch→map, loop→comprehension, try/except→guard.

## VERDICT: **GO** — for TS/JS + Python only.

The differential-execution mechanism works and catches breaks that an absent/weak test
suite would miss. Build `code_health_verify_refactor` for TS/JS + Python.

## Honest limitations (do NOT overclaim)

1. **100 % is on a hand-built corpus.** I authored both the bugs and the input-synthesis
   strategy, so this measures *mechanism feasibility*, not field accuracy. The arXiv paper's
   real-world non-equivalence is detected by fuzzing too, but field detection rate on
   unseen LLM output is unmeasured here and will be lower.
2. **Boundary bugs need boundary-aware synthesis.** The first run *missed* a boundary case
   because uniform random ints rarely hit the exact edge; it was caught only after adding a
   small-domain `boundaryInt` generator. Pure random fuzzing under-samples edges — production
   must add edge-value biasing (min/max/0/±1, empty/singleton collections) and ideally
   coverage-guided fuzzing (Atheris, as in the paper) rather than the uniform PRNG used here.
3. **One pair was mislabelled and the harness was right.** `> ` vs `>=` at an upper clamp
   bound is provably equivalent; the spike correctly reported no divergence. Relabelled to a
   true negative. This is evidence the harness is not trivially flagging everything.
4. **Scope is pure, self-contained functions.** Real refactorings span files, depend on
   external state, classes, async, and side effects. Argument-shape synthesis does not cover
   objects/closures/network/DB. A production tool needs type-driven input synthesis (from TS
   types / Python annotations) and IO/effect sandboxing far beyond the frozen-clock stub here.
5. **Other ~44 languages stay "static-equivalence only (advisory)."** This spike proves
   nothing outside TS/JS + Python. Per the plan, never claim "all 46 languages proven safe."
6. **Float / nondeterministic numeric output** is compared by strict JSON equality here; a
   production tool needs tolerance-based comparison for floats and canonicalization of
   set/dict ordering.
