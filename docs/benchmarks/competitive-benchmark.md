# Competitive Benchmark — Predictive Power vs. Other Static Analyzers

**Date:** 2026-05-31
**Our tool version:** `@healthy-ai-code/core` (this repo, `feat/sprints-51-60-implementation`)
**Datasets:**
- **MLCQ** — 358 labeled Java code elements (341 unique files) with human majority-vote
  code-smell labels (Madeyski & Lewowski, *EASE 2020*; Zenodo DOI
  `10.5281/zenodo.3666840`).
- **Defects4J** — 96 buggy/fixed Java source variants from `commons-lang` /
  `commons-math` with human-curated real-bug labels (Just et al., *ISSTA 2014*).

**What this measures:** the *predictive power* of each analyzer's risk signal against a
**neutral, external ground truth** — not our own score, not a git-bug-fix proxy. The
question is: *does a tool's risk signal rank human-flagged-smelly (or buggy) files above
clean ones?* The primary, threshold-free metric is **AUROC** (area under the ROC curve):
`0.5` = no better than chance, `1.0` = perfect ranking.

**Honesty statement:** every number below was produced by **actually running** each
analyzer on the real files in this session. No fabricated metrics, no synthetic
stand-ins, no competitor numbers we did not produce ourselves. Tools we could not run
are in a clearly-labeled "Could NOT be run here" section with the reason.

---

## Analyzers actually run (head-to-head)

| Analyzer | Version | Signal used as "risk" | Source of numbers |
|---|---|---|---|
| **Healthy-AI-Code (ours)** | this repo | `-HealthResult.score` (lower health ⇒ higher risk) | `analyzeFile()` |
| **lizard** | 1.22.2 | **max cyclomatic complexity (CCN) per file** — column 0 of `python -m lizard --csv` output | `scripts/benchmarks/competitive/run.mjs` |
| **PMD** | 7.10.0 | `java/quickstart.xml` violation count per file | `pmd check -f csv` |
| **SonarQube Community** | 26.5.0 | per-file `code_smells`, `sqale_index` (tech-debt), `cognitive_complexity` | dockerized scan + `/api/measures/component_tree` |

> **Lizard column note:** lizard's `--csv` output has column 0 = CCN (cyclomatic complexity)
> and column 1 = NLOC (lines of code). The harness (`scripts/benchmarks/competitive/run.mjs`)
> reads column 0 (CCN), which is what the AUROC numbers below reflect.
> The older script `scripts/benchmarks/competitive-mlcq.mjs` had a bug reading column 1
> (NLOC); that bug has been fixed. The canonical data (`benchmark-data/competitive-raw.json`,
> generated 2026-05-31 by the correct harness) stores `maxCCN` and was used for all AUROC
> computations. The lizard AUROC was independently re-verified on 2026-06-01 using
> `core.computeAUROC` on the stored `maxCCN` values: **0.6803** (rounds to 0.680 ✓).

> SonarQube and PMD emit issue **counts** / a tech-debt index rather than a single 0–10
> health score. To compare predictive power we treat each tool's count/index as a
> per-file risk score and measure how well it ranks the same labeled files. That is the
> only apples-to-apples comparison possible when the tools score different things.

---

## Result 1 — MLCQ human code-smell detection

Positive = a human reviewer flagged the element as a smell (`minor`/`major`/`critical`);
negative = `none`. Higher risk should rank positives above negatives.

| Rank | Analyzer | Signal | n | AUROC | 95 % CI (bootstrap, 2000×) | Mann–Whitney p |
|---|---|---|---|---|---|---|
| 1 | **Healthy-AI-Code (ours)** | `-score` | 343 | **0.688** | 0.632 – 0.741 | 5.2 × 10⁻¹⁰ |
| 2 | lizard | max CC | 349 | 0.680 | 0.625 – 0.736 | 4.1 × 10⁻⁹ |
| 3 | SonarQube | `sqale_index` | 350 | 0.645 | 0.583 – 0.698 | 1.8 × 10⁻⁶ |
| 4 | SonarQube | `code_smells` | 350 | 0.643 | 0.585 – 0.700 | 2.2 × 10⁻⁶ |
| 5 | PMD | quickstart violations | 358 | 0.626 | 0.568 – 0.685 | 2.4 × 10⁻⁵ |
| 6 | SonarQube | `cognitive_complexity` | 286 | 0.624 | 0.558 – 0.688 | 2.1 × 10⁻⁴ |

