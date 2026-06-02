# Behavior-Equivalence Gate — Corpus Measurement

Generated: 2026-06-02T09:08:39.326Z (real engine run, no fabricated numbers)
Duration: 59365 ms
Corpus: `packages/core/tests/fixtures/behavior-equiv/` (35 pairs)
Engines: Python (`verifyPythonEquivalence`, 2000 inputs/pair) + TS/JS (`checkJsEquivalence`, 2000 inputs/pair)

## Headline metrics

| Metric | Value | Numerator / Denominator |
|---|---|---|
| **Detection rate** (recall on divergent) | **90.0%** | 18 / 20 |
| **False-positive rate** (over verified equivalents) | **0.0%** | 0 / 15 |
| False-positive rate (over all equivalents) | 0.0% | 0 / 15 |
| Unverified equivalents (advisory, not FP) | 0 | of 15 |

Confusion matrix (divergent = positive class):

| | observed divergent | observed equivalent | observed unverified |
|---|---|---|---|
| **expected divergent** | 18 (TP) | 2 (FN) | 0 (FN/unv) |
| **expected equivalent** | 0 (FP) | 15 (TN) | 0 (advisory) |

## Per-language breakdown

| Language | TP | FN | TN | FP | Unverified |
|---|---|---|---|---|---|
| python | 9 | 1 | 7 | 0 | 0 |
| typescript | 9 | 1 | 8 | 0 | 0 |

## Per-pair results

| Outcome | ID | Lang | Bug class | Expected | Observed | Inputs | Detail |
|---|---|---|---|---|---|---|---|
| TP | py-01-clamp-boundary | python | boundary-condition | divergent | divergent | 2 | behaviour differs on synthesised input #2 |
| TP | py-02-range-offbyone | python | off-by-one | divergent | divergent | 3 | behaviour differs on synthesised input #3 |
| TP | py-03-mutable-default | python | mutable-default-arg | divergent | divergent | 1 | behaviour differs on synthesised input #1 |
| TP | py-04-integer-truncation | python | integer-truncation | divergent | divergent | 2 | behaviour differs on synthesised input #2 |
| TP | py-05-truthy-coercion | python | falsy-coercion | divergent | divergent | 2 | behaviour differs on synthesised input #2 |
| FN | py-06-slice-offbyone | python | off-by-one | divergent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TP | py-07-dict-default | python | dropped-edge-case | divergent | divergent | 1 | behaviour differs on synthesised input #1 |
| TP | py-08-comparator-sign | python | comparator-sign-swap | divergent | divergent | 6 | behaviour differs on synthesised input #6 |
| TP | py-09-dropped-return | python | dropped-return-value | divergent | divergent | 3 | behaviour differs on synthesised input #3 |
| TP | py-10-reordered-sideeffect | python | reordered-side-effects | divergent | divergent | 2 | behaviour differs on synthesised input #2 |
| TP | ts-01-boundary-condition | typescript | boundary-condition | divergent | divergent | 38 | Observable behaviour diverged on input #38: before=true after=false. The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-02-sum-offbyone | typescript | off-by-one | divergent | divergent | 3 | Observable behaviour diverged on input #3: before=11 after=13. The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-03-dropped-default | typescript | dropped-default-arg | divergent | divergent | 1 | Observable behaviour diverged on input #1: before="hi world" after="hi undefined". The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-04-integer-truncation | typescript | integer-truncation | divergent | divergent | 2 | Observable behaviour diverged on input #2: before=3.5 after=3. The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-05-nullish-vs-or | typescript | falsy-coercion | divergent | divergent | 1 | Observable behaviour diverged on input #1: before="__NaN__" after="  pad  ". The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-06-sort-comparator | typescript | comparator-sign-swap | divergent | divergent | 3 | Observable behaviour diverged on input #3: before=[10,5] after=[-7,-2]. The refactoring is NOT behaviour-preserving for this input. |
| TP | ts-07-empty-guard | typescript | dropped-edge-case | divergent | divergent | 1 | Observable behaviour diverged on input #1: before=100 after="__undef__". The refactoring is NOT behaviour-preserving for this input. |
| FN | ts-08-async-await-drop | typescript | async-semantics | divergent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TP | ts-09-mutation-vs-copy | typescript | mutation-vs-immutable | divergent | divergent | 1 | Observable behaviour diverged on input #1: identical return value but the arguments were mutated differently (before post-args=[],100 after post-args=[100],100) — an immutable operation became an in-p |
| TP | ts-10-exception-swallow | typescript | exception-handling | divergent | divergent | 1 | Observable behaviour diverged on input #1: before=throw Error after=0. The refactoring is NOT behaviour-preserving for this input. |
| TN | py-eq-01-recursive-to-iterative | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-02-comprehension | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-03-guard-clause | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-04-extract-method | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-05-early-return | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-06-rename-variable | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | py-eq-07-use-builtin | python | none | equivalent | equivalent | 2000 | no divergence found across 2000 synthesised inputs |
| TN | ts-eq-01-recursive-to-iterative | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-02-extract-method | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-03-switch-to-map | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-04-for-to-foreach | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-05-optional-chain | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-06-early-return | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-07-rename-internal | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |
| TN | ts-eq-08-clamp-boundary | typescript | none | equivalent | equivalent | 2000 | No divergence found across 2000 synthesized inputs (seed=1337). This is differential evidence of equivalence, not a proof. |

## Honesty notes

- Outcome legend: TP = divergent pair correctly flagged; FN = divergent pair missed (includes `unverified`); TN = equivalent pair correctly passed; FP = equivalent pair wrongly flagged; UNV = equivalent pair the engine could not dynamically evaluate (advisory, counted neither as TN nor FP).
- A `divergent` pair reported `unverified` is counted as a MISS (conservative).
- Dynamic verification covers **Python and TS/JS only**. For the other ~44 supported languages the gate returns an honest `unverified` advisory; it does NOT claim "all 46 languages proven safe".
- "equivalent" means "no divergence found within the 2000-input budget" — differential evidence, not a formal proof.
