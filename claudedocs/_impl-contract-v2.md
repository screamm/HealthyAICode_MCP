# Implementation Contract v2 — Sprints 51–60 (Foundation)

**Date:** 2026-06-01
**Owner:** Foundation phase
**Status:** Shared types declared atomically. Typecheck GREEN (`pnpm -r typecheck`).
**Scope of this doc:** what was added to shared files, what additive types Build agents
should produce, and the exact wiring points Integrate must touch. No detection/logic
was implemented here.

---

## 1. New SmellType + weight (DONE in shared files)

### `SmellType` member: `SlopsquattingRisk`

Added to `packages/core/src/types.ts` (end of the `SmellType` union) and to
`packages/core/src/scoring/weights.ts` (`SMELL_WEIGHTS` record).

- **Weight:** `1.5` — parity with `SqlInjectionRisk` and `HallucinatedPackageImport`.
- **Semantics (IMPORTANT — distinct from existing member):**
  - `SlopsquattingRisk` = an import that **looks like a typosquat of a popular package**,
    OR a **suspicious very-new / low-trust package** (registry 404, first published
    < 90 days ago, typo-distance to a popular name, or DepScope hallucination-corpus match).
  - `HallucinatedPackageImport` (unchanged) = **the package does not exist at all**.
  - These are deliberately two separate biomarkers. Do NOT collapse them.

### Why `weights.ts` was the only exhaustive Record that needed editing

`SMELL_WEIGHTS: Record<SmellType, number>` is the **only** non-`Partial`
`Record<SmellType, …>` in the codebase, so it is the only place where adding a
SmellType member would break typecheck. All other SmellType-keyed maps are
`Partial<Record<SmellType, …>>` and therefore additive-safe:

| File | Map | Type | Action |
|---|---|---|---|
| `scoring/weights.ts` | `SMELL_WEIGHTS` | `Record<SmellType, number>` (exhaustive) | **Edited — added `SlopsquattingRisk: 1.5`** |
| `refactor/smell-instructions.ts` | `TEMPLATE_BUILDERS` | `Partial<…>` | optional (Build/Integrate may add a template) |
| `scoring/subscores.ts` | `DIMENSION_MAP` | `Partial<…>` | optional (recommend mapping to `security`) |
| `security/sarif-taxonomy.ts` | `SMELL_TO_CWE` | `Partial<…>` | optional (recommend CWE-1104 / supply-chain) |
| `mcp-server/.../format-output.ts` | `SECURITY_SEVERITY_MAP`, `WEIGHT_MAP` | `Partial<…>` | optional (severity display) |
| `scoring/co-occurrence.ts` | parameter typed `Record<SmellType, number>` | receives `SMELL_WEIGHTS` | no action (covered by weights edit) |

> These `Partial` maps are display/metadata only. They do not affect the score and
> are not required for typecheck. Integrate may add `SlopsquattingRisk` entries for
> nicer output, but it is optional.

---

## 2. New additive types (DONE) — where Build agents produce them

Two new **type-only** modules under `packages/core/src/contracts/`. They are additive,
import only `type`s from `../types`, and are within the core tsconfig `include`
(`src/**/*`), so they already typecheck. Nothing imports them yet.

### `contracts/gate-types.ts` — Sats 1 (`@healthy-ai-code/gate`)

- `GateVerdict = 'allow' | 'deny' | 'warn'`
- `GateReasonCode` — `below_floor | score_regression | new_security_smell | new_ai_native_smell | none`
- `GateDecision` — the deterministic per-edit decision (scoreBefore/After, delta,
  newSmells, category, floor). Serialisable into a Claude Code `PreToolUse`
  `hookSpecificOutput` payload (structured-JSON deny path).
- `GateConfig` — tunable thresholds (floor default `PROBLEMATIC_THRESHOLD` 6.0;
  `minDelta` small negative tolerance to avoid false-positive fatigue).
- `GateSelfTestResult` — install-time conformance self-test result.

**Build agent for the gate** should:
- Produce its `GateDecision` objects by importing from `../contracts/gate-types`
  (relative path) until Integrate re-exports.
