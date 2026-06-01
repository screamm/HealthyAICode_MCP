# Lager-B Benchmark Protocol

**Version:** 0.1
**Date:** 2026-06-01
**Status:** Pilot complete — scaling to n≥500 in progress

This document specifies the reproducible data pipeline for Sats 5 (plan document §3):
the open, reproducible Lager-B loop benchmark and the gate-on-vs-gate-off RCT.

---

## 1. Purpose and claims under test

Two distinct experiments share this harness:

| Experiment | Claim under test | Success criterion |
|---|---|---|
| **Lager B** | LLM-driven loop reaches ≥9.5 on >60% of medium-complexity files with ≥95% test pass rate | n≥500; per-decile %≥9.5 + test-pass published |
| **Gate-on-vs-gate-off RCT** | Enforced delta-gating measurably reduces unhealthy AI edits vs advisory/absent gate | statistically significant reduction in reverted edits, new smells, and files left <9.4 |

Both experiments operate on the **same corpus** and share the same JSONL tuple format so downstream analysis can join on `(fileIdx, language)`.

---

## 2. Tuple format (per-iteration JSONL)

Each line in `benchmark-data/lager-b/tuples.jsonl` is one JSON object:

```json
{
  "runId":    "lager-b-2026-06-01T12:00:00Z",
  "fileIdx":  0,
  "filePath": "field-repos/cli-go/context/context.go",
  "language": "go",
  "iteration": 0,
  "scoreBefore": 6.2,
  "scoreAfter":  7.1,
  "scoreDelta":  0.9,
  "biomarkerVectorBefore": { "ComplexMethod": 2, "DeepNesting": 1 },
  "biomarkerVectorAfter":  { "ComplexMethod": 1, "DeepNesting": 1 },
  "smellTargeted":   "ComplexMethod",
  "strategy":        "extract_method",
  "targetFunction":  "processOrders",
  "diff":            "--- a/...\n+++ b/...",
  "brokeTests":      null,
  "changes":         ["Extracted lines 45–62 into helper calculateTax()"]
}
```

**Sentinel record** (`iteration === -1`): one record per file summarising the full run.
Additional fields on the sentinel:
- `iterationCount`: total steps taken
- `reachedTarget`: boolean, `scoreAfter >= 9.5`
- `reached9_0`: boolean, `scoreAfter >= 9.0`
- `error`: string if the file errored, else absent

**`brokeTests` field**: `null` = not tested; `true` = at least one test regressed; `false` = all tests pass. Populated only when a test-runner is invoked (see §5 Correctness gate).

---

## 3. Corpus selection

### Pilot (current, n=10–42)
Source: `packages/core/tests/fixtures/unhealthy/`
Selection: all files with `analyzeCode().score < 9.5`
Purpose: fast feedback loop; no external download needed.

### Full-scale n≥500

Preferred corpus: **field-repos** (already present in `benchmark-data/loop-bench/midfiles.json`).
The 55-file midfiles manifest is the mechanical baseline; extend to ≥500 by running
`scripts/benchmarks/loop/scan-midfiles.mjs` against additional field repos.

