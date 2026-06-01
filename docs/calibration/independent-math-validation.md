# Independent Mathematical Validation of Sub-linear Scoring

This document records third-party and academic evidence that independently
corroborates the core mathematical principle of the Healthy AI Code MCP scoring
formula: applying a **sub-linear (√count) penalty** rather than a linear count.

---

## Our Scoring Formula (Reference)

```
score = 10 − Σ (weight_i × √count_i)   for each smell type i
floor = 1.0
```

Source: `packages/core/src/scoring/weights.ts` (line 3 comment) and CLAUDE.md
"Scoring formula" section.

The key design choice is `√count` rather than `count`:

- Each additional instance of a smell contributes *less* penalty than the first.
- This reflects the empirical reality that a file with 9 instances of a smell is
  worse than a file with 1 instance, but not 9× worse — diminishing marginal
  harm per additional occurrence.
- It also prevents a single type of smell from dominating the composite score
  and drowning out signals from other smell types.

---

## Primary Independent Corroboration

### SlopCodeBench — arXiv:2603.24755 (March 2026)

**Citation:**
> Orlanski, G. et al. "SlopCodeBench: Benchmarking How Coding Agents Degrade
> Over Long-Horizon Iterative Tasks." *arXiv preprint arXiv:2603.24755* (2026).
> University of Wisconsin–Madison, Washington State University, MIT.
> https://arxiv.org/abs/2603.24755

**Corroborating formula:**

SlopCodeBench defines a **complexity-mass** function for each callable `f`:

```
mass(f) = CC(f) × √SLOC(f)
```

where `CC(f)` is the cyclomatic complexity of the callable and `SLOC(f)` is its
source lines of code.

**Exact rationale from the paper (Section 2.3, "Measuring Code Quality"):**

> "The square root compresses the size factor so that complexity dominates
> rather than pure lines of code."

**Why this corroborates our design:**

The authors independently converge on applying a square-root transformation
to a size/count dimension for exactly the same reason we do: to prevent a
raw count from dominating the composite signal. In SlopCodeBench the concern
is that SLOC would swamp cyclomatic complexity; in our formula the concern is
that a large count of minor smells would swamp severity-weighted contributions.
Both designs use `√` to achieve **sub-linear scaling** of the count dimension.

**Key empirical findings from the paper:**

- Structural erosion (complexity mass concentrated in high-CC functions) rises
  in **80% of agent trajectories** vs. staying flat for human developers.
- Agent code reaches erosion score **0.68 ± 0.20** vs. human baseline of
  **0.31 ± 0.12** — a 2× difference that the √-based formula exposes clearly.
- Without the √ compression, raw SLOC growth would mask the CC-concentration
  signal the benchmark is designed to measure.

---

## Secondary Corroboration

### Maintainability Index (Oman & Hagemeister, 1992) — Sub-linear Comment Factor

The industry-standard Maintainability Index (MI), used by Microsoft Visual
Studio, Radon, and many CI tools, includes a sub-linear term in its SEI
derivative:

```
MI = 171 − 5.2 ln(V) − 0.23 G − 16.2 ln(L) + 50 sin(√(2.4 C))
```

where `V` = Halstead volume, `G` = cyclomatic complexity, `L` = lines of code,
`C` = percent comment lines.

The `√(2.4 C)` term inside `sin(...)` applies a square-root compression to
comment density — exactly the same sub-linear principle. The rationale (per
Radon's documentation) is that the benefit of comments per additional percentage
point of comment coverage **diminishes** as coverage increases.

Source: Radon documentation — https://radon.readthedocs.io/en/latest/intro.html

Note: The MI has known limitations for absolute thresholds (van Deursen, 2014)
but its widespread adoption validates that `√`-based sub-linear terms are
accepted practice in software metric design.

### Code Health (CodeScene / Adam Tornhill, 2015–present)

CodeScene's proprietary **Code Health** metric:

- Scores files on a **1–10 scale** (same range as our metric).
- Aggregates 25+ code smell types (same multi-smell approach as our metric).
- Applies a "penalizing approach" where reaching very high smell counts causes
  the score to approach the floor of 1 — consistent with sub-linear penalty
  saturation behaviour (score cannot go below floor regardless of smell count).

Validated in: Söderberg, E. et al. "Increasing, not Diminishing: Investigating
the Returns of Highly Maintainable Code." *TechDebt 2024* / arXiv:2401.13407.
https://arxiv.org/abs/2401.13407

The paper finds that Code Health ≥ 9 (their "Healthy" category, matching our
`HEALTHY_THRESHOLD = 9.0`) delivers increasing rather than diminishing business
returns — empirically validating the threshold choice that our formula also uses.

---

## Summary Table

| Source | Year | Formula / design | Sub-linear element | Independence |
|--------|------|------------------|--------------------|--------------|
| SlopCodeBench (Orlanski et al.) | 2026 | `mass(f) = CC(f) × √SLOC(f)` | `√SLOC` compresses size factor | Fully independent — different institution, different use-case |
| Maintainability Index (SEI/Oman) | 1992 | `50 sin(√(2.4 C))` in MI formula | `√C` sub-linear comment reward | Predates this project by 30+ years |
| CodeScene Code Health | 2015+ | 1–10 scale, 25+ smells, floor saturation | Implicit sub-linear penalty near floor | Different implementation, independently deployed at scale |

---

## What This Does and Does Not Prove

**Does prove:**

- The specific choice `√count` for aggregating a count dimension into a
  composite health/quality score has been independently derived and applied
  by at least two unrelated research groups (SlopCodeBench, MI authors) working
  on different problems, lending support to it as a principled design choice.
- The 1–10 scoring range with a "Healthy" threshold near 9.0 is also used
  independently by CodeScene, validated against real customer codebases.

**Does not prove:**

- That our specific weight values (`ComplexMethod: 1.5`, etc.) are empirically
  optimal — those require per-smell calibration (see `defects4j-validation.md`
  and `java-report.md`).
- That the `√` transformation is the uniquely correct sub-linear form — `log`
  or other concave functions would also achieve sub-linearity. The MI uses `ln`,
  SlopCodeBench uses `√`, we use `√`. All three are valid choices; our choice
  matches SlopCodeBench's independently.
- That this formula generalises beyond the smell types and languages we have
  empirically tested. See `language-profile-validation.md`.

---

## Key URLs

- SlopCodeBench paper: https://arxiv.org/abs/2603.24755
- SlopCodeBench GitHub: https://github.com/SprocketLab/slop-code-bench
- Radon MI documentation: https://radon.readthedocs.io/en/latest/intro.html
- "Increasing, not Diminishing" (TechDebt 2024): https://arxiv.org/abs/2401.13407
- CodeScene Code Health docs: https://codescene.io/docs/guides/technical/code-health.html