- Compute deltas via the existing `analyzeChangeset` / `analyzeCode` core APIs —
  do NOT re-implement scoring.

### `contracts/attestation-types.ts` — 90-day plan (`code_health_attest`, EU AI Act Art. 12)

- `AttestationRecord` — `{ timestamp, filePath, language, toolVersion, ochsSpecVersion?,
  score, category, smells[], thresholdPassed, threshold, signature? }`.
  Framed as **controls evidence** (a logged check that ran), not risk prediction.
- `AttestationSignature` — `{ algorithm, value, keyId? }` over the canonical JSON of
  the record with `signature` omitted.
- `AttestationExportFormat = 'json' | 'sarif' | 'cyclonedx'`.

**Build agent for attestation** should import from `../contracts/attestation-types`
(relative) and reuse `analyzeFile` for the score; do not add fields to `HealthResult`.

---

## 3. Exact wiring points Integrate must touch

> Foundation did NOT touch these (per the hard rule that Foundation+Integrate own the
> shared files). This is the precise list for Integrate.

### 3a. Analyzers dispatch — SlopsquattingRisk detector

- **File:** `packages/core/src/analyzers/additive-detectors.ts`, function
  `runAdditiveDetectors(code, language, filePath, functions)`.
- **What:** call the new `detectSlopsquatting(...)` (produced by the Sats 4 Build agent)
  and `smells.push(...)` its results, gated by a language set with import semantics
  (mirror the existing `HALLUCINATION_LANGUAGES` guard used for `detectHallucinatedImports`).
- **Why here and not `analyzeByLanguage`:** `runAdditiveDetectors` is already invoked
  inside `analyzeByLanguage` (`analyzers/index.ts:206`). Adding the call here means the
  detector automatically flows into `analyzeCode` / `analyzeFile` and into the score
  (because `SlopsquattingRisk` now has a weight). **No change to the `analyzeByLanguage`
  signature or the analyze pipeline is required.**
- Keep it offline-safe: the lockfile-diff + DepScope-corpus path must be a no-op with
  zero network calls when registry validation is opted out (Sats 4 success metric:
  0 network calls on opt-out).

### 3b. `packages/core/src/index.ts` — public exports

Add (mirroring the existing `detectHallucinatedImports` export at `index.ts:227`):

- `export { detectSlopsquatting } from './analyzers/<slopsquatting-file>';`
  (and any reset/cache helper, like `resetSnapshotCaches`, if the detector adds one).
- `export type { GateVerdict, GateReasonCode, GateDecision, GateConfig, GateSelfTestResult } from './contracts/gate-types';`
- `export type { AttestationRecord, AttestationSignature, AttestationExportFormat } from './contracts/attestation-types';`
- Plus the implementation functions for the gate (`evaluateGate`, `runGateSelfTest`, …)
  and attestation (`createAttestation`, `signAttestation`, `exportAttestation`, …) once
  the Build agents land them.

### 3c. `packages/mcp-server/src/server.ts` — tool registration

For any new MCP tools the Build agents produce (e.g. `code_health_attest`, and a gate
tool if exposed over MCP), follow the project convention:
1. one tool per file under `packages/mcp-server/src/tools/`, exporting
   `register<ToolName>(server: McpServer): void`;
2. import + call it inside `createServer()` in `server.ts`.

### 3d. `server.json` (manifest)

Add manifest entries for any newly registered MCP tools. Foundation did not edit it.

---

## 4. Verification

- `pnpm -r typecheck` — **GREEN** after the type + weight additions.
- New files created (no shared-file logic added):
  - `packages/core/src/contracts/gate-types.ts`
  - `packages/core/src/contracts/attestation-types.ts`
- Shared files edited (atomic type/weight declarations only):
  - `packages/core/src/types.ts` (added `SlopsquattingRisk` to `SmellType`)
  - `packages/core/src/scoring/weights.ts` (added `SlopsquattingRisk: 1.5`)
- No detection logic, no gate logic, no attestation logic implemented here.
