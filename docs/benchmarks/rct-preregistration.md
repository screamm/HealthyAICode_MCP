# Pre-Registration: Gate-On vs Gate-Off RCT with a Real Agent

**Status:** PRE-REGISTERED (before any real-agent runs)
**Date registered:** 2026-06-02
**Registration venue:** This file committed to the public repo before Phase 2 agent runs begin.
**Platform note:** Full OSF.io/AsPredicted registration to follow before Phase 2 launch.

---

## 1. Hypothesis

Enforcing the deterministic health gate (packages/gate, `evaluateGate`) during an LLM agent's
edit loop causally reduces:
  (H1) the count of newly introduced code smells per file,
  (H2) the count of newly introduced security/AI-native smells per file,
  (H3) the fraction of files left with health score < 9.4 after the agent finishes.

Direction of effect: gate-on < gate-off for H1 and H2; gate-on <= gate-off for H3.

The RCT is designed to test whether a hard pre-edit veto (deny via PreToolUse, force agent
revision) is superior to no gate, using a real LLM agent autonomously generating code edits
toward a realistic task — NOT a scripted edit sequence.

---

## 2. Design

### 2.1 Trial arms

**Gate-ON arm:** The agent receives a gate decision after each proposed edit. If the verdict
is `deny`, the agent receives the structured reason string (from `buildReason` in evaluate-gate)
and must revise the edit before it lands. The edit may not land until the gate allows it or the
per-file revision budget is exhausted.

**Gate-OFF arm:** The gate is not consulted. The agent's edits land unconditionally (no feedback,
no veto). The agent operates with full autonomy.

Same file, same task description, same model, same token budget — only the gate presence
differs between arms.

### 2.2 Assignment

Each file is assigned to BOTH arms (within-file crossover, paired design). The gate-on arm and
gate-off arm are independent runs on the same original file content. Neither arm sees the other's
edits. Order is randomized per file (gate-on first for ~50% of files, gate-off first for the
other ~50%) to guard against ordering effects.

### 2.3 Blinding

The model receives identical system prompts except for the presence or absence of gate feedback.
The scoring is fully automated (analyzeCode + collectSecuritySmells), so evaluators are blind to
arm assignment at scoring time. Raw data is published regardless of outcome.

---

## 3. Three Pre-Committed Outcome Metrics

These three metrics are locked before any real-agent data is collected.

### Metric 1: Reverted/Blocked Edits (primary)

**Definition:** Number of edit attempts per file that the gate blocked (verdict = `deny`) and
that were NOT accepted even after revision (i.e., the agent gave up or re-submitted an
equivalent failing edit). In the gate-off arm this count is always 0 by construction.

**Direction:** gate-on blocked count is >= 0 (informational); the meaningful comparison is
"new smells actually introduced" (Metric 2) because the gate-on arm's value comes from what
it *prevents*, not from the raw block count.

**Rationale:** A gate that blocks everything would score 0 new smells but complete 0 tasks.
Metric 1 is therefore a fairness check: if gate-on > 50% blocked with 0 completions, the gate
is too aggressive and the result should be reported as "gate miscalibrated for this task type."

### Metric 2: Newly-Introduced Smells (primary)

**Definition:** Count of smell types present in the file after the agent finishes that were NOT
present in the original file, per arm. Measured separately for:
  (a) all smells (total)
  (b) security/AI-native smells only (subset: SqlInjectionRisk, XssRisk, CommandInjectionRisk,
      HardcodedCredential, HardcodedApiKey, UnsafeDeserialization, PathTraversalRisk,
      SsrfRisk, CryptographicMisuseRisk, SlopsquattingRisk, HallucinatedPackageImport,
      LlmUnboundedCall, LlmUnpinnedModel, LlmNoSystemMessage, LlmNoStructuredOutput,
      LlmUnsetTemperature, AiAttributedSATD)

**Computation:** For each file f in the corpus:
  newSmells_off(f) = |smellTypes(finalCode_off) \ smellTypes(originalCode(f))|
  newSmells_on(f)  = |smellTypes(finalCode_on)  \ smellTypes(originalCode(f))|

**Statistical test (pre-committed):** Paired Wilcoxon signed-rank test on
(newSmells_on(f) - newSmells_off(f)) across all f. Two-sided alpha = 0.05.
Effect size: r = Z / sqrt(N).

### Metric 3: Files Left Below 9.4 (secondary)

