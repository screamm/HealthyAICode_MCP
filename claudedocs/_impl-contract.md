# Sprint 51–60 Foundation Contract

**Phase:** FOUNDATION (types/weights/shared fields only — no detector logic)
**Gate status:** `pnpm -r typecheck` GREEN (both `@healthy-ai-code/core` and `@healthy-ai-code/mcp-server`).
**Date:** 2026-05-30

This file is the contract later phases build against. Detectors are implemented in a
subsequent phase; the FOUNDATION phase only declared the union members, weights, and
optional `HealthResult` fields below. Do not redefine these — import and populate them.

---

## 1. The `Smell` object shape every detector MUST return

Copied verbatim from `packages/core/src/types.ts` (unchanged by this phase):

```ts
export interface Smell {
  type: SmellType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  functionName?: string;
  line: number;
  description: string;
  suggestion: string;
  /**
   * Optional line ranges for sub-sections of the finding.
   * Used by BumpyRoad to expose each sequential chunk so AI assistants can extract them precisely.
   * Each entry is 1-indexed and inclusive.
   */
  chunkRanges?: Array<{ startLine: number; endLine: number }>;
  /** The raw metric value that triggered this smell (used for threshold calibration sweeps) */
  metricValue?: number;
}
```

### How to attach a `kind` / discriminator / detail

`Smell` has **no free-form `detail`/`metadata`/`kind` field**, and this phase deliberately
did **not** add one (it would widen the public shape and force changes across all detectors).
Detectors must convey sub-kind information through the existing fields:

