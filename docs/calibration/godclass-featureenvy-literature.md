# God Class & Feature Envy — Literature Thresholds

Reference document for Sprint recalibration work. Summarises canonical detection strategies,
the metric thresholds proposed or adopted by each source, and a recommended range for
this project's own threshold choices.

---

## 1. Canonical Detection Strategies

### 1.1 God Class (Lanza & Marinescu 2006)

The reference definition comes from **Michele Lanza and Radu Marinescu, *Object-Oriented
Metrics in Practice*, Springer 2006** (pp. 80, 16–18).

Detection rule — a class is a God Class when **all three** hold simultaneously:

```
(ATFD > FEW)  AND  (WMC >= VERY_HIGH)  AND  (TCC < ONE_THIRD)
```

| Metric | Symbol | Value | Threshold type |
|--------|--------|-------|----------------|
| Access To Foreign Data | ATFD | > 5 | Generally-accepted meaning (FEW = 2–5) |
| Weighted Method Count | WMC | >= 47 | Statistics-based — derived from 45 Java projects |
| Tight Class Cohesion | TCC | < 0.333 (1/3) | Common-fraction threshold |

The WMC = 47 "Very High" value was derived empirically from the 45-project corpus.  
ATFD "Few" was set to the upper bound of the 2–5 range (> 5 means at least 6 foreign accesses).  
TCC "One Third" is a natural cohesion floor (fewer than one-third of method pairs share fields).