**Sampling strategy** (to avoid decile skew):
1. Stratify by initial score decile: target 50 files per decile bracket [0–1, 1–2, ..., 9–9.5).
2. Stratify by language: target at least 10% coverage for each of the top 6 languages
   (TypeScript, Python, Java, Go, C#, Kotlin).
3. Include only files with at least one actionable smell (score < 9.5 AND `analyzeForAutoRefactor()` returns non-null).

**External repos to add** (for n=500 target):
- TypeScript: `microsoft/TypeScript` (already in field-repos), `angular/angular`
- Python: `pallets/flask`, `django/django` (subset, score < 9.5 only)
- Java: Defects4J chart/lang subset (already in `benchmark-data/defects4j/`)
- Go: `kubernetes/kubernetes` (src/k8s.io/apiserver/...)
- C#: `dotnet/runtime` (src/libraries subset)

Run `scripts/benchmarks/loop/scan-midfiles.mjs --dir field-repos/new-repo --out benchmark-data/loop-bench/midfiles-v2.json` after adding new repos.

---

## 4. LLM loop arm (Lager B)

The current `emit-tuples.mjs` runs the **mechanical loop** only.
Adding the LLM arm:

```
scripts/benchmarks/lager-b/
  emit-tuples.mjs         ← mechanical loop (current)
  emit-tuples-llm.mjs     ← LLM loop (TODO: Sprint 90-day plan)
```

**LLM loop harness design:**

```js
// For each file in corpus:
// 1. analyzeForAutoRefactor() → structured instructions
// 2. callLLM(instructions, code) → refactoredCode
// 3. analyzeCode(refactoredCode) → scoreAfter
// 4. if (hasTestSuite) runTests(refactoredCode) → brokeTests
// 5. emit tuple with all 4 fields populated
// Repeat until score >= 9.5 OR iterationBudget exhausted
```

Required additions to each tuple when using LLM arm:
- `llmModel`: e.g. `"claude-opus-4-7"` or `"claude-sonnet-4-6"`
- `llmTokensIn` / `llmTokensOut`: token counts from the API response
- `llmLatencyMs`: wall-clock time for the LLM call
- `brokeTests`: populated (not null) when a test suite exists for the file

**Cost estimate for n=500:**
- Avg ~3 iterations per file (based on pilot data)
- ~8 000 input + ~2 000 output tokens per iteration (estimated)
- Total: 500 × 3 × 10 000 = 15M tokens
- At $15/MTok input (Opus 4.7): ~$225 for the full benchmark
- Use `--max-files 50` for a $22 pre-validation run before committing to full scale.

---

## 5. Correctness gate (brokeTests field)

The `brokeTests` field requires a test runner.

### Files with existing test suites (Defects4J corpus):
```bash
# Run Defects4J tests on the refactored file
cd benchmark-data/defects4j/chart-1
mvn test -pl src/test 2>&1 | grep -E "FAIL|ERROR|BUILD" > /tmp/test-out.txt
echo $? → 0 = pass, 1 = fail
```

### Files without test suites (field-repos):
Mark `brokeTests: null` (not verified).
For the published benchmark, report separately:
- `filesWithTestSuite`: n (subset with test runners)
- `testPassRate`: among files-with-suites only

### Automated test runner integration:
Set `LAGER_B_TEST_RUNNER=mvn|pytest|jest` to enable automatic test execution.
The harness will run `{runner} test` in the file's project root after each iteration.
This adds ~30s per file (dominated by test startup cost).

---

## 6. Gate-on vs gate-off RCT design

### Study design
**Type:** within-subject (paired), randomised over corpus order
**Unit of randomisation:** file (each file sees both conditions)
**Allocation:** mechanical — same file, same iteration budget, different guard rule

### Arms
| Arm | Implementation | Guard |
|---|---|---|
| Gate-on | `runRefactoringLoop` (current) | `scoreDelta >= CONVERGENCE_NOISE_FLOOR (0.1)` required |
| Gate-off | `runRefactoringLoopNoGate` (TODO) | No noise-floor check — accept all steps |

### Gate-off implementation (required for full RCT):
Create `packages/core/src/refactor/refactoring-loop-no-gate.ts` (new file — does not edit shared files):

```typescript
// Copy of refactoring-loop.ts with this change in applyRefactorStep:
// Remove: if (afterHealth.score - scoreBefore < CONVERGENCE_NOISE_FLOOR) return false;
// Add:    /* gate-off: accept all non-null transforms */
export function runRefactoringLoopNoGate(
  code: string, language: Language, filePath: string,
  aiReadyThreshold = 9.5, maxIterations = 20
): RefactoringLoopResult { ... }
```

Then in `gate-rct.mjs`:
```js
const { runRefactoringLoop, runRefactoringLoopNoGate } = core;
// Run both on same file, record both sets of outcomes
```

### Outcome measures (three primary, pre-registered)

1. **Binary**: file left below 9.4 after full loop (McNemar's test, α=0.05)
2. **Continuous**: final score delta from baseline (paired t-test)
3. **Count**: regressive edit steps (steps where scoreAfter < scoreBefore)

### Statistical analysis

Run `scripts/benchmarks/lager-b/rct-stats.mjs` on the output JSON.

**Test selection:**
- Outcome 1: McNemar's test (paired binary, continuity correction)
- Outcome 2: Paired t-test (two-tailed)
- Outcome 3: Wilcoxon signed-rank test (non-parametric, count data)

**Power analysis:**
- Target: 80% power, α=0.05, detecting a 10 percentage-point difference
- Required n: ~786 files (conservative; from `rct-stats.mjs` power analysis)
- Minimum viable pilot: 50 files (sufficient for directional signal, underpowered for confirmation)

**Reporting standard:**
Report the result whether gate-on wins OR loses. If gate-on does not statistically
outperform gate-off, publish that result and pivot (per plan §5 "Ärlig disciplin").

---

## 7. Scaling to n≥500

### Step-by-step

```bash
# 1. Add field repos (download once, gitignored)
node scripts/benchmarks/loop/scan-midfiles.mjs \
  --dir field-repos/django \
  --out benchmark-data/loop-bench/midfiles-django.json

# 2. Merge manifests
node -e "
  const a = JSON.parse(require('fs').readFileSync('benchmark-data/loop-bench/midfiles.json'));
  const b = JSON.parse(require('fs').readFileSync('benchmark-data/loop-bench/midfiles-django.json'));
  const merged = { files: [...a.files, ...b.files] };
  require('fs').writeFileSync('benchmark-data/loop-bench/midfiles-v2.json', JSON.stringify(merged, null, 2));
"

# 3. Run emit-tuples on full corpus (mechanical baseline)
node scripts/benchmarks/lager-b/emit-tuples.mjs \
  --manifest benchmark-data/loop-bench/midfiles-v2.json \
  --out benchmark-data/lager-b/tuples-n500.jsonl \
  --concurrency 8

# 4. Run LLM arm (requires ANTHROPIC_API_KEY or claude CLI session)
node scripts/benchmarks/lager-b/emit-tuples-llm.mjs \
  --manifest benchmark-data/loop-bench/midfiles-v2.json \
  --out benchmark-data/lager-b/tuples-llm-n500.jsonl \
  --model claude-opus-4-7 \
  --max-files 500

# 5. Run gate-on vs gate-off RCT (requires gate-off implementation)
node scripts/benchmarks/lager-b/gate-rct.mjs \
  --manifest benchmark-data/loop-bench/midfiles-v2.json \
  --max-files 500

# 6. Compute statistics
node scripts/benchmarks/lager-b/rct-stats.mjs \
  --in benchmark-data/lager-b/rct-results.json

# 7. Publish raw data
# Upload tuples-n500.jsonl, summary.json, rct-results.json to GitHub Releases
# Tag: lager-b-v0.1-n500
```

### Deduplication across partial runs

The JSONL file is append-safe. To deduplicate:
```js
const seen = new Set();
for (const line of lines) {
  const t = JSON.parse(line);
  const key = `${t.runId}:${t.fileIdx}:${t.iteration}`;
  if (!seen.has(key)) { seen.add(key); yield t; }
}
```

---

## 8. Intermediate code-snapshot improvement

The current pilot uses the final code as a proxy for all intermediate steps
(since `runRefactoringLoop` only returns `finalCode`, not per-step snapshots).
This means per-iteration diffs are approximate for steps 0..n-2.

**To fix for full-scale:** add `intermediateSnapshots: string[]` to `RefactoringLoopResult`
in `packages/core/src/refactor/refactoring-loop.ts` (this requires editing a shared file — 
coordinate with Foundation sprint owner to add this field in the next window).

Workaround for the pilot: the `scoreBefore`/`scoreAfter` per step are accurate (taken from
`loopResult.steps[]`); only the `diff` and `biomarkerVectorBefore` for intermediate steps
are approximate. The file-level sentinel record is always exact.

---

## 9. Honest limitations

1. **Pilot n=10–42**: insufficient for statistical confirmation of any claim.
2. **Gate-off arm not yet implemented**: the RCT currently measures gate-on only;
   the gate-off arm requires `runRefactoringLoopNoGate` (§6).
3. **Mechanical loop baseline weak**: 0–20% target-reach rate on current fixtures
   (known from `benchmark-data/loop-bench/results.json`); LLM loop needed for >60% claim.
4. **No correctness verification on most files**: `brokeTests` is `null` for field-repo files
   that lack test suites. Correctness rate is only measurable on Defects4J subset.
5. **Power analysis is conservative**: the 786-file estimate assumes a 10pp true effect.
   If the true effect is 20pp, ~200 files suffice. The pilot result (30% reached ≥9.4 with
   gate-on) will inform a revised power estimate once gate-off data is available.

---

## 10. Files produced by this harness

| File | Description |
|---|---|
| `scripts/benchmarks/lager-b/emit-tuples.mjs` | Main harness — emits per-iteration JSONL |
| `scripts/benchmarks/lager-b/gate-rct.mjs` | Gate-on vs gate-off RCT scaffold |
| `scripts/benchmarks/lager-b/rct-stats.mjs` | Statistical analysis (McNemar, t-test, power) |
| `benchmark-data/lager-b/tuples.jsonl` | Per-iteration tuple JSONL (pilot output) |
| `benchmark-data/lager-b/summary.json` | Aggregate statistics for the pilot run |
| `benchmark-data/lager-b/rct-results.json` | RCT outcome measures |
| `benchmark-data/lager-b/rct-stats.json` | Statistical test results |

---

*Compiled 2026-06-01. All pilot numbers are from the unhealthy-fixture corpus (n≤42).
Do not use pilot numbers to make public claims about the LLM loop — that data is not yet collected.*
