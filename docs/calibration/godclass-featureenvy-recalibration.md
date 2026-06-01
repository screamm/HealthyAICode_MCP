# God Class & Feature Envy — MLCQ Recalibration (Sprint 51-60)

Recalibration of the `GodClass` and `FeatureEnvy` detectors to fix **0-recall** against the
MLCQ human-labelled benchmark, validated on a held-out split.

- **Date:** 2026-06-01
- **Benchmark:** `benchmark-data/mlcq/` (Java, 26 professional reviewers — Trautsch et al. 2020)
- **Split:** `benchmark-data/mlcq/holdout-split.json` (stratified 60/40 train/holdout, seed 42).
  Thresholds were chosen using the **train** split + literature ranges only; all headline
  numbers below are reported on the **holdout** split, which was never used for tuning.
- **Literature ranges:** `docs/calibration/godclass-featureenvy-literature.md`
- **Validation harness:** `scripts/validate-godclass-featureenvy.mjs` (runs the *compiled*
  detectors over the real MLCQ Java files — not a metric projection).

---

## 1. Root cause of 0 recall

Both detectors were structurally incapable of firing on Java/TypeScript, for two independent
reasons discovered during this work:

1. **Empty import set.** `analyzeJava`/`typescript-smells` call `detectGodClass` /
   `detectFeatureEnvy` with `importedTypeNames = new Set()`. The God Class `ATFD` conjunct
   (`atfd > 5`) and the Feature Envy foreign-receiver check both required the access target to
   be in that set, so `ATFD` was always 0 and foreign-call count was always 0. The strict
   triple-AND God Class gate (`ATFD>5 AND WMC>=20 AND LCOM4>1`) and the Feature Envy gate
   (`foreign>=3 AND ratio>=0.6`) could therefore **never** be satisfied.

2. **Broken method/field collection (God Class).** `analyzeClass` and the LCOM4 helper scanned
   the class node's *children* and called `childForFieldName('body')` on each child. In every
   supported grammar the `body` field is on the class node itself (`class_body`, `block`,
   `body_statement`), so the scan returned **0 methods and 0 fields** — making WMC, numMethods
   and LCOM4 all 0 even if the ATFD bug were fixed.

Confirmed empirically: on the full field-repos corpus (665 real OSS files) the detectors
produced **0 GodClass and 0 FeatureEnvy smells** before this change, and `gateWouldFire` is
`false` for all 88 GodClass and all 93 FeatureEnvy MLCQ samples in
`metric-distributions.json`.

---

## 2. Changes made (detection thresholds only; weights unchanged)

### God Class — `packages/core/src/smells/god-class.ts`

- **Fixed method collection** via a new `collectClassMethods()` helper that reads the class
  body directly (with a fallback for grammars without a named `body` field). The same fix was
  applied to field collection in `god-class-lcom4.ts`.
- **Dropped the broken import-matched ATFD conjunct** (no signal in this pipeline).
- **Replaced the strict ALL-THREE AND-gate with a 2-of-3 majority vote** over the three
  metrics that carry signal on MLCQ (single-metric train AUROC 0.77-0.82):

  | Signal | Threshold | Provenance |
  |--------|-----------|------------|
  | WMC | `>= 47` | Lanza/Marinescu 2006 "Very High"; PMD ships exactly 47 (canonical, unchanged) |
  | LCOM4 | `> 3` | Lack of cohesion; relaxed from `>1` within the Alves-2010 high-tail range |
  | numMethods | `>= 8` | Conservative co-signal (NDepend uses NOM>20 as a *standalone* God-Object trigger; here it is only a co-signal) |

  Fire when **≥ 2 of 3** hold. The literature explicitly endorses relaxing the strict
  conjunction when its F1 falls below 0.40 (MLCQ heuristic-tool baseline). Note WMC stays at
  the canonical 47 — only the AND→2-of-3 *strategy* changed, not the per-metric cutoffs.

### Feature Envy — `packages/core/src/smells/feature-envy.ts`