Source URLs:
- [ResearchGate — Object-Oriented Metrics in Practice](https://www.researchgate.net/publication/220692125_Object-Oriented_Metrics_in_Practice_Using_Software_Metrics_to_Characterize_Evaluate_and_Improve_the_Design_of_Object-Oriented_Systems)
- [Google Books listing](https://books.google.com/books/about/Object_Oriented_Metrics_in_Practice.html?id=gdLbgnaMaa0C)
- [Springer reading-sample PDF (excerpt)](https://beckassets.blob.core.windows.net/product/readingsample/187724/9783540244295_excerpt_001.pdf)

---

### 1.2 Feature Envy (Lanza & Marinescu 2006 / Fowler 1999)

**Fowler's original description** (Martin Fowler, *Refactoring*, 1999): "A classic smell is a
method that seems more interested in a class other than the one it is in. The most common
focus of the envy is the data."  No numeric thresholds; purely qualitative.

**Marinescu's metric-based operationalisation** (same 2006 book, and original 2001 ICSM paper):

Detection rule — a method exhibits Feature Envy when **all three** hold:

```
(ATFD > FEW)  AND  (LAA < ONE_THIRD)  AND  (FDP <= FEW)
```

| Metric | Symbol | Value | Threshold type |
|--------|--------|-------|----------------|
| Access To Foreign Data | ATFD | > 5 | Generally-accepted meaning (FEW = 2–5) |
| Locality of Attribute Accesses | LAA | < 0.333 | Common-fraction threshold (One Third) |
| Foreign Data Providers | FDP | <= 3 | Generally-accepted meaning (FEW = 3 here) |

LAA = (method-local attribute accesses) / (total attribute accesses in method).  
A method that accesses more foreign than local attributes (LAA < 1/3) with concentrated
foreign coupling (FDP <= 3, meaning the foreign accesses come from at most a few other classes)
is a strong candidate.

Source URLs:
- [Simple Oriented Architecture — How to identify Feature Envy using NDepend](http://www.simpleorientedarchitecture.com/how-to-identify-feature-envy-using-ndepend/)
- [refactoring.guru — Feature Envy description](https://refactoring.guru/smells/feature-envy)

---

## 2. Tool Defaults

### 2.1 PMD (Java, open source)

PMD's `GodClass` rule (introduced PMD 6.0, December 2017; maintained to current 7.x) uses
**exactly the Lanza/Marinescu values** with no configurability exposed in the public API:

```java
// GodClassRule.java (main branch, verified 2026-05)
private static final int    WMC_VERY_HIGH       = 47;
private static final int    FEW_ATFD_THRESHOLD  = 5;
private static final double TCC_THRESHOLD       = 1.0 / 3.0;  // 0.333...

// Violation when:
if (wmc >= WMC_VERY_HIGH && atfd > FEW_ATFD_THRESHOLD && tcc < TCC_THRESHOLD) { ... }
```

The rule cites Lanza 2006 p. 80 as its sole reference.  PMD does not implement a
standalone Feature Envy rule; the smell is partially captured by coupling rules.

Source URL:
- [PMD GodClassRule.java (GitHub)](https://github.com/pmd/pmd/blob/main/pmd-java/src/main/java/net/sourceforge/pmd/lang/java/rule/design/GodClassRule.java)
- [PMD Java design rules documentation](https://pmd.github.io/pmd/pmd_rules_java_design.html)

---

### 2.2 JDeodorant / IntelliJDeodorant (Java)

Fokaefs, Tsantalis & Chatzigeorgiou (2007/2009) implemented Feature Envy detection as a
distance-based entity-placement problem, not as a fixed-threshold rule:

- A method is "feature-envious" when its **distance to another class is smaller than its
  distance to its own class**, where distance is computed from shared attribute/method accesses.
- The 2009 IEEE TSE paper (doi:10.1109/TSE.2009.1) formalised this as a refactoring-opportunity
  recommender rather than a threshold check.
- God Class (Blob) detection was added later using the Lanza/Marinescu rule set.

There are **no published fixed numeric thresholds** for JDeodorant's Feature Envy detection;
the algorithm ranks candidates by distance score and presents the top-k.

Source URLs:
- [JDeodorant IEEE (2007)](https://ieeexplore.ieee.org/document/4362679/)
- [Identification of Move Method Refactoring Opportunities — TSE 2009](https://www.researchgate.net/publication/220071038_Identification_of_Move_Method_Refactoring_Opportunities)
- [IntelliJDeodorant (JetBrains Research, GitHub)](https://github.com/JetBrains-Research/IntelliJDeodorant)

---

### 2.3 NDepend (.NET)

NDepend exposes configurable thresholds for its God Object heuristic (as of 2023 docs):

| Parameter | Default |
|-----------|---------|
| max_lines (LOC) | 500 |
| max_methods | 20 |
| max_fields | 20 |
| max_complexity | 150 |
| max_traits (responsibilities) | configurable |

NDepend also supports the ATFD/WMC/TCC strategy via custom CQLinq queries.

Source URL:
- [Simple Oriented Architecture — How to identify a God Class using NDepend](https://simpleorientedarchitecture.com/how-to-identify-god-class-using-ndepend/)
- [NDepend .NET code metrics reference](https://www.ndepend.com/docs/code-metrics)

---

### 2.4 SonarQube

SonarQube does not implement the Lanza/Marinescu God Class rule natively. It proxies
class-level complexity through:

- Cognitive Complexity per method: default threshold **15** (rule `java:S3776`)
- No built-in class-level WMC or ATFD rule in the default quality profile

Source URL:
- [SonarQube Cognitive Complexity rule (java:S3776)](https://next.sonarqube.com/sonarqube/coding_rules?open=java%3AS3776&rule_key=java%3AS3776)

---

### 2.5 CodeScene

CodeScene detects God Objects as part of its Code Health metric suite (1–10 scale, where
< 5 = very poor). Exact thresholds are not published; they are tuned on proprietary
industry data. The tool allows partial threshold override via `.codescene/code-health-rules.json`.

Source URL:
- [CodeScene Code Health documentation](https://codescene.io/docs/guides/technical/code-health.html)
- [Customising code-health-rules.json](https://helpcenter.codescene.com/articles/0926097-how-to-customize-code-health-rules-with-codescenecode-health-rulesjson)

---

### 2.6 Reek (Ruby)

Reek detects Feature Envy as: "a method that refers to `self` less often than it refers to
some other object". No fixed numeric threshold is exposed in the public docs; the rule fires
whenever the count of foreign-object message sends exceeds the count of self sends.

Source URL:
- [Reek Feature Envy documentation (GitHub)](https://github.com/troessner/reek/blob/master/docs/Feature-Envy.md)

---

## 3. Empirical Benchmark Studies

### 3.1 Alves et al. 2010 — Deriving Metric Thresholds from Benchmark Data (ICSM 2010)

Alves, Ypma & Visser proposed a **percentile-based method** for deriving thresholds from a
benchmark of 100 Java/C# systems. Key conclusions relevant to this project:

- Rather than fixed absolute values, they advocate thresholds at the **70th, 80th, and 90th
  percentile** of metric distributions measured across a broad corpus.
- The method is resilient to outliers and accounts for differences in distribution shape.
- Systems differentiate most in the **tail** of the distribution, justifying high-percentile
  thresholds (> 70th) for high-precision detection.
- For WMC, the 90th-percentile boundary in their corpus fell in the range 30–50, consistent
  with the Lanza/Marinescu WMC = 47 value.

The paper does not publish per-smell thresholds for God Class or Feature Envy directly, but
its methodology is the standard reference for benchmark-based calibration.

Source URLs:
- [Alves et al. 2010 — ACM DL](https://dl.acm.org/doi/10.1109/ICSM.2010.5609747)
- [Full PDF (UMinho archive)](https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/AlvesYpmaVisserICSM2010.pdf)
- [ResearchGate](https://www.researchgate.net/publication/224185200_Deriving_metric_thresholds_from_benchmark_data)

---

### 3.2 Palomba et al. — HIST and JDeodorant Comparison

Palomba et al. compared HIST (history-based detection) with JDeodorant for Feature Envy
and related smells on manually-labelled ground truth. Key precision/recall numbers reported
across studies:

| Tool | Smell | Precision | Recall | F1 |
|------|-------|-----------|--------|-----|
| HIST | Feature Envy | 71–86 % | 58–100 % | 64–92 % |
| JDeodorant | Feature Envy | ~65 % | ~71 % | ~68 % |

The wide range reflects different evaluation datasets and inclusion criteria.  
For God Class, a decision-tree classifier (using WMC, ATFD, TCC + LOC) achieved:
- Accuracy 98.2 %, Precision 81.8 %, Recall 90 % (Padhy et al. 2021 on MLCQ subset)

Source URLs:
- [Palomba et al. — Mining Version Histories for Detecting Code Smells (J1)](https://fpalomba.github.io/pdf/Journals/J1.pdf)
- [Palomba et al. — Detecting Bad Smells Using Change History Information](https://fpalomba.github.io/pdf/Conferencs/C2.pdf)
- [Ten Years of JDeodorant: Lessons Learned (SANER 2018)](https://users.encs.concordia.ca/~nikolaos/publications/SANER_MIP_2018.pdf)

---

### 3.3 MLCQ Dataset (Trautsch et al. 2020)

The MLCQ benchmark (industry-relevant, 26 professional reviewers, ~15 000 samples, four smells:
Feature Envy, Long Method, Data Class, Blob/God Class) is the **largest fully manually-labelled
and fully reproducible** code smell dataset available as of 2026.

Evaluation of heuristic tools on MLCQ shows that classic threshold-based approaches (PMD,
Organic, JDeodorant) achieve F1 scores of **0.30–0.55** for God Class and Feature Envy —
substantially below ML/DL baselines (0.53–0.94 for God Class depending on model).

The low heuristic F1 is partly attributable to the strict ALL-THREE-conditions conjunction in
the Lanza/Marinescu rule, which trades high precision for reduced recall.

Source URL:
- [MLCQ dataset paper (ResearchGate)](https://www.researchgate.net/publication/341126384_MLCQ_Industry-Relevant_Code_Smell_Data_Set)
- [SmellyCode++ (2025 extension study, PMC open access)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12255726/)

---

### 3.4 Diffuseness Study — Palomba et al. 2018 (EMSE)

Analysis of 395 releases of 30 Java systems found:
- God Class appeared in **65 %** of releases.
- Feature Envy appeared in a significant fraction of releases.
- Detection thresholds used: LOC > 500 (very conservative God Class floor); Feature Envy
  required that a method has more relationships toward another class than its own.

Source URL:
- [On the Diffuseness and Impact on Maintainability (Springer EMSE)](https://link.springer.com/article/10.1007/s10664-017-9535-z)

---

## 4. Summary Threshold Table

All values reference the **method-level** (Feature Envy) or **class-level** (God Class) unit.

### God Class

| Metric | Lanza/Marinescu 2006 | PMD (as-shipped) | NDepend default | Notes |
|--------|----------------------|------------------|-----------------|-------|
| WMC | >= 47 | >= 47 | n/a (uses LOC) | Statistics-based (45-project Java corpus) |
| ATFD | > 5 | > 5 | n/a | FEW defined as 2–5; > 5 means >= 6 |
| TCC | < 0.333 | < 0.333 | n/a | 1/3 cohesion floor |
| LOC | not used | not used | > 500 | NDepend alternative heuristic |
| NOM | not used | not used | > 20 | NDepend alternative heuristic |

Conjunction: **ALL THREE** of WMC/ATFD/TCC must hold (high precision, moderate recall).

### Feature Envy

| Metric | Lanza/Marinescu 2006 | JDeodorant | Reek (Ruby) | Notes |
|--------|----------------------|------------|-------------|-------|
| ATFD | > 5 | not fixed | n/a | Same FEW = 2–5 definition |
| LAA | < 0.333 | not fixed | equivalent | Locality of Attribute Accesses |
| FDP | <= 3 | not fixed | n/a | Foreign Data Providers; FEW here = 3 |

JDeodorant uses a distance-ranking approach with no fixed threshold.  
Reek uses a counts comparison (self references vs. other-object references) with no published value.

---

## 5. Recommended Ranges for This Project

These ranges are derived from the literature review. They should be treated as **starting
boundaries** for a threshold sweep on the MLCQ holdout split — not as pre-selected final values.

### God Class

| Metric | Conservative (high precision) | Balanced | Permissive (high recall) |
|--------|-------------------------------|----------|--------------------------|
| WMC | >= 47 (Lanza canonical) | >= 35 | >= 20 |
| ATFD | > 5 | > 4 | > 2 |
| TCC | < 0.33 | < 0.40 | < 0.50 |
| LOC (secondary) | > 500 | > 300 | > 150 |

**Recommendation:** Start from the Lanza/Marinescu canonical values (WMC >= 47, ATFD > 5,
TCC < 0.33). Lower WMC to **35** and ATFD to **> 3** as a balanced alternative if recall
on MLCQ is below 0.50 at the canonical settings. All-three-conditions conjunction is standard;
consider OR-based relaxation only if F1 is below 0.40 on the holdout.

### Feature Envy

| Metric | Conservative | Balanced | Permissive |
|--------|--------------|----------|------------|
| ATFD | > 5 | > 3 | > 1 |
| LAA | < 0.33 | < 0.40 | < 0.50 |
| FDP | <= 3 | <= 4 | <= 5 |

**Recommendation:** Use the canonical Lanza/Marinescu values (ATFD > 5, LAA < 0.33, FDP <= 3)
as the baseline. Feature Envy is harder to detect than God Class (lower inter-rater agreement,
lower heuristic F1 on MLCQ). If MLCQ holdout recall is below 0.40, relax ATFD to **> 3** and
LAA to **< 0.40** individually before loosening FDP. Avoid relaxing all three simultaneously
as this inflates false positives substantially.

---

## 6. Calibration Notes

- The Lanza/Marinescu WMC = 47 was calibrated on **Java** code (45-project corpus ca. 2004).
  Other languages with different class conventions (e.g. Python modules, Go structs) may need
  lower thresholds (WMC 25–35 range).
- For the MLCQ benchmark in this project (`benchmark-data/mlcq/`) all files are Java; the
  canonical Java thresholds apply directly.
- Recalibration MUST be validated on the held-out split, not on the training partition used for
  threshold optimisation (see `docs/calibration/holdout-methodology.md`).
- Per the Alves et al. 2010 methodology, if the WMC distribution of the MLCQ corpus is
  significantly lower than the original 45-project corpus, the 90th-percentile WMC threshold
  should be recomputed from the training split rather than imported directly from Lanza/Marinescu.

---

## 7. Key References (with URLs)

| Citation | URL |
|----------|-----|
| Lanza & Marinescu 2006 — Object-Oriented Metrics in Practice | https://www.researchgate.net/publication/220692125_Object-Oriented_Metrics_in_Practice_Using_Software_Metrics_to_Characterize_Evaluate_and_Improve_the_Design_of_Object-Oriented_Systems |
| Lanza & Marinescu 2006 — Springer reading sample (PDF) | https://beckassets.blob.core.windows.net/product/readingsample/187724/9783540244295_excerpt_001.pdf |
| Fowler 1999 — Refactoring (Feature Envy description) | https://refactoring.guru/smells/feature-envy |
| PMD GodClassRule.java (source) | https://github.com/pmd/pmd/blob/main/pmd-java/src/main/java/net/sourceforge/pmd/lang/java/rule/design/GodClassRule.java |
| PMD Java design rules (docs) | https://pmd.github.io/pmd/pmd_rules_java_design.html |
| Alves, Ypma & Visser 2010 — Deriving Metric Thresholds (ICSM) | https://dl.acm.org/doi/10.1109/ICSM.2010.5609747 |
| Alves et al. 2010 — Full PDF (UMinho) | https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/AlvesYpmaVisserICSM2010.pdf |
| Fokaefs, Tsantalis & Chatzigeorgiou 2007 — JDeodorant Feature Envy (IEEE) | https://ieeexplore.ieee.org/document/4362679/ |
| Tsantalis & Chatzigeorgiou 2009 — Move Method Refactoring (TSE) | https://www.researchgate.net/publication/220071038_Identification_of_Move_Method_Refactoring_Opportunities |
| IntelliJDeodorant (GitHub) | https://github.com/JetBrains-Research/IntelliJDeodorant |
| Palomba et al. — Mining Version Histories (HIST) | https://fpalomba.github.io/pdf/Journals/J1.pdf |
| Palomba et al. — Detecting Bad Smells via Change History | https://fpalomba.github.io/pdf/Conferencs/C2.pdf |
| Palomba et al. 2018 — Diffuseness & Maintainability (EMSE) | https://link.springer.com/article/10.1007/s10664-017-9535-z |
| Di Nucci & Palomba 2018 — Code Smells via ML | https://www.researchgate.net/publication/323880077_Detecting_Code_Smells_using_Machine_Learning_Techniques_Are_We_There_Yet |
| Trautsch et al. 2020 — MLCQ dataset | https://www.researchgate.net/publication/341126384_MLCQ_Industry-Relevant_Code_Smell_Data_Set |
| SmellyCode++ 2025 (PMC open access) | https://pmc.ncbi.nlm.nih.gov/articles/PMC12255726/ |
| Simple Oriented Architecture — God Class via NDepend | https://simpleorientedarchitecture.com/how-to-identify-god-class-using-ndepend/ |
| Simple Oriented Architecture — Feature Envy via NDepend | http://www.simpleorientedarchitecture.com/how-to-identify-feature-envy-using-ndepend/ |
| SonarQube Cognitive Complexity rule (java:S3776) | https://next.sonarqube.com/sonarqube/coding_rules?open=java%3AS3776&rule_key=java%3AS3776 |
| CodeScene Code Health docs | https://codescene.io/docs/guides/technical/code-health.html |
| Reek Feature Envy (GitHub docs) | https://github.com/troessner/reek/blob/master/docs/Feature-Envy.md |
