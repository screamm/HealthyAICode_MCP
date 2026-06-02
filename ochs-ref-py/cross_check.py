#!/usr/bin/env python3
"""
cross_check.py — cross-implementation agreement report for OCHS v0.1.

Compares, per fixture file:
  - the CLEAN-ROOM Python OCHS score (ochs_ref.compute_ochs), computed live here
  - the REFERENCE core-engine OCHS score (read from core_reference.json, which
    was produced by core_reference.mjs calling @healthy-ai-code/core as a black box)

Emits:
  1. A per-file agreement table (Python score | core score | Δ | match class).
  2. A per-file smell-vector diff (which biomarker types each side fired, and the
     count, so divergences can be explained).
  3. Aggregate agreement statistics.

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
        py_score = round(py["score"], 4)
        core_score = round(float(core["score"]), 4)
        delta = abs(py_score - core_score)
        rows.append({
            "file": f,
            "py_score": py_score,
            "core_score": core_score,
            "delta": round(delta, 4),
            "match": match_class(delta),
            "py_smells": py["smellCounts"],
            "core_smells": core["smellCounts"],
        })

    # ── Table 1: score agreement ──
    print("=" * 96)
    print("OCHS v0.1 CROSS-IMPLEMENTATION AGREEMENT  —  Python clean-room vs @healthy-ai-code/core")
    print("=" * 96)
    print(f"{'fixture':<38}{'Python':>9}{'core':>9}{'Δ':>8}  match")
    print("-" * 96)
    for r in rows:
        print(f"{r['file']:<38}{r['py_score']:>9.4f}{r['core_score']:>9.4f}{r['delta']:>8.4f}  {r['match']}")
    print("-" * 96)

    n = len(rows)
    exact = sum(1 for r in rows if r["match"] == "EXACT")
    close = sum(1 for r in rows if r["match"] == "CLOSE")
    divergent = sum(1 for r in rows if r["match"] == "DIVERGENT")
    within_close = exact + close
    mean_abs = sum(r["delta"] for r in rows) / n if n else 0.0
    cat_match = sum(1 for r in rows
                    if ochs_ref.category_from_score(r["py_score"]) ==
                       ochs_ref.category_from_score(r["core_score"]))
    print(f"n={n}   EXACT={exact}   CLOSE(<=0.5)={close}   DIVERGENT(>0.5)={divergent}")
    print(f"within-0.5 agreement = {within_close}/{n} = {100*within_close/n:.1f}%")
    print(f"exact agreement      = {exact}/{n} = {100*exact/n:.1f}%")
    print(f"mean |Δ|             = {mean_abs:.4f}")
    print(f"category agreement   = {cat_match}/{n} = {100*cat_match/n:.1f}%")
    print()

    # ── Table 2: smell-vector divergences ──
    print("=" * 96)
    print("PER-FILE SMELL-VECTOR DIVERGENCE  (type: pyCount vs coreCount; '*' = only one side fired)")
    print("=" * 96)
    for r in rows:
        types = sorted(set(r["py_smells"]) | set(r["core_smells"]))
        diffs = []
        for t in types:
            pc = r["py_smells"].get(t, 0)
            cc = r["core_smells"].get(t, 0)
            mark = "" if pc == cc else "  <-- DIFF"
            only = "*" if (pc == 0) ^ (cc == 0) else " "
            if pc != cc:
                diffs.append(f"    {only}{t:<32} py={pc}  core={cc}{mark}")
        if diffs:
            print(f"\n{r['file']}  (Δ={r['delta']:.4f}, {r['match']})")
            for d in diffs:
                print(d)
        else:
            print(f"\n{r['file']}  (Δ={r['delta']:.4f}, {r['match']}) — identical smell vector")
    print()

    # ── Spec gaps exercised ──
    print("=" * 96)
    print("SPEC GAPS EXERCISED DURING DETECTION  (specification under-specifies these biomarkers)")
    print("=" * 96)
    for bm, note in sorted(ochs_ref.SPEC_GAPS.items()):
        print(f"\n[{bm}]")
        print(f"  {note}")

    print("\n" + "=" * 96)
    print("BIOMARKERS NOT IMPLEMENTABLE FROM THE SPEC ALONE (require undistributed external data)")
    print("=" * 96)
    for bm, note in sorted(ochs_ref.NOT_IMPLEMENTABLE_FROM_SPEC.items()):
        print(f"\n[{bm}]")
        print(f"  {note}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