**F1 at the in-sample best threshold** (optimistic — see caveats):

| Analyzer | best-F1 | precision | recall |
|---|---|---|---|
| Healthy-AI-Code (ours) | 0.717 | 0.598 | 0.894 |
| lizard (max CC) | 0.701 | 0.640 | 0.774 |
| SonarQube (cognitive_complexity) | 0.697 | 0.542 | 0.974 |
| SonarQube (sqale_index) | 0.686 | 0.566 | 0.873 |
| SonarQube (code_smells) | 0.686 | 0.560 | 0.884 |
| PMD (quickstart) | 0.671 | 0.568 | 0.821 |

### Reading of Result 1 (honest)

- **Every analyzer beats chance on MLCQ, and significantly so** (all p ≪ 0.001). Human
  code smells *are* detectable from structural signals — none of these tools is noise.
- **We lead on this dataset, but the lead over lizard is within noise.** Our AUROC
  (0.688) is the highest, but its 95 % CI (0.632–0.741) overlaps lizard's almost
  entirely (0.625–0.736). The honest statement is **"we tie lizard at the top, edging it
  slightly,"** not "we beat it." A single max-cyclomatic-complexity number is a
  surprisingly strong smell detector on MLCQ because MLCQ's smell types (blob, long
  method, feature envy, data class) are heavily size/complexity-correlated.
- **We lead SonarQube and PMD by a clearer margin** (~0.04–0.06 AUROC). Our CI lower
  bound (0.632) sits above the point estimates of PMD (0.626) and SonarQube
  cognitive_complexity (0.624), and above the CI lower bounds of all three SonarQube
  signals and PMD. This is a real but modest edge, not a landslide.
- **Best single SonarQube signal is `sqale_index` (tech-debt minutes), not
  `code_smells`** — they are within 0.002 of each other.

---

## Result 2 — Defects4J real-bug detection

Positive = the buggy variant, negative = the fixed variant of the same class.

| Analyzer | Signal | n | AUROC | 95 % CI | Mann–Whitney p |
|---|---|---|---|---|---|
| Healthy-AI-Code (ours) | `-score` | 96 | 0.495 | 0.394 – 0.597 | 0.91 |
| lizard | max CC | 96 | 0.486 | 0.376 – 0.603 | 0.76 |

### Reading of Result 2 (honest)

- **Neither tool predicts real logic bugs on Defects4J — both are at chance.** Our AUROC
  is 0.495 (p = 0.91); lizard is 0.486 (p = 0.76). This is a genuine **null result**, and
  we report it as such.
- **Why this is expected, not a failure:** Defects4J bugs are *logic* defects (off-by-one,
  wrong operator, missing null check) inside large, mature Apache utility classes. The
  buggy and fixed variants differ by a handful of lines, so a *file-level structural*
  health score barely moves between them — the structural smell load is essentially
  identical. Structural smell detectors (ours, lizard, and by extension SonarQube's
  smell/complexity signals) are not bug oracles, and Defects4J is the wrong instrument to
  claim they are. This matches the project's own validation note (`runValidation()` on the
  same 96 records yields AUROC ≈ 0.495).
- We did **not** run SonarQube/PMD on Defects4J: each buggy/fixed pair would need to be
  compiled (SonarQube's Java sensor refuses source-only analysis — see below), and the
  expected result on a structural signal is the same chance-level outcome.

---

## Could NOT be run here (no fabricated numbers)

| Tool | Why it could not produce head-to-head numbers in this environment |
|---|---|
| **CodeScene** | CodeScene's *Code Health* (a single 1–10 score) is the closest conceptual competitor to ours, but the `cs` CLI and the standalone Code Health MCP server both require an **access token issued by a CodeScene account/instance**; full features require a paid subscription. Obtaining that token is an outward-facing credential operation that is out of scope. We did **not** invent CodeScene scores. *(Sources: codescene.io/docs/cli, github.com/codescene-oss/codescene-mcp-server — the server's own SKILL.md states "The server needs at least an access token to function.")* |
| **DeepSource** | Hosted SaaS; analysis runs in DeepSource's cloud after connecting a Git provider and authenticating an account. There is no offline, account-free binary that produces results locally. Out of scope; no fabricated numbers. |
| **SonarQube on Defects4J** | Runnable in principle, but SonarQube's `JavaSensor` **refuses to analyze `.java` source without compiled `.class` binaries** (`sonar.java.binaries`). Defects4J variants would each need a full compile against their original dependency tree. Not done. |
| **SpotBugs (any dataset)** | Operates on **bytecode**, so every file would need to compile standalone. The MLCQ/Defects4J files come from 100+ unrelated projects and do not compile in isolation. PMD (source-level) is the practical Java neutral baseline instead. |

