# Empirical Calibration (Opt-in)

The default smell thresholds in Healthy AI Code MCP are industry-standard values
calibrated in Sprint 11 (cyclomatic > 10, cognitive > 15, nesting > 3, parameters > 4).
These work well across most codebases but are not derived from a defect dataset.

Sprint 18 added an opt-in empirically validated overlay for **Java**, derived from the
[Defects4J](https://github.com/rjust/defects4j) defect dataset (835 bugs across 17 Java projects).

## Enabling

```
set_config useCalibratedThresholds true
```

Default: `false`. With the flag off you get zero behavioural difference from prior versions.

## Coverage

| Language | Calibration source | Status |
|----------|--------------------|--------|
| Java | Defects4J (835 bugs) | Available — see [java-report.md](java-report.md) |
| Python | (planned — BugSwarm or PyTraceBugs) | Future sprint |
| TypeScript | (planned — SZZ-mining on internal history) | Future sprint |
| C# | (planned) | Future sprint |
| Rust / Go / PHP / Ruby / Swift | (no Tier A smells yet) | Not applicable until Tier A is shipped |

## Methodology Summary

For each smell type and threshold value:
1. Check out the buggy version of each Defects4J bug
2. Run the analyzer; record which lines triggered each smell
3. Compute precision/recall/F1 against the ground-truth buggy lines from the patch
4. Sweep threshold values and pick the F1-maximizing point
5. Validate AUC against the hardcoded baseline; ship only if calibrated AUC >= baseline AUC

See [java-report.md](java-report.md) for full numbers and the ROC curve.

## Available Calibration Data

| Language | Source | AUC | Status |
|----------|--------|-----|--------|
| Java | Defects4J | 0.71 | Baseline |

## What This Is NOT

- **Not a replacement for Sprint 11 thresholds.** The defaults remain. This is an additive opt-in overlay.
- **Not a replacement for the progressive sqrt scoring formula from Sprint 12.** Calibration only modifies the input weights and threshold cutoffs.
- **Not multilingual.** Only Java is calibrated today. Other languages fall back to defaults even with the flag on.
- **Not a substitute for human review.** Empirical thresholds reduce false positives but do not eliminate them.

## Reproducing the Calibration

```bash
node scripts/calibration/fetch-defects4j.mjs
node scripts/calibration/extract-labels.mjs
node scripts/calibration/run-analyzer-corpus.mjs
node scripts/calibration/threshold-sweep.mjs
node scripts/calibration/emit-calibration.mjs
```

Output overwrites `calibration/java.json`. The pipeline is deterministic — same Defects4J version + same analyzer version = same calibration values.

## Extending Calibration

Place a `calibration/<language>.json` file following the schema in `calibration/schema.json`.

The file must contain threshold values for each smell type the analyzer supports for that language.
The calibration loader (`packages/core/src/scoring/calibration-loader.ts`) will pick it up automatically
when `useCalibratedThresholds: true` is set.