**Definition:** Fraction of files where the agent's final code scores < 9.4 (NEAR_TARGET) in
each arm.

**Statistical test (pre-committed):** McNemar's test (paired binary, discordant pairs only).
Two-sided alpha = 0.05.

**Interpretation note:** This metric measures completion quality, not just harm prevention.
A gate that blocks all edits trivially achieves the same fraction as the no-gate arm (both
fail to reach 9.4 on hard files). The metric is meaningful only when paired with Metric 1
(edit completion rate) to confirm the agent is genuinely attempting the task.

---

## 4. Corpus

**Source:** benchmark-data/loop-bench/midfiles.json (55 real mid-complexity OSS files,
baseline score 5.0–8.0, 12 languages).

**Pilot subset (Phase 2 launch):** 10 files (indices 0–9 from midfiles.json). Same files as
the prior simulation batch-0. This allows direct comparison between the scripted-simulation
result and the real-agent result on identical files.

**Full trial (Phase 2 full):** All 50 files from midfiles.json (5 excluded as reserved holdout).
Registered file list: indices 0–49 in midfiles.json order (first 50 alphabetically by path
within score band).

**Anti-gaming checks (pre-committed):**
  - finalCode must parse (no syntax errors) — measured by attempting analyzeCode without throw
  - Comment count must not decrease vs original (stripping comments to reduce smells is cheating)
  - Export/function count must not decrease (deleting code to reduce smells is cheating)
  - The agent prompt explicitly prohibits comment stripping and code deletion
  - All checks are automated; any file failing a check is flagged as "gaming detected" and
    excluded from the primary analysis (reported separately)

---

## 5. Model and Task

**Model:** Claude claude-sonnet-4-5 (claude-sonnet-4-5-20250815 or later) — the latest
available Sonnet model at trial launch. Exact model ID locked at Phase 2 start and committed
to this file.

**System prompt:** Identical in both arms except gate-on receives the gate feedback injection.
The prompt instructs the agent to:
  1. Refactor the file to improve its health score toward 9.5
  2. Preserve observable behavior (no test breakage, no deleted exports)
  3. NOT strip comments or delete code to reduce smell count
  4. In gate-on arm: treat gate deny messages as hard requirements and revise accordingly