### Published methodology as *context only* (not head-to-head)

CodeScene publishes that its *Code Health* metric correlates with defect density and
delivery cost in their own studies (e.g. "Code Red: The Business Impact of Code Quality",
Tornhill & Borg, 2022). We cite this only as published context for what a 1–10 health
score *aims* to predict — **it is not a number we measured, and it is not comparable to
the AUROC values above**, which are on different datasets with different ground truth.

---

## Statistical caveats (read before quoting any number)

1. **Sample size & overlapping CIs.** MLCQ n ≈ 343–358, Defects4J n = 96. The MLCQ AUROC
   CIs are ~0.11 wide and **overlap across the top analyzers**. Differences inside the
   overlap (notably ours vs. lizard) are **not statistically distinguishable** at this n.
   We did not run a paired DeLong test, so all "lead/tie/trail" claims are read off
   overlapping bootstrap CIs, not a formal significance test of the difference.
2. **Granularity mismatch.** MLCQ labels are scoped to a *code element* (a class or a
   method) with start/end lines; every analyzer here produces a *file-level* risk signal.
   We compare file-level signal vs. element-level label. This is coarse and adds noise for
   all tools equally (a "none"-labeled element can live in a file that contains other,
   unlabeled smells).
3. **The tools score different things.** PMD/SonarQube emit issue counts and a tech-debt
   index; we and lizard emit a single per-file number. Mapping counts → a risk score is a
   defensible but lossy comparison. SonarQube has *many* possible signals; we report its
   strongest three, which is generous to SonarQube.
4. **best-F1 is in-sample and optimistic.** The F1 column picks the threshold that
   maximizes F1 *on this same data*. It is an upper bound, not held-out performance. AUROC
   (threshold-free) is the metric to trust for ranking.
5. **Language scope is Java-only.** Both datasets are Java. lizard/PMD/SonarQube/ours all
   support more languages, but this benchmark says nothing about non-Java performance.
6. **Coverage differs slightly per tool** (n = 286–358) because SonarQube's Java AST
   analyzer OOM-crashed on 2 machine-generated Thrift RPC files (`AccumuloProxy`,
   `ThriftHiveMetastore`) and `cognitive_complexity` is absent for trivial files. Metrics
   are computed only over files where a tool produced a value.

---

## Bottom line (honest)

- **On detecting human-perceived code smells (MLCQ), our tool is the top performer of the
  four runnable analyzers — but it ties lizard within statistical noise and leads
  SonarQube/PMD only modestly.** All four are real, above-chance smell detectors.
- **On predicting real logic bugs (Defects4J), our tool — like a pure complexity
  baseline — is at chance.** Structural health is not a bug oracle; we report this null
  result plainly.
- **The most direct conceptual competitor, CodeScene Code Health, could not be run** (it
  is license-gated), so there is no head-to-head number for it here, and we did not invent
  one.

---

## Reproduction

```bash
# 1. raw per-file signals for our tool + lizard + pmd (harness agent output)
#    benchmark-data/competitive-raw.json   (gitignored)
# 2. real PMD run over all MLCQ files:
tools/pmd-bin-7.10.0/bin/pmd check -d benchmark-data/mlcq/java_files \
  -R rulesets/java/quickstart.xml -f csv --no-progress > benchmark-data/_pmd-violations.csv
# 3. real SonarQube scan (batched; Java sensor needs sonar.java.binaries and OOMs on
#    2 generated files — scanned in chunks, 339/341 files succeed):
docker run -d --name sonarqube-bench -p 9000:9000 sonarqube:community
node scripts/benchmarks/collect-sonar-measures.mjs   # -> benchmark-data/_sonar-measures.json
# 4. compute all metrics (AUROC, bootstrap CI, Mann-Whitney, best-F1):
node scripts/benchmarks/competitive-metrics.mjs       # -> benchmark-data/competitive-metrics.json
```

All AUROC / bootstrap-CI / Mann–Whitney math uses this repo's own
`packages/core/src/validation/correlation.ts` (`computeAUROC`, `bootstrapAUROC`,
`mannWhitneyU`).
