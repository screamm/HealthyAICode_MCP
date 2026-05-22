# Java Calibration Report — Defects4J Baseline

## Status

This report documents the calibration baseline for Java thresholds and weights derived from the
Defects4J bug dataset. The values below are **placeholders** generated from the schema defaults.
Run the calibration pipeline (see [Methodology](#methodology)) to replace them with empirically
derived values.

## Calibrated Thresholds (`calibration/java.json`)

| Threshold | Calibrated Value | Default Value | Source |
|---|---|---|---|
| `complexMethodThreshold` | 10 | 10 | Defects4J sweep (placeholder) |
| `deepNestingThreshold` | 3 | 3 | Defects4J sweep (placeholder) |
| `longParameterList` | 4 | 4 | Defects4J sweep (placeholder) |
| `largeMethodLines` | 50 | 50 | Not yet swept |
| `cognitiveComplexityThreshold` | 15 | 15 | Not yet swept |
| `criticalComplexityThreshold` | 20 | 20 | Not yet swept |

## Performance Metrics

These metrics reflect how well the above thresholds discriminate buggy from clean methods on the
Defects4J v2.0.0 corpus. Values are placeholders until the full pipeline is executed.

| Metric | Value | Notes |
|---|---|---|
| AUC (ROC) | 0.71 | Placeholder — run pipeline to get actual value |
| F1 @ default thresholds | 0.58 | Placeholder — run pipeline to get actual value |
| Precision | 0.63 | Placeholder |
| Recall | 0.54 | Placeholder |
| Corpus size | ~400 bugs | Defects4J v2.0.0 |

## Methodology

The calibration pipeline consists of five scripts located in `scripts/calibration/`:

1. **`fetch-defects4j.mjs`** — Checks out buggy and fixed revisions from Defects4J into
   `.calibration-cache/checkouts/`. Requires a local Java environment and the Defects4J CLI
   (`defects4j checkout`). Each revision pair is stored under
   `.calibration-cache/checkouts/<project>/<bug-id>/`.

2. **`extract-labels.mjs`** — Walks the checked-out revisions and emits a JSONL label file
   (`.calibration-cache/labels.jsonl`) mapping each Java method to a binary `buggy` flag derived
   from the diff between the buggy and fixed revision.

3. **`run-analyzer-corpus.mjs`** — Runs `@healthy-ai-code/core` over every labeled method and
   emits per-method smell predictions to `.calibration-cache/predictions.jsonl`.

4. **`threshold-sweep.mjs`** — Iterates over a grid of threshold values and computes AUC/F1/
   precision/recall for each combination, writing results to
   `.calibration-cache/sweep-results.jsonl`.

5. **`emit-calibration.mjs`** — Reads the sweep results, selects the threshold combination that
   maximises F1 (with AUC as a tie-breaker), and writes the final `calibration/java.json` file.

### Prerequisites

- Java 11+ on PATH
- Defects4J CLI installed and on PATH (`defects4j` command)
- Node.js 20+

### Running the Pipeline

```sh
node scripts/calibration/fetch-defects4j.mjs
node scripts/calibration/extract-labels.mjs
node scripts/calibration/run-analyzer-corpus.mjs
node scripts/calibration/threshold-sweep.mjs
node scripts/calibration/emit-calibration.mjs
```

After the pipeline completes, `calibration/java.json` will contain empirically derived thresholds
and the metrics section of this report can be updated with real values from
`.calibration-cache/sweep-results.jsonl`.

## Notes

- The `.calibration-cache/` directory is listed in `.gitignore` and is never committed.
- Calibration is opt-in: set `useCalibratedThresholds: true` via `setConfig()` or the
  `--calibrated` CLI flag to activate Java-specific thresholds at runtime.
- When no calibration file exists for a language, `getThresholds()` and `getWeights()` fall back
  to the built-in defaults documented in `packages/core/src/scoring/calibration-loader.ts`.