- **Sub-kind / discriminator** (e.g. which DrAsync pattern, which exception anti-pattern,
  which SpecDetect4AI smell): encode it in `description` as a leading token, e.g.
  `description: 'asyncFunctionNoAwait — async function declares no await expression'`.
  Tests in the sprint docs already assert on description text (e.g. *"description som anger
  `asyncFunctionNoAwait`"*), so this is the agreed channel.
- **For the LLM-integration group**: a separate `SmellType` literal per kind is used
  (see §2), so no discriminator is needed — the `type` field IS the kind.
- **Metric carrier** (e.g. erosion ratio for `ComplexityMassConcentration`, CC for
  `ComplexMethod` threshold-gating): use the existing `metricValue: number` field.
  - `ComplexMethod` detectors MUST set `metricValue: cyclomaticComplexity` so Sprint 56's
    threshold-gating works (verify TS/Python/Java/Go analyzers already do this; if not it's
    a separate non-blocking patch — gating falls back to 1.5 when `metricValue` is absent).
  - `ComplexityMassConcentration` MUST set `metricValue: erosion` (0..1).

If a future detector genuinely needs structured metadata, propose adding an optional
`detail?: Record<string, unknown>` to `Smell` as a separate, explicit contract change —
do not smuggle it in ad-hoc.

---

## 2. New `SmellType` members, weights, sprint, intent, reuse

All new members were added to the `SmellType` union in `packages/core/src/types.ts` and
given an exhaustive entry in `SMELL_WEIGHTS` (`Record<SmellType, number>`) in
`packages/core/src/scoring/weights.ts`.

| New SmellType | Weight | Sprint | Detection intent (one line) | REUSED existing? |
|---|---|---|---|---|
| `SplitResidue` | 0.5 | 56 | >3 private single-caller methods (CC>2) — extract-to-evade gaming guard | No |
| `FragmentedCode` | 0.3 | 56 | ≥8 trivial CC=1 single-caller methods — over-fragmentation guard | No |
| `LlmUnboundedCall` | 1.0 | 57 | UMM — LLM call missing max_tokens/timeout/max_retries | No |
| `LlmUnpinnedModel` | 1.0 | 57 | NMVP — model alias without datestamped version | No |
| `LlmNoSystemMessage` | 1.0 | 57 | NSM — messages array with no system role entry | No |
| `LlmNoStructuredOutput` | 1.0 | 57 | NSO — LLM call without response_format/schema | No |
| `LlmUnsetTemperature` | 0.8 | 57 | TNES — LLM call omits temperature | No |
| `HallucinatedPackageImport` | 1.5 | 57 | Slopsquatting — import not in cached PyPI/npm snapshot | No |
| `AiAttributedSATD` | 0.8 | 57 | GIST — comment with AI term + SATD marker | No |
| `ComplexityMassConcentration` | 1.2 | 57 | Structural Erosion Index — Σmass(CC>10)/Σmass > 0.60 | No |
| `SsrfRisk` | 1.3 | 58 | HTTP sink with URL from request context | No |
| `CryptographicMisuseRisk` | 1.0 | 58 | Weak hash / insecure random / short RSA / hardcoded IV | No |
| `ExceptionHandlingAntiPattern` | 0.8 | 58 | EmptyCatch / CatchGeneric / DestructiveWrapping / UnreachableHandler | No |
| `AsyncAntiPattern` | 0.7 | 58 | DrAsync P1/P3/P7/P8 (TS/JS only) | No |
| `DuplicateCode` | 1.0 | 58 | In-file AST/line clone (type 1–2) | No |

### Reconciliation decisions

- **Sprint 58 `InsecureDeserialization`** → **REUSE existing `UnsafeDeserialization`** (weight
  1.2). No new `InsecureDeserializationRisk` literal was added. The Sprint 58 detector
  `detectSecuritySinks()` MUST emit `type: 'UnsafeDeserialization'` for pickle/yaml.load/
  ObjectInputStream/unserialize/Marshal.load sinks. (Sprint 58 doc text uses the name
  `InsecureDeserializationRisk` and asserts on it — when wiring the detector, either emit
  `'UnsafeDeserialization'` and adjust those test assertions, or, if the team prefers the
  distinct literal, add it in the detector phase as an explicit contract change. The
  foundation contract reuses the existing member to avoid a near-duplicate.)
- **Sprint 58 `PathTraversalRisk`** → already exists in the union (Sprint 28); reuse as-is.
- **Sprint 57 LLM group**: kept as **five separate union members** (`LlmUnboundedCall` …
  `LlmUnsetTemperature`) — Sprint 57 clearly specifies five literals, five weights, and a
  per-type detection design, so its explicit design was followed over the generic
  "one `LlmIntegrationSmell` with a kind discriminator" fallback.

---

## 3. New `HealthResult` fields and helper types

All additive and optional — existing code/tests compile unchanged.

In `packages/core/src/types.ts`:

```ts
/** Per-dimension breakdown (Sprint 56). Values in [1.0, 10.0]; overall mirrors HealthResult.score. */
export interface DimensionSubscores {
  security: number;
  complexity: number;
  maintainability: number;
  duplication: number;
  overall: number;
}

/** Aggregated intent-debt signals (Sprint 57). */
export interface IntentDebtSummary {
  aiAttributedSatdCount: number;
  orphanedTodoCount: number;          // plain SATD count
  undocumentedPublicApiCount: number; // LowDocCoverage count
  tieredGateActive: boolean;          // true when aiAttributedSatdCount > 0
}

export interface HealthResult {
  // ...existing fields unchanged...
  subscores?: DimensionSubscores;   // Sprint 56 — context-aware scoring path populates
  intentDebt?: IntentDebtSummary;   // Sprint 57 — analyze pipeline populates
}
```

In `packages/core/src/refactor/edit-mode.ts` (new type-only file, Sprint 52):

```ts
export type EditMode = 'patch' | 'funcRewrite' | 'fileRewrite';

export interface DiffPatch {
  editMode: 'patch';
  diff: string;       // unified diff text
  changes: string[];
  strategy: string;
}
```

`DimensionSubscores` and `IntentDebtSummary` are already public via `export * from './types'`
in `packages/core/src/index.ts`. `EditMode` and `DiffPatch` are re-exported from both
`packages/core/src/refactor/index.ts` and `packages/core/src/index.ts`.

### Signatures later phases will ADD (declared here as the contract, NOT implemented)

These do not exist yet. Implement them in the detector/integration phase with exactly these shapes:

```ts
// scoring/subscores.ts (Sprint 56)
export function computeSubscores(smells: Smell[], baseScore: number): DimensionSubscores;

// scoring/context-weights.ts (Sprint 56)
export type ArchitectureRole = 'controller' | 'service' | 'entity' | 'util' | 'test' | 'unknown';
export interface FileScoringContext {
  filePath: string;
  role: ArchitectureRole;
  isTestContext: boolean;
  churnMultiplier: number;
}
export function roleFromPath(filePath: string): ArchitectureRole;
export function buildFileScoringContext(filePath: string, churnRate?: number): FileScoringContext;

// scoring/scorer.ts (Sprint 56) — additive; calculateScore() signature stays unchanged
export function calculateScoreWithContext(
  smells: Smell[], context: FileScoringContext, language?: string
): { score: number; subscores: DimensionSubscores };

// refactor/edit-mode-selector.ts (Sprint 52)
export function selectEditMode(smellType: SmellType, functionLineCount: number): EditMode;
export function buildPatchDiff(original: string, transformed: string, filePath: string): string;
```

---

## 4. Wiring points the integration phase must touch (described, NOT changed)

### Per-file smell aggregation — `packages/core/src/index.ts`

- **`analyzeCode(code, language, filePath)`** (lines ~232–242): this is where per-file smells
  are merged: `const smells = [...parsed.smells, ...detectSmells(...), ...detectBrainMethods(...)]`
  then `appendLargeFileSmellIfNeeded(...)` then `calculateScore(smells, language)`.
  - Sprint 57 `intentDebt` aggregation belongs here (compute `IntentDebtSummary` from the
    final `smells` array and set `result.intentDebt`).
  - Most new detectors (Sprint 57/58) are wired **inside the language analyzers** (see below),
    NOT here — they end up in `parsed.smells` via `analyzeByLanguage`.
- **`analyzeFileWithHistory(filePath, repoPath)`** (lines ~212–229): the only path that merges
  git-derived smells and recomputes the score. Sprint 56's churn-multiplier / context scoring
  (`calculateScoreWithContext`) should activate here (analogous to `MethodTemporalCoupling`).

### Language analyzers — `packages/core/src/analyzers/*.ts`

- `analyzeByLanguage()` in `packages/core/src/analyzers/index.ts` (line ~200) is the dispatcher.
  It is NOT the place to add detector calls. Each new Sprint 57/58 detector is invoked at the
  end of the relevant per-language analyzer (`typescript.ts`, `python.ts`, `java.ts`, etc.),
  appending to that analyzer's `smells` array — per Sprint 57 §"Ändringar" and Sprint 58 T3/T6/T9/T12.
- `analyzeByLanguage` returns `{ functions, metrics, smells }` (the `AnalyzerOutput` interface,
  line ~135). `ComplexityMassConcentration` (Sprint 57) consumes `functions` (needs `cyclomaticComplexity`
  + `length`); it is called inside Tier A analyzers and its smell appended to `smells`.

### Public re-export point — `packages/core/src/index.ts`

- All new detector functions and types are re-exported from here (the file already groups
  exports per sprint). The integration phase adds, e.g.:
  - Sprint 56: `computeSubscores`, `calculateScoreWithContext`, `roleFromPath`,
    `buildFileScoringContext`, `detectSplitResidue`, `detectFragmentedCode`,
    `type FileScoringContext`, `type ArchitectureRole`. (`DimensionSubscores` already exported.)
  - Sprint 57: `analyzeLlmIntegration`, `detectHallucinatedImports`,
    `detectComplexityMassConcentration`, `detectAiAttributedSATD`,
    `detectAiAttributedSATDFromText`. (`IntentDebtSummary` already exported.)
  - Sprint 58: `detectSecuritySinks`, `detectExceptionAntiPatterns`,
    `detectAsyncAntiPatterns`, `detectDuplicateCode`, `type CloneGroup`.
  - Sprint 52: `selectEditMode`, `buildPatchDiff` (from `refactor/edit-mode-selector`).
    (`EditMode`, `DiffPatch` already exported.)

### Exhaustive-switch audit (Sprint 56 subscores etc.)

- The ONLY exhaustive `Record<SmellType, …>` in the codebase is `SMELL_WEIGHTS`
  (`packages/core/src/scoring/weights.ts`) — already updated, so typecheck is green.
- `packages/core/src/refactor/smell-instructions.ts` uses `Partial<Record<SmellType, …>>`
  (NOT exhaustive) — no change required.
- No `switch`/`assertNever` over `SmellType` exists. Sprint 56's `computeSubscores` dimension
  map should be a `Partial<Record<...>>` or a categorized lookup with a default bucket so it
  stays non-exhaustive and resilient to future SmellType additions.

### MCP-server (later phase; untouched here)

- `packages/mcp-server/src/tools/code-health-review.ts` — adds `subscores` to the response
  (Sprint 56) and the tiered AI-gate reading `intentDebt.tieredGateActive` (Sprint 57).
- `packages/mcp-server/src/tools/auto-refactor.ts` — adds `editMode` input param + patch/diff
  response using `EditMode`/`DiffPatch` (Sprint 52).
- These were NOT modified in the foundation phase.

---

## 5. Files changed in this phase

| File | Change |
|---|---|
| `packages/core/src/types.ts` | Added 15 SmellType members; added `DimensionSubscores` + `IntentDebtSummary` interfaces; added optional `subscores?` / `intentDebt?` to `HealthResult`. |
| `packages/core/src/scoring/weights.ts` | Added 15 `SMELL_WEIGHTS` entries (exhaustive Record satisfied). |
| `packages/core/src/refactor/edit-mode.ts` | New type-only file: `EditMode`, `DiffPatch` (Sprint 52). |
| `packages/core/src/refactor/index.ts` | Re-export `EditMode`, `DiffPatch`. |
| `packages/core/src/index.ts` | Re-export `EditMode`, `DiffPatch`. |

No detector files, no analyzer aggregation logic, no MCP tools were changed. No commits made.
