#!/usr/bin/env python3
"""
cross_check.py — cross-implementation agreement report for OCHS v0.1.

Compares, per fixture file:
  - the CLEAN-ROOM Python OCHS score (ochs_ref.compute_ochs), computed live here
  - the REFERENCE core-engine OCHS score (read from core_reference.json, which
    was produced by core_reference.mjs calling @healthy-ai-code/core as a black box)

AGREEMENT IS MEASURED OVER THE STRUCTURAL SUBSET (§2.4 "reproducible from this
spec alone"): the per-function/file/design/control-flow biomarkers plus SATD,
MagicNumber, BumpyRoad, DuplicateCode and the composite indices. Biomarkers that
Appendix D HONESTLY ANNEXES as NOT reproducible from the prose alone — because
they need a registry snapshot (D.1), git/project history (D.2), or a shared
curated pattern/SDK inventory (D.3) — are EXCLUDED from the structural-agreement
metric and reported separately. This is the honest comparison: it measures
whether the spec's PUBLISHED detection rules converge, not whether two
implementations happen to ship the same curated sink/SDK list.

The FULL-score table (all biomarkers) is also shown for completeness, but it is
NOT the headline metric — a full-score divergence driven solely by an annexed
biomarker is expected and is not a spec-reproducibility failure.

Emits:
  1. STRUCTURAL-SUBSET agreement table + aggregate stats  (the headline).
  2. Full-score table (all biomarkers) for completeness.
  3. Per-file smell-vector diff, marking annexed-only divergences.
  4. The list of annexed (not spec-reproducible) biomarkers.

Match classes:
  EXACT      |Δ| <= 0.0001
  CLOSE      |Δ| <= 0.5
  DIVERGENT  |Δ|  > 0.5
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import ochs_ref

# Force UTF-8 stdout so the Δ symbol renders on Windows code pages (cp1252).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
else:  # pragma: no cover
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = Path(__file__).parent
FIX = HERE / "fixtures"
CORE_REF = HERE / "core_reference.json"

EXACT_TOL = 0.0001
CLOSE_TOL = 0.5


def match_class(delta: float) -> str:
    if delta <= EXACT_TOL:
        return "EXACT"
    if delta <= CLOSE_TOL:
        return "CLOSE"
    return "DIVERGENT"


def structural_score(smell_counts: dict) -> float:
    """OCHS score computed over the STRUCTURAL subset only (§2.4).
    Annexed (Appendix D) biomarker counts are dropped before scoring."""
    structural = {t: c for t, c in smell_counts.items()
                  if t in ochs_ref.STRUCTURAL_BIOMARKERS}
    return round(ochs_ref.score_from_counts(structural), 4)


def main() -> int:
    core_ref = json.loads(CORE_REF.read_text(encoding="utf-8"))
    core_by_file = {r["file"]: r for r in core_ref["results"]}

    rows = []
    for f in sorted(p.name for p in FIX.glob("*.py")):
        source = (FIX / f).read_text(encoding="utf-8")
        py = ochs_ref.compute_ochs(source, f)
        core = core_by_file.get(f)
        if core is None:
            continue
        py_full = round(py["score"], 4)
        core_full = round(float(core["score"]), 4)
        py_struct = structural_score(py["smellCounts"])
        core_struct = structural_score(core["smellCounts"])
        sdelta = abs(py_struct - core_struct)
        fdelta = abs(py_full - core_full)
        # annexed types present on either side for this file
        annexed = sorted(t for t in (set(py["smellCounts"]) | set(core["smellCounts"]))
                         if t not in ochs_ref.STRUCTURAL_BIOMARKERS)
        rows.append({
            "file": f,
            "py_full": py_full, "core_full": core_full, "fdelta": round(fdelta, 4),
            "py_struct": py_struct, "core_struct": core_struct,
            "sdelta": round(sdelta, 4), "smatch": match_class(sdelta),
            "fmatch": match_class(fdelta),
            "py_smells": py["smellCounts"], "core_smells": core["smellCounts"],
            "annexed_present": annexed,
        })

    n = len(rows)

    # ── Table 1 (HEADLINE): STRUCTURAL-subset score agreement ──
    print("=" * 96)
    print("OCHS v0.1 STRUCTURAL-SUBSET AGREEMENT  —  Python clean-room vs @healthy-ai-code/core")
    print("  (§2.4 spec-reproducible biomarkers only; Appendix-D annexed biomarkers excluded)")
    print("=" * 96)
    print(f"{'fixture':<38}{'Python':>9}{'core':>9}{'Δ':>8}  match")
    print("-" * 96)
    for r in rows:
        print(f"{r['file']:<38}{r['py_struct']:>9.4f}{r['core_struct']:>9.4f}{r['sdelta']:>8.4f}  {r['smatch']}")
    print("-" * 96)

    s_exact = sum(1 for r in rows if r["smatch"] == "EXACT")
    s_close = sum(1 for r in rows if r["smatch"] == "CLOSE")
    s_div = sum(1 for r in rows if r["smatch"] == "DIVERGENT")
    s_within = s_exact + s_close
    s_mean = sum(r["sdelta"] for r in rows) / n if n else 0.0
    s_cat = sum(1 for r in rows
                if ochs_ref.category_from_score(r["py_struct"]) ==
                   ochs_ref.category_from_score(r["core_struct"]))
    print(f"n={n}   EXACT={s_exact}   CLOSE(<=0.5)={s_close}   DIVERGENT(>0.5)={s_div}")
    print(f"exact agreement      = {s_exact}/{n} = {100*s_exact/n:.1f}%   (prior: 33.3%)")
    print(f"within-0.5 agreement = {s_within}/{n} = {100*s_within/n:.1f}%   (prior: 80.0%)")
    print(f"category agreement   = {s_cat}/{n} = {100*s_cat/n:.1f}%   (prior: 80.0%)")
    print(f"mean |Δ|             = {s_mean:.4f}")
    l2 = (s_exact == n)
    print(f"L2 conformance (structural, exact on all fixtures): {'YES' if l2 else 'NO'}")
    print()

    # ── Table 2: FULL-score table (all biomarkers) for completeness ──
    print("=" * 96)
    print("FULL-SCORE TABLE (ALL biomarkers, incl. annexed)  —  for completeness, NOT the headline")
    print("=" * 96)
    print(f"{'fixture':<38}{'Python':>9}{'core':>9}{'Δ':>8}  match  annexed-driven?")
    print("-" * 96)
    for r in rows:
        # a full divergence is "annexed-driven" if structural matches but full does not
        ad = "yes (annexed only)" if (r["smatch"] == "EXACT" and r["fmatch"] != "EXACT") else ""
        print(f"{r['file']:<38}{r['py_full']:>9.4f}{r['core_full']:>9.4f}{r['fdelta']:>8.4f}  {r['fmatch']:<10}{ad}")
    print("-" * 96)
    f_exact = sum(1 for r in rows if r["fmatch"] == "EXACT")
    f_within = sum(1 for r in rows if r["fmatch"] in ("EXACT", "CLOSE"))
    f_cat = sum(1 for r in rows
                if ochs_ref.category_from_score(r["py_full"]) ==
                   ochs_ref.category_from_score(r["core_full"]))
    print(f"full-score exact = {f_exact}/{n} = {100*f_exact/n:.1f}%   within-0.5 = {f_within}/{n} = {100*f_within/n:.1f}%   category = {f_cat}/{n} = {100*f_cat/n:.1f}%")
    print()

    # ── Table 3: smell-vector divergences ──
    print("=" * 96)
    print("PER-FILE SMELL-VECTOR DIVERGENCE  (type: pyCount vs coreCount; '*' = only one side; [ANNEXED] = excluded from structural metric)")
    print("=" * 96)
    for r in rows:
        types = sorted(set(r["py_smells"]) | set(r["core_smells"]))
        diffs = []
        for t in types:
            pc = r["py_smells"].get(t, 0)
            cc = r["core_smells"].get(t, 0)
            if pc == cc:
                continue
            only = "*" if (pc == 0) ^ (cc == 0) else " "
            tag = "  [ANNEXED]" if t not in ochs_ref.STRUCTURAL_BIOMARKERS else "  <-- STRUCTURAL DIFF"
            diffs.append(f"    {only}{t:<32} py={pc}  core={cc}{tag}")
        if diffs:
            print(f"\n{r['file']}  (struct Δ={r['sdelta']:.4f} {r['smatch']}, full Δ={r['fdelta']:.4f} {r['fmatch']})")
            for d in diffs:
                print(d)
        else:
            print(f"\n{r['file']}  (struct Δ={r['sdelta']:.4f} {r['smatch']}) — identical smell vector")
    print()

    # ── Spec gaps exercised ──
    print("=" * 96)
    print("SPEC-GAP LEDGER (language-binding judgement calls only; numeric thresholds now in §2.1–§2.4)")
    print("=" * 96)
    if ochs_ref.SPEC_GAPS:
        for bm, note in sorted(ochs_ref.SPEC_GAPS.items()):
            print(f"\n[{bm}]\n  {note}")
    else:
        print("\n  (none exercised — all structural thresholds resolved from §2.1–§2.4)")

    print("\n" + "=" * 96)
    print("ANNEXED BIOMARKERS — NOT REPRODUCIBLE FROM THE PROSE SPEC ALONE (Appendix D)")
    print("  Excluded from the structural-agreement metric above. Categories: D.1 registry data,")
    print("  D.2 git/project history, D.3 shared curated pattern/SDK inventory, §2.1g index analyzers.")
    print("=" * 96)
    # which annexed biomarkers actually appeared in the fixtures
    appeared = sorted({t for r in rows for t in r["annexed_present"]})
    n_annex = len(ochs_ref.NOT_IMPLEMENTABLE_FROM_SPEC)
    n_struct = len(ochs_ref.STRUCTURAL_BIOMARKERS) + len(ochs_ref.STRUCTURAL_NOT_EXERCISED)
    print(f"\nBiomarker partition of the 55-type catalogue:")
    print(f"  structural / spec-reproducible (§2.4)   : {n_struct}")
    print(f"  annexed / NOT spec-reproducible (App. D) : {n_annex}")
    print(f"  total                                    : {n_struct + n_annex}")
    print(f"\nAnnexed biomarkers that DROVE a full-score divergence on these fixtures: "
          f"{', '.join(appeared) if appeared else '(none)'}")
    for bm, note in sorted(ochs_ref.NOT_IMPLEMENTABLE_FROM_SPEC.items()):
        print(f"\n[{bm}]\n  {note}")

    print("\n" + "=" * 96)
    print("STRUCTURAL BIOMARKERS REPRODUCIBLE FROM SPEC BUT NOT EXERCISED ON THESE FIXTURES")
    print("  (counted as structural / spec-reproducible; simply did not fire here)")
    print("=" * 96)
    for bm, note in sorted(ochs_ref.STRUCTURAL_NOT_EXERCISED.items()):
        print(f"\n[{bm}]\n  {note}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
