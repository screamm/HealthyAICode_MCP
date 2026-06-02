<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Healthy AI Code contributors.
-->

# OCHS v0.1 — Cross-Implementation Reproducibility Results

**Date:** 2026-06-02
**Spec under test:** `docs/ochs/OCHS-v0.1.md` (hardened: §2.1–§2.4 publish exact thresholds; §2.2 resolves the `ComplexMethod` rule; §2.3 publishes the `DuplicateCode` algorithm)
**Implementations compared:**

| Role | Artifact | How it is used here |
|------|----------|---------------------|
| Reference engine | `@healthy-ai-code/core` (TypeScript, tree-sitter) | Invoked as a **black box** by `ochs-ref-py/core_reference.mjs` (`analyzeCode(code, 'python', file)`). |
| Clean-room second impl | `ochs-ref-py/ochs_ref.py` (Python, stdlib `ast` only) | Written **from the published spec only**; imports/ports no engine code. Score computed independently, compared afterwards. |

This document records the second-implementation verification that backs the
reproducibility claim in OCHS-v0.1.md §A.6.

---

## 1. Measurement scope (honest)

Agreement is measured over the **structural subset** — the **25** biomarkers
§2.4 declares "reproducible from this spec alone": the per-function complexity
smells (`ComplexMethod`, `DeepNesting`, `LargeMethod`, `LongParameterList`,
`CognitiveComplexity`), `BrainMethod` and `ComplexityMassConcentration`
(composite indices, §2.1f), the control-flow/readability smells (`BumpyRoad`,
`ComplexConditional`, `MessageChain`, `TypeSafetyEscape`), the Tier-A design
smells (`GodClass`, `FeatureEnvy`, `DataClumps`, `PrimitiveObsession`), the
file-level smells (`LargeFile`, `LowMaintainability`, `LowDocCoverage`,
`MagicNumber`), `SATD`, `DuplicateCode` (§2.3), and the index analyzers
(`DocumentationDebt`, `IntentClarity`, §2.1g).

The **30** biomarkers Appendix D honestly annexes as **not** reproducible from
the prose alone are **excluded** from the structural-agreement metric and
reported separately:

- **D.1 — registry-data-dependent (3):** `HallucinatedPackageImport`, `SlopsquattingRisk`, `DependencyVulnerability`.
- **D.2 — git/project-history-dependent (6):** `MethodTemporalCoupling`, `CodeChurn`, `DeveloperCongestion`, `KnowledgeLoss`, `ArchitectureDebt`, `TestProximity`.
- **D.3 — shared-curated-pattern/SDK-list-dependent (21):** the security-sink, secret, LLM-integration, async/exception anti-pattern, and advisory AI-specific biomarkers (incl. `UnsafeDeserialization`, `CryptographicMisuseRisk`, `ExceptionHandlingAntiPattern`, `SqlInjectionRisk`, `XssRisk`, `AiAttributedSATD`, …).

Omitting an annexed biomarker is **conformant** (§4 / Appendix D): the formula is
unchanged, the finding simply does not contribute to the score. Partition:
**25 structural + 30 annexed = 55** (no overlap).

**Corpus:** 15 Python fixtures (`ochs-ref-py/fixtures/`) — healthy, borderline, unhealthy.

---

## 2. Result — structural subset (the headline)

| Metric | Before §2.1–§2.4 (prior result) | After §2.1–§2.4 (this run, 2026-06-02) |
|--------|----------------------------------|-----------------------------------------|
| Exact score agreement (\|Δ\| ≤ 0.0001) | 33.3 % (5/15) | **100 % (15/15)** |
| Within-0.5 agreement | 80.0 % (12/15) | **100 % (15/15)** |
| Category agreement (green/yellow/red) | 80.0 % (12/15) | **100 % (15/15)** |
| Mean \|Δ\| | 0.5303 | **0.0000** |
| **L2 conformance** (exact on all structural fixtures) | No | **YES** |

On the structural subset the two implementations produce **byte-identical smell
vectors and identical OCHS scores on every fixture**. Publishing the exact
thresholds (and resolving `ComplexMethod` to `CC > 10`, single weight 1.5, in
§2.2) made the structural biomarkers reproducible from the spec alone — the
earlier divergence was caused by **under-specified thresholds**, not by intrinsic
non-reproducibility.