- **Stopped depending on `importedTypeNames`.** Calls on the self keyword (`this`/`self`/
  `$this`) are counted as *own* calls; calls on any other simple named receiver are *foreign*
  calls attributed to that receiver. (`isSimpleReceiver` excludes chained/complex receivers.)
- **Replaced the near-random `ratio >= 0.6` conjunct** (foreignMethodRatio train AUROC = 0.425)
  with Fowler's own definition, operationalised as a count comparison:

  | Condition | Threshold | Provenance |
  |-----------|-----------|------------|
  | `foreignMethodCallCount >= 3` | `>= 3` | keeps the historical `MIN_FOREIGN_CALLS=3` floor (unchanged) |
  | `foreignMethodCallCount > ownMethodCalls` | strict `>` | Fowler 1999 "more interested in another class than its own"; same self-vs-other comparison Reek uses |

  `foreignMethodCallCount` is the count for the single most-called foreign receiver, so the
  envy must be concentrated on **one** class.

Weights in `scoring/weights.ts` were **not** changed — only detection thresholds.

---

## 3. Holdout results (BEFORE vs AFTER)

Measured with `scripts/validate-godclass-featureenvy.mjs` running the compiled detectors over
the real MLCQ Java files; a detection is attributed to a sample when a reported smell line
falls inside the sample's `[startLine, endLine]` span.

### God Class (holdout n=35: 17 pos / 18 neg)

| Metric | BEFORE | AFTER |
|--------|--------|-------|
| Precision | 0.000 | **0.667** |
| Recall | 0.000 | **0.706** |
| F1 | 0.000 | **0.686** |
| AUROC | n/a | **0.606** |

### Feature Envy (holdout n=37: 19 pos / 18 neg)

| Metric | BEFORE | AFTER |
|--------|--------|-------|
| Precision | 0.000 | **0.750** |
| Recall | 0.000 | **0.632** |
| F1 | 0.000 | **0.686** |
| AUROC | n/a | **0.795** |

### Overall MLCQ micro (GodClass + FeatureEnvy)

| Split | BEFORE F1 | AFTER P | AFTER R | AFTER F1 |
|-------|-----------|---------|---------|----------|
| Train (n=109) | 0.000 | 0.800 | 0.800 | 0.800 |
| **Holdout (n=72)** | **0.000** | **0.706** | **0.667** | **0.686** |

These holdout F1 values (0.69) sit at the upper end of the heuristic-tool range reported for
MLCQ (0.30-0.55 for classic threshold tools), which is expected given the previous detectors
contributed literally nothing. Train→holdout drop is modest for Feature Envy (0.774→0.686) and
larger for God Class (0.833→0.686), consistent with God Class's higher reviewer disagreement;
no setting was tuned on holdout to close that gap.

---

## 4. Collateral-damage guards

- **Field-repos score distribution** (665 real OSS files, 10 languages) did **not** collapse:

  | | BEFORE | AFTER |
  |--|--------|-------|
  | GodClass smells | 0 | 70 |
  | FeatureEnvy smells | 0 | 60 |
  | median score | 9.20 | 9.10 |
  | mean score | 7.84 | 7.70 |

  Score impact is a 0.10-0.14 shift — the detectors now fire on a sensible minority of files
  rather than flooding.

- **Full test suites stay green with no re-baselining:**
  - `@healthy-ai-code/core`: 1375 passed / 109 files
  - `@healthy-ai-code/mcp-server`: 182 passed / 25 files
  - `pnpm -r typecheck`: clean

  **No test expectations were changed.** The detectors previously produced zero output, so no
  existing test asserted on their detections; the GodClass fixtures
  (`tests/fixtures/{healthy,unhealthy}/*-god-class.ts`) are only used by
  `context-weights.test.ts` to test role-weight *functions* with synthetic smell objects, not
  the detector output, so they are unaffected.

---

## 5. Reproduce

```bash
pnpm build
node scripts/validate-godclass-featureenvy.mjs   # holdout P/R/F1/AUROC, before/after
pnpm --filter @healthy-ai-code/core test
pnpm --filter @healthy-ai-code/mcp-server test
pnpm -r typecheck
```