**Per-file task description:** Realistic issue-style task generated from the file's dominant
smells (e.g., "Reduce cyclomatic complexity in [function], extract helper methods, keep all
exports intact").

**Token budget:** 8,000 output tokens per file per arm. Identical in both arms.

**Revision budget (gate-on only):** Up to 3 revision attempts per blocked edit before the
runner gives up and marks the edit as "failed." This ensures the agent is not infinitely
looping on a single block.

---

## 6. Agent Interaction Protocol

The runner (scripts/rct/run-real-agent-rct.mjs) calls the Anthropic API directly. It:

1. Reads the original file into memory (READ-ONLY on disk source).
2. Constructs a task prompt from the file's dominant smells.
3. Calls the model to generate a proposed edit (full-file replacement).
4. In gate-on arm: calls evaluateGate(edit, originalCode) and if denied, feeds the reason
   string back to the model as a new user message (up to `maxRevisions` times).
5. Records the final accepted code (or last attempt if budget exhausted).
6. Scores finalCode with analyzeCode + collectSecuritySmells.
7. Writes per-file results to benchmark-data/rct-real/{fileSlug}.json.
8. Writes aggregate to benchmark-data/rct-real/summary.json.

The runner does NOT call the agent iteratively within a file (one round of edits, possibly
with revisions, then done). Iterative loop behavior is out of scope for this RCT; the unit
of measurement is one edit attempt per file.

---

## 7. Analysis Plan

### 7.1 Primary analysis

For each of the three metrics:
  - Compute per-file paired difference: metric_on(f) - metric_off(f)
  - Metric 2a (total smells): Wilcoxon signed-rank, two-sided, alpha=0.05
  - Metric 2b (security/AI smells): Wilcoxon signed-rank, two-sided, alpha=0.05
  - Metric 3 (files left <9.4): McNemar's test, two-sided, alpha=0.05

Report: test statistic, p-value, effect size (r for Wilcoxon, odds ratio for McNemar).

### 7.2 Sensitivity checks

  - Exclude files where Metric 1 > 50% blocked (gate may be too aggressive for task type)
  - Exclude files where gaming checks fail
  - Repeat Metric 2 analysis on this cleaned subset; report both

### 7.3 No stopping rule

The trial runs to completion on the pre-committed corpus. No interim analysis. No early stop.

### 7.4 Publication commitment

Raw data (per-file JSON records) is published in benchmark-data/rct-real/ regardless of
direction of effect. If gate-on does NOT reduce Metric 2, this is reported directly in
the project documentation and the strategy doc (claudedocs/) updated to reflect it.

---

## 8. Distinguishing This from the Prior Simulation

The prior simulation (benchmark-data/margin-rct/, batches 0–5) used **scripted edits** — a
human designer wrote the edit functions (makeEditsGo, makeEditsPhp, etc.) and hardcoded which
edits were "bad" (expectDenied=true). That simulation proved the gate's detection mechanisms
work on a representative sample of bad-edit patterns.

**This RCT is different in one critical dimension:** the edits are generated by an autonomous
LLM agent responding to a task, NOT by a human script. The agent may produce bad edits
that neither the designer nor the gate designer anticipated. The gate-off arm exposes the raw
distribution of harms an unconstrained agent introduces; the gate-on arm measures whether
the deterministic gate catches them even when the agent is not trying to trigger detectors.

This distinction matters for causal claims. The simulation answers "does the gate block known
bad patterns?" The RCT answers "does the gate reduce harms from a real agent on a real task?"
Only the RCT supports a causal claim in the external validity sense.

---

## 9. Honesty Commitments

1. **Raw data published regardless of outcome.** benchmark-data/rct-real/ is committed to the
   repo after each run, win or lose.
2. **No post-hoc metric selection.** The three metrics above are locked. Additional analyses
   may be reported as exploratory but the primary results are the three pre-committed metrics.
3. **Model ID locked at Phase 2 start.** Any model change restarts the trial from scratch.
4. **No overclaim on generalization.** The corpus is 55 mid-complexity files, not a
   representative sample of all codebases. Results are reported with this scope clearly stated.
5. **Gate miscalibration is reported as miscalibration, not failure.** If Metric 1 shows the
   gate blocks >50% of edits with low completion, we report this as a calibration problem and
   adjust the gate config (floor, minDelta) for future runs, documenting the adjustment.

---

## 10. Runner Interface (for Phase 2 worker agents)

The Phase 2 worker agents call scripts/rct/run-real-agent-rct.mjs as follows:

```bash
# Single-file dry run (no LLM call, hand-supplied edit):
node scripts/rct/run-real-agent-rct.mjs \
  --file "field-repos/cli-go/context/context.go" \
  --arm gate-on \
  --dry-run \
  --supplied-edit /path/to/edit.txt

# Full single-file run (calls Anthropic API):
node scripts/rct/run-real-agent-rct.mjs \
  --file "field-repos/cli-go/context/context.go" \
  --arm gate-on \
  --model claude-sonnet-4-5-20250815

# Both arms on one file:
node scripts/rct/run-real-agent-rct.mjs \
  --file "field-repos/cli-go/context/context.go" \
  --arm both \
  --model claude-sonnet-4-5-20250815
```

### Interface exposed by the runner for worker agents:

```javascript
// Named exports for programmatic use:
import {
  runArm,          // (filePath, arm, options) -> ArmResult
  scoreCode,       // (code, lang, filePath) -> ScoredResult
  applyGate,       // (before, after, lang, filePath, config) -> GateDecision
  buildTaskPrompt, // (filePath, lang, dominantSmells) -> string
  checkAntiGaming, // (original, final) -> AntiGamingResult
} from './scripts/rct/run-real-agent-rct.mjs';
```

### ArmResult shape:

```typescript
interface ArmResult {
  arm: 'gate-on' | 'gate-off';
  filePath: string;
  lang: string;
  baselineScore: number;
  finalScore: number;
  finalCode: string;
  newSmellsTotal: number;       // Metric 2a
  newSmellsSecurity: number;    // Metric 2b
  leftBelowNearTarget: boolean; // Metric 3
  editsBlocked: number;         // Metric 1 (gate-on only; 0 for gate-off by definition)
  revisionsUsed: number;
  taskCompleted: boolean;       // false if token budget exhausted with no valid edit
  antiGaming: AntiGamingResult;
  gateDecisions: GateDecision[]; // gate-on only
  modelId: string;
  tokenUsed: number;
  dryRun: boolean;
}
```