### Per-fixture structural scores

| Fixture | Python | core | Δ | match |
|---------|--------|------|---|-------|
| 01_healthy_simple.py | 10.0000 | 10.0000 | 0.0000 | EXACT |
| 02_healthy_simple_math.py | 9.5000 | 9.5000 | 0.0000 | EXACT |
| 03_healthy_string_utils.py | 9.5000 | 9.5000 | 0.0000 | EXACT |
| 04_healthy_validators.py | 9.5000 | 9.5000 | 0.0000 | EXACT |
| 05_borderline_complex_validator.py | 5.9000 | 5.9000 | 0.0000 | EXACT |
| 06_borderline_nested_config.py | 10.0000 | 10.0000 | 0.0000 | EXACT |
| 07_borderline_data_processor.py | 9.6000 | 9.6000 | 0.0000 | EXACT |
| 08_unhealthy_complex.py | 5.8000 | 5.8000 | 0.0000 | EXACT |
| 09_unhealthy_complex_nested.py | 4.2000 | 4.2000 | 0.0000 | EXACT |
| 10_unhealthy_deep_nesting.py | 4.9000 | 4.9000 | 0.0000 | EXACT |
| 11_unhealthy_insecure_deser.py | 10.0000 | 10.0000 | 0.0000 | EXACT |
| 12_unhealthy_crypto_misuse.py | 9.6000 | 9.6000 | 0.0000 | EXACT |
| 13_unhealthy_exception_ap.py | 9.7000 | 9.7000 | 0.0000 | EXACT |
| 14_unhealthy_hallucinated.py | 10.0000 | 10.0000 | 0.0000 | EXACT |
| 15_real_requests_internal_utils.py | 9.6000 | 9.6000 | 0.0000 | EXACT |

---

## 3. Full-score table (all 55 biomarkers) — for completeness, not the headline

| Fixture | Python | core | Δ | match | annexed-driven? |
|---------|--------|------|---|-------|------------------|
| 01–10, 14, 15 (12 files) | = | = | 0.0000 | EXACT | — |
| 11_unhealthy_insecure_deser.py | 10.0000 | 8.3000 | 1.7000 | DIVERGENT | yes — `UnsafeDeserialization` ×2 (D.3) |
| 12_unhealthy_crypto_misuse.py | 9.6000 | 7.6000 | 2.0000 | DIVERGENT | yes — `CryptographicMisuseRisk` ×4 (D.3) |
| 13_unhealthy_exception_ap.py | 9.7000 | 8.6000 | 1.1000 | DIVERGENT | yes — `ExceptionHandlingAntiPattern` ×2 (D.3) |

Full-score: 12/15 exact, 12/15 within-0.5, 12/15 category. **Every** full-score
divergence is driven **solely by an annexed D.3 biomarker** — the clean-room impl
fires zero of these (no access to the engine's curated sink/anti-pattern
inventory) and **zero structural false positives or misses**. This is the
expected, honest result and the documented scope boundary of Appendix D.

---

## 4. What this does and does not show

- **Does show:** the OCHS **formula (§1)**, the **rounding rule (§2.4)**, the
  **weights (Table 2)**, and the **structural firing thresholds (§2.1–§2.4)** are
  sufficient for an independent third party to reproduce the reference engine's
  score exactly on the structural subset. The Python implementation reaches **L2
  conformance**.
- **Does not show:** byte-identical agreement on the D.1/D.2/D.3 biomarkers. Those
  require, respectively, a shared registry snapshot, repository history, or a
  shared curated pattern/SDK inventory — which the prose spec does not (and per
  Appendix D, cannot) embed. The reproducibility claim is scoped to the structural
  subset accordingly.

---

## 5. Reproduce

```bash
# 1. (re)generate the reference-engine output (requires packages/core built)
node ochs-ref-py/core_reference.mjs > ochs-ref-py/core_reference.json

# 2. run the Python clean-room impl + agreement report
cd ochs-ref-py && python cross_check.py
```

The `cross_check.py` report prints the structural-subset table (headline), the
full-score table, per-file smell-vector diffs (annexed diffs tagged `[ANNEXED]`),
and the 25/30 biomarker partition with the full annexed list.
