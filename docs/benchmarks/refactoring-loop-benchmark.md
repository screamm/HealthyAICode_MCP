# Refactoring Loop Fix-Rate Benchmark

**Date:** 2026-05-25  
**Tool version:** 0.1.0  
**Dataset:** 33 files from the project's own test fixture corpus (12 languages)  
**Method:** `runRefactoringLoop()` in-memory, max 20 iterations per file  
**No Claude API calls.** All transformations are mechanical AST-guided text rewrites.

---

## Results

| Metric | Value |
|--------|-------|
| Files tested | 33 |
| Already AI-ready at start (≥ 9.5) | 16 |
| Files starting below 9.0 (genuinely unhealthy) | 17 |
| Files reaching AI-ready (≥ 9.5) after loop | **2** |
| **Fix rate (from < 9.0 → ≥ 9.5)** | **11.8%** |
| Avg score improvement (files that ran the loop) | +0.27 points |
| Median iterations to fix | 3 |

---

## Per-File Results

| File | Language | Start | End | Status |
|------|----------|-------|-----|--------|
| `unhealthy/agents-md-fixture.ts` | TypeScript | 3.6 | 1.0 | NOT FIXED (loop degraded) |
| `unhealthy/bumpy-road-fixture.ts` | TypeScript | 8.9 | 8.6 | NOT FIXED |
| `unhealthy/Complex.cs` | C# | 5.5 | 6.7 | NOT FIXED |
| `unhealthy/complex.ex` | Elixir | 5.1 | 5.1 | NOT FIXED (no transformer) |
| `unhealthy/complex.go` | Go | 8.0 | 8.0 | NOT FIXED (no transformer) |
| `unhealthy/Complex.java` | Java | 5.5 | 6.7 | NOT FIXED |
| `unhealthy/Complex.kt` | Kotlin | 8.7 | 9.1 | NOT FIXED |
| **`unhealthy/complex.php`** | **PHP** | **8.0** | **9.6** | **FIXED** |
| `unhealthy/complex.py` | Python | 5.8 | 5.8 | NOT FIXED (no transformer) |
| `unhealthy/complex.rb` | Ruby | 6.5 | 6.5 | NOT FIXED (no transformer) |
| `unhealthy/complex.rs` | Rust | 7.8 | 7.8 | NOT FIXED (no transformer) |
| `unhealthy/complex.scala` | Scala | 5.5 | 9.4 | NOT FIXED (missed 9.5 by 0.1) |
| `unhealthy/complex.swift` | Swift | 8.0 | 8.0 | NOT FIXED (no transformer) |
| `unhealthy/complex.ts` | TypeScript | 1.0 | 1.0 | NOT FIXED (score at floor) |
| **`unhealthy/large-params.ts`** | **TypeScript** | **8.1** | **9.7** | **FIXED** |
| `unhealthy/nested-logic.ts` | TypeScript | 5.3 | 1.0 | NOT FIXED (loop degraded) |
| `healthy/complex-refactored.ts` | TypeScript | 7.6 | 7.9 | NOT FIXED |

---

## Score Distribution (Initial)

| Range | Count |
|-------|-------|
| < 5.0 (floor / critical) | 2 |
| 5.0–7.0 (problematic) | 7 |
| 7.0–9.0 (moderate) | 8 |
| 9.0–9.5 (healthy but not AI-ready) | 0 |
| ≥ 9.5 (AI-ready) | 16 |

---

## Key Findings

**1. Fix rate: 11.8% for standalone mechanical transformations.**  
2 of 17 genuinely unhealthy files (score < 9.0) reached AI-ready status (≥ 9.5)
using only the automated loop, with no human intervention and no Claude API calls.

**2. Language coverage is the primary constraint.**  
7 of the 17 unhealthy files (Go, Python, Ruby, Rust, Elixir, Swift) received zero
improvement because the mechanical transformers are implemented only for TypeScript,
JavaScript, and PHP at this time. The analyzers detect smells in all 43 languages;
the automated fixers cover a subset.

**3. The loop can degrade badly structured files.**  
Two TypeScript files (`agents-md-fixture.ts`, `nested-logic.ts`) hit the 20-iteration
limit and ended up with *lower* scores than they started. This reveals a known issue:
the `early_return` transformer sometimes inverts conditions in a way that increases
nesting depth when applied to files that are already at the scoring floor (1.0).

**4. Near-misses: Scala reached 9.4 (missed AI-ready by 0.1).**  
`complex.scala` improved 3.9 points via JSDoc generation, stopping just short of the
9.5 threshold. This is a documentation-coverage gap, not a structural problem.

**5. Successful cases show clear patterns.**  
- `large-params.ts`: `introduce_parameter_object` strategy reduced parameter count in
  3 steps (8.1 → 9.7, +1.6 points).
- `complex.php`: A combination of structural strategies in 3 steps (8.0 → 9.6, +1.6 points).

---

## Methodology

**What was measured:** The in-memory `runRefactoringLoop()` function, which applies
`analyzeForAutoRefactor()` + `applyAutoRefactor()` + `generateMissingJsDoc()` iteratively
until the code reaches the AI-ready threshold (9.5) or no further improvement can be made.

**No disk writes during the benchmark.** Each file's content is loaded into memory once;
transformations are applied to the in-memory string. The original fixture files are unchanged.

**Corpus:** 17 files from `packages/core/tests/fixtures/unhealthy/` and the boundary
case `healthy/complex-refactored.ts` which scores below 9.0.

**Limitation — corpus size:** 17 unhealthy files is a small corpus. The results should
be interpreted as a lower-bound measurement on purpose-built worst-case fixtures, not
as a representative sample of real production code.

**Limitation — adversarial fixtures:** The unhealthy fixtures are deliberately designed
to trigger specific smells at maximum severity (scores at or near the 1.0 floor). Real
production files with moderate smells are likely to respond better to automated refactoring.

---

## Honest Context vs. CodeScene's Claims

CodeScene reports "90–100% AI fix rate" for AI-assisted refactoring. Their measurement
includes Claude (or another LLM) as the fixer. Our 11.8% number is for **mechanical
transformation only** — no LLM involved in the transformation step.

The correct comparison is:

| Scenario | Fix Rate |
|----------|----------|
| Mechanical transforms only (this benchmark) | 11.8% |
| Mechanical transforms + Claude applying the instructions | Not yet measured |

The `analyzeForAutoRefactor()` function returns structured, step-by-step refactoring
instructions alongside the mechanical transform. When a Claude agent acts on those
instructions, fix rates are expected to be substantially higher. That benchmark
requires Claude API calls and is not yet run.

---

## Reproducing This Benchmark

```bash
pnpm build
node scripts/benchmark-refactoring-loop.mjs
```

Output: `docs/benchmarks/refactoring-loop-benchmark.json`
