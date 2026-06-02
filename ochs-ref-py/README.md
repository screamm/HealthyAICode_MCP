# ochs-ref-py — clean-room second OCHS implementation (Python)

A **clean-room** second implementation of the Open Code Health Score (OCHS) v0.1,
written in Python, used to test whether OCHS is genuinely *third-party
implementable from the published specification alone*.

It is a deliberately independent top-level directory (NOT under `packages/`) so it
shares no build, dependency, or import path with the JavaScript monorepo.

## Provenance / honesty statement

`ochs_ref.py` was written from the **published spec only**:

- `docs/ochs/OCHS-v0.1.md` — the formula (§1), the **normative firing thresholds (§2.1–§2.4)**, the biomarker catalogue, detection-trigger prose, the weights (Table 2), and the honest reproducibility annex (Appendix D)
- `docs/ochs/ochs-schema.json` — output object shape and the 55-member smell-type enum

> **Revision note.** The first version of this implementation was written against
> an earlier draft that under-specified ~20 structural thresholds and contained a
> `ComplexMethod` weight-tier contradiction. The spec has since been hardened
> (§2.1–§2.4 publish the exact predicates; §2.2 resolves `ComplexMethod` to
> `CC > 10`, single weight 1.5; §2.3 publishes the full `DuplicateCode`
> algorithm). This implementation was updated to the published thresholds and
> re-measured. See "Headline finding" below.

It does **not** import, read, port, or transcribe any code from
`@healthy-ai-code/core`. Biomarker detection is implemented independently using
Python's own `ast` module plus text/regex heuristics for the structural and
security biomarkers the spec describes in prose. The published weight table and
the published score formula are copied verbatim — that is exactly what a
conformant implementer is supposed to do.

`core_reference.mjs` is the **only** file here that touches the reference engine,
and it does so purely as a black box (`analyzeCode(code, language, filePath)` →
score + smell vector). Its output, `core_reference.json`, is read by the
cross-check **after** the Python score is computed independently.

## Reproduce the cross-check

```bash
# 1. (re)generate the reference-engine output (requires packages/core built)
node ochs-ref-py/core_reference.mjs > ochs-ref-py/core_reference.json

# 2. run the Python clean-room impl + agreement report
cd ochs-ref-py && python cross_check.py
```

`python ochs_ref.py <file.py>` prints a single file's OCHS object (incl. the
`specGaps` ledger) as JSON.

## Scope & measurement

Python source files only. Python is a Tier-A language in OCHS, and `ast` gives a
third party the same AST-level access the spec assumes.

Agreement is measured over the **structural subset** — the 25 biomarkers §2.4
declares "reproducible from this spec alone." The 30 biomarkers Appendix D
honestly annexes as *not* reproducible from the prose — because they require a
registry snapshot (D.1), git/project history (D.2), or a shared curated
pattern/SDK inventory (D.3) — are **excluded** from the structural-agreement
metric and reported separately. Omitting an annexed biomarker is conformant
(§4 / Appendix D); the formula is unchanged. See the bottom of the
`cross_check.py` report for the full annexed list and the 30/25 partition.

## Headline finding

After the spec was hardened to publish exact thresholds (§2.1–§2.4), the
structural biomarkers **converged to full agreement**. On 15 Python fixtures,
structural-subset agreement rose from **33.3 % → 100 % exact**, **80 % → 100 %
within-0.5**, and **80 % → 100 % category** — the two independent
implementations now produce byte-identical smell vectors and identical OCHS
scores on every fixture. The clean-room implementation reaches **L2 conformance**
(exact on all structural fixtures).

| Metric (structural subset, n=15) | Before §2.1–§2.4 | After §2.1–§2.4 |
|----------------------------------|------------------|------------------|
| Exact score agreement            | 33.3 % (5/15)    | **100 % (15/15)** |
| Within-0.5 agreement             | 80.0 % (12/15)   | **100 % (15/15)** |
| Category agreement               | 80.0 % (12/15)   | **100 % (15/15)** |
| Mean \|Δ\|                       | 0.5303           | **0.0000**        |

This confirms the earlier divergence was caused by **under-specified
thresholds**, not by intrinsic non-reproducibility. The full-score table (all 55
biomarkers) still diverges on 3/15 fixtures — but every one of those is driven
**solely by an annexed D.3 biomarker** (`UnsafeDeserialization`,
`CryptographicMisuseRisk`, `ExceptionHandlingAntiPattern`), which the clean-room
impl cannot reproduce without the reference engine's curated sink/anti-pattern
inventory. That is the expected, honest scope boundary documented in Appendix D.

The earlier `SPEC GAPS` ledger (prose thresholds the implementer had to guess) is
now **empty for structural biomarkers** — every numeric predicate is resolved
from §2.1–§2.4.
