# Calibration Flywheel — Privacy Model & Threshold Derivation

Sprint 60 — Opt-in, aggregate-only telemetry pipeline for improving per-language
health-score thresholds over time.

---

## Overview

The calibration flywheel is a feedback loop that collects **aggregate-only, anonymized**
statistics from opt-in users to improve the accuracy of predicted-vs-actual score
deltas across refactoring passes. Over time these aggregates allow us to publish
per-language, per-smell-type threshold adjustments that improve `analyzeForAutoRefactor`
predictions without any user data ever leaving their machine in identifiable form.

The pipeline is **off by default**. No data is collected or sent unless the user
explicitly opts in.

---

## Privacy Model

### What is captured

Only the following fields are ever stored:

| Field | Type | Example |
|---|---|---|
| `smellType` | enum discriminator | `"ComplexMethod"` |
| `language` | enum discriminator | `"typescript"` |
| `predictedDelta` | number (noised) | `1.4823` |
| `actualDelta` | number (noised) | `1.2101` |
| `iterations` | integer | `3` |
| `timestamp` | epoch-second (rounded) | `1748649600000` |

### What is NEVER captured

- Source code (no `code`, `source`, `snippet`, `text`, or `content` fields)
- File paths (no `filePath`, `path`, or directory names)
- User identifiers (no user ID, machine ID, IP address, email)
- Project names or repository URLs
- Function names, class names, or any identifier from the analyzed code
- Stack traces or error messages

This guarantee is enforced in two ways:

1. **Type system**: `TelemetryEvent` has no `string` fields beyond the two enum
   discriminators (`smellType`, `language`). TypeScript's structural typing prevents
   free-text fields from appearing in correctly-typed call sites.

2. **Privacy fuzz test**: `packages/core/tests/telemetry/calibration-telemetry.test.ts`
   contains a fuzz corpus of 500+ synthetic source-code-like payloads. The test
   attempts injection through every possible angle (extra properties, numeric coercion,
   etc.) and asserts nothing from the corpus appears in CSV output, JSONL sink, or
   in-memory aggregates.

### Local differential privacy

Before a `TelemetryEvent` is buffered, its numeric delta fields (`predictedDelta`,
`actualDelta`) receive **Laplace noise** with epsilon = 1.0 (default). This is the
same epsilon used by Brave P3A and Apple iOS privacy-preserving analytics.

The Laplace mechanism ensures that no single event meaningfully discloses the true
delta value, and that an adversary observing the aggregate output cannot recover
individual measurements.

To disable noise (for local debugging only), call:

```typescript
collectDelta(event, Infinity); // epsilon = Infinity → no noise
```

### Timestamp bucketing

Timestamps are truncated to the nearest second before storage. This prevents
sub-millisecond timing sidechannels that could be used to fingerprint sessions.

---

## Data Flow

```
refactoring loop
      │
      ▼
collectDelta(event)          ← LDP noise applied here (Laplace, ε=1.0)
      │
      ▼
in-memory circular buffer    ← max 10 000 events (FIFO drop)
      │
      ▼ (on flush or session end)
flushAggregates()            ← groups by (smellType, language), computes stats
      │                         buffer is cleared after this step
      ▼
TelemetryUploadEnvelope      ← schemaVersion + flushedAt + records[]
      │
      ├─► local JSONL file   ← flushToSink() appends one line per flush
      │   (calibration-telemetry.jsonl by default)
      │
      └─► [future] central endpoint (documented below, not yet live)
```

---

## Opt-in Configuration

Enable via `setConfig()` before analysis begins:

```typescript
import { setConfig } from '@healthy-ai-code/core';

setConfig({
  telemetryEnabled: true,
  telemetryOutputPath: '/path/to/my-calibration.jsonl', // optional, absolute path
});
```

Or via the environment (when building wrapper tooling):

```typescript
setConfig({
  telemetryEnabled: process.env.HEALTHY_AI_TELEMETRY === '1',
});
```

Default values:

| Config key | Default |
|---|---|
| `telemetryEnabled` | `false` |
| `telemetryOutputPath` | `"calibration-telemetry.jsonl"` (relative to `cwd`) |

---

## Local JSONL Sink

When `flushToSink()` is called, it appends one newline-delimited JSON line to
`telemetryOutputPath`. Each line is a `TelemetryUploadEnvelope`:

```json
{
  "schemaVersion": "1.0.0",
  "flushedAt": "2026-05-31T14:23:00.000Z",
  "records": [
    {
      "smellType": "ComplexMethod",
      "language": "typescript",
      "sampleCount": 47,
      "meanPredictedDelta": 1.4821,
      "meanActualDelta": 1.2034,
      "meanAbsError": 0.3187,
      "p50Error": 0.2910,
      "p90Error": 0.5840
    }
  ]
}
```

This is a **sample anonymized aggregate record**. It contains no source code, no file
paths, and no identifiers. The `sampleCount` field is included so downstream
weighting can discount groups with fewer than a minimum threshold of samples.

The JSONL file is safe to inspect, copy, or delete at any time. Deleting it does not
affect the in-memory buffer or any future collection.

---

## Future Central Endpoint (Documented, Not Live)

When a central collection endpoint is added, the upload format will be identical to
the local JSONL format: HTTP POST with `Content-Type: application/x-ndjson`, one
`TelemetryUploadEnvelope` JSON per line.

```
POST https://telemetry.healthyaicode.dev/api/v1/calibration/aggregates
Content-Type: application/x-ndjson
Authorization: Bearer <anonymous-session-token>

{"schemaVersion":"1.0.0","flushedAt":"...","records":[...]}
```

The server will:
1. Validate schema version (reject unknown versions).
2. Require `sampleCount >= 5` per record (suppress small-group records server-side).
3. Store only the aggregate fields — no IP address, no session token logged.
4. Make the aggregated dataset available under CC BY 4.0.

No client-side code for this endpoint exists yet. Users will be notified through
the changelog when it is added.

---

## How Per-Language Thresholds Are Derived

Once sufficient aggregate data is collected (target: 1 000+ samples per
`(smellType, language)` pair), we will:

1. **Compute calibration bias** per pair:
   `bias = meanPredictedDelta - meanActualDelta`

2. **Apply bias correction** to the default weights in `packages/core/src/scoring/weights.ts`:
   `calibratedWeight = defaultWeight × (1 - bias / defaultWeight)`

3. **Validate** against the held-out Defects4J / MLCQ label sets using AUROC and
   Pearson correlation (see `packages/core/src/validation/`).

4. **Publish** updated `calibration/<language>.json` files under CC BY 4.0.

The derivation is transparent and reproducible: anyone with access to the aggregate
JSONL file can re-derive the calibrated weights using the formula above.

---

## Opting Out / Data Deletion

Telemetry is off by default. If you previously enabled it and wish to remove local data:

```bash
rm calibration-telemetry.jsonl
```

No data is sent to any remote endpoint in the current version, so no server-side
deletion is necessary.

---

## File Locations

| File | Purpose |
|---|---|
| `packages/core/src/telemetry/calibration-telemetry.ts` | Pipeline implementation |
| `packages/core/src/config.ts` | `telemetryEnabled` / `telemetryOutputPath` flags |
| `packages/core/tests/telemetry/calibration-telemetry.test.ts` | Unit + privacy fuzz tests |
| `docs/distribution/calibration-flywheel.md` | This document |
| `calibration-telemetry.jsonl` | Local JSONL sink (created at first flush) |
