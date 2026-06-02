# ochs-ref-py — clean-room second OCHS implementation (Python)

A **clean-room** second implementation of the Open Code Health Score (OCHS) v0.1,
written in Python, used to test whether OCHS is genuinely *third-party
implementable from the published specification alone*.

It is a deliberately independent top-level directory (NOT under `packages/`) so it
shares no build, dependency, or import path with the JavaScript monorepo.

## Provenance / honesty statement

`ochs_ref.py` was written from the **published spec only**:

- `docs/ochs/OCHS-v0.1.md` — formula, thresholds, biomarker catalogue, detection-trigger prose, weights (Table 2)
- `docs/ochs/ochs-schema.json` — output object shape and the 55-member smell-type enum

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

## Scope

Python source files only. Python is a Tier-A language in OCHS, and `ast` gives a
third party the same AST-level access the spec assumes. Biomarkers that require
inputs the spec does **not** distribute (git history, a project import graph, an
offline npm/PyPI registry snapshot, a hallucination corpus) are documented as
not-implementable-from-spec rather than guessed — see the bottom of the
`cross_check.py` report.

## Headline finding

The OCHS **formula and the underlying metrics are reproducible** (cyclomatic and
cognitive complexity matched the reference engine *exactly* on the fixtures
tested). What is **not** reproducible from the spec alone is **biomarker firing**:
the spec publishes prose ("typically 4", "exceeds the threshold") instead of exact
numeric predicates, and in at least one case (`ComplexMethod`) the reference
engine's behaviour contradicts the spec's own published weight tiers. See the
`SPEC GAPS` section of the cross-check output.
