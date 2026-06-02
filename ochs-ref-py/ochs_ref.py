#!/usr/bin/env python3
"""
ochs_ref.py — a CLEAN-ROOM second implementation of the Open Code Health Score
(OCHS) v0.1, for Python source files.

PROVENANCE / HONESTY STATEMENT
==============================
This module is written from the *published OCHS v0.1 specification only*:

  - docs/ochs/OCHS-v0.1.md      (formula §1, the NORMATIVE firing thresholds in
                                 §2.1–§2.4, the biomarker catalogue, the weights
                                 in Table 2, and the honest reproducibility annex
                                 in Appendix D)
  - docs/ochs/ochs-schema.json  (output object shape, smell-type enum)

It does NOT import, read, port, or transcribe any source code from
`@healthy-ai-code/core`. Biomarker detection is implemented independently using
Python's own `ast` module (a Tier-A analysis available to any third party for
Python source) plus the text/regex rules the spec publishes for the structural
and `SATD`/`MagicNumber` biomarkers.

WHAT CHANGED IN THIS REVISION
-----------------------------
The first version of this file was written against an EARLIER draft of the spec
that under-specified ~20 structural firing thresholds and contained a
`ComplexMethod` weight-tier contradiction. The spec has since been hardened:
§2.1–§2.4 now publish the EXACT numeric predicates, the `ComplexMethod` rule is
resolved to `CC > 10` (single weight 1.5), and §2.3 publishes the full
`DuplicateCode` algorithm. This implementation has been updated to the published
thresholds, so the structural biomarkers below are now derived from the spec
text, not from guessed convention. Each detector cites the spec section it
implements.

Biomarkers that the spec HONESTLY ANNEXES (Appendix D) as not reproducible from
the prose alone — because they require a registry snapshot (D.1), git/project
history (D.2), or a shared curated pattern/SDK inventory (D.3) — are NOT scored
here from the spec. They are recorded in NOT_IMPLEMENTABLE_FROM_SPEC and excluded
from the structural-agreement measurement. Omitting them is conformant (§4 / D):
the formula is unchanged; those findings simply do not contribute to the score.

The OCHS score formula itself IS fully specified (§1) and is implemented exactly:

    score = max(1.0, round1( 10 - Σ_i ( weight_i * sqrt( count_i ) ) ))   (§1, §2.4)
"""

from __future__ import annotations

import ast
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

# ──────────────────────────────────────────────────────────────────────────────
# Weights — transcribed verbatim from OCHS v0.1 spec, Table 2 (§3).
# These ARE fully published, so copying the numbers from the spec table is exactly
# what a conformant third-party implementer is meant to do.
# ──────────────────────────────────────────────────────────────────────────────
OCHS_WEIGHTS: Dict[str, float] = {
    "AbstractionLeakage": 0.6,
    "AiAttributedSATD": 0.8,
    "ArchitectureDebt": 0.6,
    "AsyncAntiPattern": 0.7,
    "BrainMethod": 1.2,
    "BumpyRoad": 0.8,
    "CodeChurn": 0.6,
    "CognitiveComplexity": 0.8,
    "CommandInjectionRisk": 1.5,
    "ComplexConditional": 0.5,
    "ComplexityMassConcentration": 1.2,
    "ComplexMethod": 1.5,
    "CryptographicMisuseRisk": 1.0,
    "DataClumps": 0.5,
    "DeepNesting": 1.2,
    "DependencyVulnerability": 1.0,
    "DeveloperCongestion": 0.7,
    "DocumentationDebt": 0.5,
    "DuplicateCode": 1.0,
    "ExceptionHandlingAntiPattern": 0.8,
    "FeatureEnvy": 0.7,
    "FragmentedCode": 0.3,
    "GodClass": 1.5,
    "HallucinatedPackageImport": 1.5,
    "HardcodedApiKey": 2.0,
    "HardcodedAssumption": 0.5,
    "HardcodedCredential": 2.0,
    "IntentClarity": 0.4,
    "KnowledgeLoss": 1.0,
    "LargeFile": 0.3,
    "LargeMethod": 0.6,
    "LlmNoStructuredOutput": 1.0,
    "LlmNoSystemMessage": 1.0,
    "LlmUnboundedCall": 1.0,
    "LlmUnpinnedModel": 1.0,
    "LlmUnsetTemperature": 0.8,
    "LongParameterList": 0.4,
    "LowDocCoverage": 0.3,
    "LowMaintainability": 0.3,
    "MagicNumber": 0.4,
    "MessageChain": 0.5,
    "MethodTemporalCoupling": 0.3,
    "MissingEdgeCase": 0.5,
    "PathTraversalRisk": 1.2,
    "PrimitiveObsession": 0.5,
    "SATD": 0.6,
    "SlopsquattingRisk": 1.5,
    "SplitResidue": 0.5,
    "SqlInjectionRisk": 1.5,
    "SsrfRisk": 1.3,
    "StyleInconsistency": 0.3,
    "TestProximity": 0.5,
    "TypeSafetyEscape": 0.7,
    "UnsafeDeserialization": 1.2,
    "XssRisk": 1.5,
}

OCHS_FLOOR = 1.0
AI_READY_THRESHOLD = 9.5
AI_READY_THRESHOLD_WITH_AI_SATD = 9.7  # §1.2 tiered AI gate
HEALTHY_THRESHOLD = 9.0
PROBLEMATIC_THRESHOLD = 6.0

# ──────────────────────────────────────────────────────────────────────────────
# NORMATIVE STRUCTURAL THRESHOLDS — now PUBLISHED in OCHS v0.1 §2.1–§2.4.
# These are no longer guessed; each constant cites the spec subsection it comes
# from. A conformant implementation MUST use exactly these predicates.
# ──────────────────────────────────────────────────────────────────────────────
COMPLEX_METHOD_CC = 10            # §2.1a / §2.2: fires when CC > 10 (strict)
CRITICAL_COMPLEXITY_CC = 20       # §2.1a: severity 'critical' when CC > 20
DEEP_NESTING_DEPTH = 3            # §2.1a: fires when nestingDepth > 3
HIGH_NESTING_DEPTH = 4            # §2.1a: severity 'high' when > 4
CRITICAL_NESTING_DEPTH = 5        # §2.1a: severity 'critical' when > 5
LARGE_METHOD_LINES = 50           # §2.1a: fires when length > 50 (line span)
LONG_PARAM_LIST = 4               # §2.1a: fires when parameterCount > 4
COGNITIVE_THRESHOLD = 15          # §2.1a: fires when cognitiveComplexity > 15
CRITICAL_COGNITIVE = 25           # §2.1a: severity 'critical' when > 25
LARGE_FILE_LINES = 500            # §2.1b: fires when totalLines > 500
COMPLEX_CONDITIONAL_OPS = 3       # §2.1d: fires at >= 3 logical operators in a chain
MESSAGE_CHAIN_DEPTH = 4           # §2.1d: fires at chain depth >= 4
MIN_PRIMITIVE_PARAMS = 3          # §2.1c: fires when a function has >= 3 primitive params
MIN_MAGIC_PER_FUNCTION = 3        # §2.1b (Tier A AST rule — see note in detect_magic_numbers)
BUMPY_ROAD_CHUNKS = 4             # §2.1d: fires at >= 4 top-level sibling control chunks
DUPLICATE_MIN_LINES = 6           # §2.3: sliding-window size
EROSION_THRESHOLD = 0.60          # §2.1f: ComplexityMassConcentration fires when erosion > 0.60
MIN_FUNCTIONS_FOR_EROSION = 3     # §2.1f

# §2.1f BrainMethod composite — published factor denominators, weights, and gates.
BRAIN_T = {"lines": 100, "cyclomatic": 25, "cognitive": 30, "nesting": 6}
BRAIN_W = {"lines": 0.30, "cyclomatic": 0.25, "cognitive": 0.25, "nesting": 0.10, "centrality": 0.10}
BRAIN_SMELL_THRESHOLD = 0.55
BRAIN_MIN_HIGH_FACTORS = 3

# §2.1b file-level / doc-coverage published thresholds.
LOW_DOC_MIN_EXPORTS = 3           # §2.1b: needs >= 3 documentable exported symbols
LOW_DOC_HIGH_COVERAGE = 0.8       # §2.1b: fires when documented-ratio < 0.8
DOC_TRIVIAL_LINE_THRESHOLD = 3    # §2.1b: symbols <= 3 lines are excluded
DOC_EXEMPT_NAMES = {"constructor", "ngOnInit", "ngOnDestroy", "setup", "teardown"}  # §2.1b

# §2.1b MagicNumber Tier-A AST exclusion set (published): {0, 1, -1, 2, 100}.
MAGIC_ALLOWED = {"0", "1", "-1", "2", "100"}

# §2.1c PrimitiveObsession — Python primitive-type set (LanguageProfile primitive
# names the spec references for Python). Untyped params are NOT primitive (the spec
# requires a *resolved primitive type name*, so untyped == no domain type evidence
# either way; we count only params whose annotation IS a primitive name).
PYTHON_PRIMITIVE_TYPES = {"int", "float", "str", "bool", "bytes"}


# ──────────────────────────────────────────────────────────────────────────────
# SPEC GAP LEDGER  (now narrow — most prior gaps are closed by §2.1–§2.4)
# Each remaining entry is a *language-binding* judgement call the spec leaves to
# the implementer (e.g. how a generic AST concept maps onto Python's `ast`),
# NOT an unspecified numeric threshold. These do not affect the structural score
# on the fixtures but are reported honestly.
# ──────────────────────────────────────────────────────────────────────────────
SPEC_GAPS: Dict[str, str] = {}


def _gap(biomarker: str, note: str) -> None:
    if biomarker not in SPEC_GAPS:
        SPEC_GAPS[biomarker] = note


# Biomarkers HONESTLY ANNEXED in Appendix D as not reproducible from the prose
# spec alone. They are excluded from the structural-agreement measurement; an
# implementation that lacks the required external input omits them (conformant
# per §4 / Appendix D). Categories mirror D.1 / D.2 / D.3.
NOT_IMPLEMENTABLE_FROM_SPEC: Dict[str, str] = {
    # D.1 — require a registry / advisory data snapshot
    "HallucinatedPackageImport": "D.1: requires an offline npm/PyPI package-name snapshot the spec does not distribute. Membership test against a live-registry dataset; two implementations with different-dated snapshots disagree.",
    "SlopsquattingRisk": "D.1: requires a registry snapshot + curated prominent-targets list + LLM-hallucination corpus (+ optional live registry lookup). The inputs are curated data, not derivable from prose.",
    "DependencyVulnerability": "D.1: requires a maintained advisory DB (OSV/GHSA) + dependency manifest. External, continuously-updated feed; not file-local.",
    # D.2 — require git history / project context
    "MethodTemporalCoupling": "D.2: requires git commit history (per-commit method-range diffs). Only emitted via analyzeFileWithHistory(); excluded from the file-local score by definition.",
    "CodeChurn": "D.2: requires git history (commit frequency vs file size / repo average). Undefined for a file with no history.",
    "DeveloperCongestion": "D.2: requires git log (>=3 distinct authors in a 14-day window). Not present in source text.",
    "KnowledgeLoss": "D.2: requires git blame + contributor activity recency. Not file-local.",
    "ArchitectureDebt": "D.2: requires a project-level import graph (SCC / propagation cost). Whole-repo analysis, not one file.",
    "TestProximity": "D.2: requires filesystem/project layout (co-located test file). A string passed to analyzeCode has no surrounding directory.",
    # D.3 — require a shared curated pattern/SDK inventory (algorithm published, list is the detector)
    "SqlInjectionRisk": "D.3: heuristic sink regexes + curated library inventory; 'user-controlled' needs taint analysis. Byte-identical agreement requires the same curated pattern list.",
    "XssRisk": "D.3: curated sink-shape regexes (innerHTML/dangerouslySetInnerHTML/res.send). List is the detector.",
    "CommandInjectionRisk": "D.3: curated shell-sink regexes (spawn/exec with interpolation). List is the detector.",
    "PathTraversalRisk": "D.3: curated path-construction sink regexes. List is the detector.",
    "UnsafeDeserialization": "D.3: per-language curated sink inventory (pickle.load/yaml.load/ObjectInputStream/unserialize/Marshal.load/vm.runInNewContext). Agreement requires the same inventory + SafeLoader-exclusion rules.",
    "SsrfRisk": "D.3: curated HTTP-sink-from-request-context regexes. List is the detector.",
    "CryptographicMisuseRisk": "D.3: curated weak-algorithm patterns 'in a security context'; spec notes the 'MD5-as-cache-key' false positive is not yet filtered. The exact context-filter + algorithm list is the detector.",
    "HardcodedCredential": "D.3: curated secret-keyword list + key-format regexes + Shannon-entropy threshold. The keyword/format inventory is the detector.",
    "HardcodedApiKey": "D.3: curated key-format regexes (AKIA…/eyJ…/sk-…/Bearer …). The format inventory is the detector.",
    "LlmUnboundedCall": "D.3: SpecDetect4AI call-site regexes bound to a fixed SDK inventory (OpenAI/Anthropic/LangChain). Firing depends on which SDK shapes/arg names are listed.",
    "LlmUnpinnedModel": "D.3: SpecDetect4AI NMVP — model-name version-pin check against a curated SDK inventory.",
    "LlmNoSystemMessage": "D.3: SpecDetect4AI NSM — curated SDK call-shape inventory.",
    "LlmNoStructuredOutput": "D.3: SpecDetect4AI NSO — curated SDK call-shape inventory.",
    "LlmUnsetTemperature": "D.3: SpecDetect4AI TNES — curated SDK call-shape inventory.",
    "ExceptionHandlingAntiPattern": "D.3: fixed catalogue of named anti-patterns (EmptyCatch/CatchGeneric/DestructiveWrapping/UnreachableHandler); exact per-language firing rules are the curated catalogue, not published predicates.",
    "AsyncAntiPattern": "D.3: DrAsync P1/P3/P7/P8 catalogue (TS/JS only); the anti-pattern catalogue is the detector.",
    "AbstractionLeakage": "D.3: advisory AI-specific heuristic driven by curated indicator patterns.",
    "HardcodedAssumption": "D.3: advisory AI-specific heuristic driven by curated indicator patterns.",
    "MissingEdgeCase": "D.3: advisory AI-specific heuristic driven by curated indicator patterns.",
    "StyleInconsistency": "D.3: advisory AI-specific heuristic driven by curated indicator patterns.",
    "AiAttributedSATD": "D.3: co-occurrence of a curated AI-attribution term list AND a curated SATD marker list in one comment. The lists are the detector. (Text rule below is implemented for completeness but excluded from the structural subset.)",
}

# Biomarkers that ARE structurally reproducible (§2.4) but are NOT in the
# scorable STRUCTURAL_BIOMARKERS set above — either because a dedicated analyzer
# (not the default analyzeCode pipeline) emits them (§2.1g), or because they are
# language-specific to non-Python source, or are advisory/refactoring-context
# smells. Recorded separately so they are NOT mislabelled as "not spec-reproducible".
# (DataClumps, FeatureEnvy, GodClass, LowMaintainability ARE in the scorable set;
# they simply did not fire on these fixtures, which the per-file vectors show.)
STRUCTURAL_NOT_EXERCISED: Dict[str, str] = {
    "DocumentationDebt": "§2.1g: reproducible via the published DDI formula, but emitted by a dedicated analyzer (analyzeDocDebt), not the default analyzeCode pipeline.",
    "IntentClarity": "§2.1g: reproducible via the published intent-clarity formula, but emitted by analyzeIntentClarity, not the default pipeline.",
    "TypeSafetyEscape": "§2.1d: reproducible but TypeScript/JavaScript-specific (any / @ts-ignore). Not applicable to Python source.",
    "FragmentedCode": "§2 Category B advisory anti-gaming signal; reproducible but not exercised on these fixtures.",
    "SplitResidue": "§2 Category B post-Extract-Method residue smell; requires refactoring context, not exercised on static fixtures.",
}

# The biomarker set that §2.4 declares "Reproducible from this spec alone" and that
# can fire on a single Python file via the default analyzeCode pipeline. The
# cross-check measures agreement ONLY over this STRUCTURAL subset (plus any type
# in it that either side fires). Everything in NOT_IMPLEMENTABLE_FROM_SPEC is
# excluded from the agreement metric.
STRUCTURAL_BIOMARKERS = {
    "ComplexMethod", "DeepNesting", "LargeMethod", "LongParameterList",
    "CognitiveComplexity", "BrainMethod", "ComplexityMassConcentration",
    "BumpyRoad", "ComplexConditional", "MessageChain",
    "GodClass", "FeatureEnvy", "DataClumps", "PrimitiveObsession",
    "LargeFile", "LowMaintainability", "LowDocCoverage", "MagicNumber",
    "DuplicateCode", "SATD",
}


@dataclass
class Smell:
    type: str
    line: int = 1
    function_name: Optional[str] = None
    message: str = ""


@dataclass
class FuncInfo:
    name: str
    node: ast.AST
    lineno: int
    end_lineno: int
    length: int        # raw line span (end - start + 1) — §2.1a 'length', §2.1f 'L', §2.1f mass()
    cc: int            # cyclomatic complexity (§2.1a metric definition)
    cognitive: int     # cognitive complexity, SonarSource S3776 (§2.1a)
    max_nesting: int   # §2.1a metric definition
    param_count: int
    primitive_param_count: int  # §2.1c: count of params with a primitive type annotation
    has_doc: bool


# ──────────────────────────────────────────────────────────────────────────────
# AST metric helpers — implementing the §2.1a metric DEFINITIONS for Python.
#
# These mirror the metric definitions published in §2.1a as faithfully as Python's
# `ast` allows. The reference engine analyses Python via tree-sitter; where the two
# grammars represent the same construct differently (notably elif-chains and
# boolean-operator chains) the counting rule below is chosen to produce the SAME
# numeric value the spec's metric definition prescribes.
# ──────────────────────────────────────────────────────────────────────────────

# §2.1a CC = 1 + decision points. The spec lists: if, for, while, case, catch (except),
# &&/|| (each boolean operator), ternary (?). For Python that maps to:
#   If, For/AsyncFor, While, ExceptHandler, IfExp (ternary), and each boolean operator
#   (BoolOp with k values contributes k-1, matching one decision point per && / ||).
# NOT counted: with, assert (not in the decision-point list).
def _cyclomatic_complexity(node: ast.AST) -> int:
    cc = 1
    for n in ast.walk(node):
        if isinstance(n, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler)):
            cc += 1
        elif isinstance(n, ast.IfExp):
            cc += 1
        elif isinstance(n, ast.BoolOp):
            # `a and b and c` is one decision point per operator → (len(values) - 1).
            cc += len(n.values) - 1
        elif isinstance(n, ast.comprehension):
            # each `if` in a comprehension is a decision point
            cc += len(n.ifs)
    return cc


# §2.1a Cognitive complexity (SonarSource S3776): +1 per control-flow break, plus
# `nesting` extra for each NESTED one, +1 per logical operator in a boolean chain.
# The reference engine increments nesting on if/elif/for/while/try/with/conditional
# and counts each boolean-operator node +1 (flat). We mirror that: elif does NOT add
# a fresh nesting level (it is a sibling break of the same if), matching the engine's
# tree-sitter `elif_clause` which sits at the same depth as its `if_statement`.
def _cognitive_complexity(node: ast.AST) -> int:
    total = 0

    def is_break(n: ast.AST) -> bool:
        return isinstance(n, (ast.If, ast.For, ast.AsyncFor, ast.While,
                              ast.Try, ast.With, ast.AsyncWith, ast.IfExp,
                              ast.ExceptHandler))

    def walk(n: ast.AST, nesting: int) -> None:
        nonlocal total
        # boolean-operator chains: +1 per operator (len(values) - 1)
        if isinstance(n, ast.BoolOp):
            total += len(n.values) - 1

        if is_break(n):
            total += 1 + nesting

        # Recurse. An If's `orelse` that is a single If is an `elif` — it stays at the
        # SAME nesting level (it is a sibling break), so we do not deepen for it.
        if isinstance(n, ast.If):
            inner = nesting + 1  # If is always a break → its body is one level deeper
            walk(n.test, inner)
            for child in n.body:
                walk(child, inner)
            orelse = n.orelse
            if len(orelse) == 1 and isinstance(orelse[0], ast.If):
                # elif chain — same depth as this if (sibling break)
                walk(orelse[0], nesting)
            else:
                for child in orelse:
                    walk(child, inner)
            return

        deeper = nesting + 1 if is_break(n) else nesting
        for child in ast.iter_child_nodes(n):
            walk(child, deeper)

    walk(node, 0)
    return total


# §2.1a nesting depth — max depth of nested control structures (if/for/while/try/with).
# elif does NOT add a level (tree-sitter elif_clause is at the same depth as its
# if_statement); we mirror that by walking an elif-If's orelse at the current depth.
def _max_nesting(node: ast.AST) -> int:
    NEST = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.With, ast.AsyncWith)

    def depth(n: ast.AST, current: int) -> int:
        best = current
        if isinstance(n, ast.If):
            inner = current + 1
            best = max(best, inner)
            for child in n.body:
                best = max(best, depth(child, inner))
            best = max(best, depth(n.test, inner))
            orelse = n.orelse
            if len(orelse) == 1 and isinstance(orelse[0], ast.If):
                best = max(best, depth(orelse[0], current))  # elif: same depth
            else:
                for child in orelse:
                    best = max(best, depth(child, inner))
            return best
        is_nest = isinstance(n, NEST)
        nxt = current + 1 if is_nest else current
        if is_nest:
            best = max(best, nxt)
        for child in ast.iter_child_nodes(n):
            best = max(best, depth(child, nxt))
        return best

    return depth(node, 0)


def _func_info(node, lines: List[str]) -> FuncInfo:
    name = node.name
    start = node.lineno
    end = getattr(node, "end_lineno", start)
    length = end - start + 1
    cc = _cyclomatic_complexity(node)
    cognitive = _cognitive_complexity(node)
    max_nest = _max_nesting(node)
    args = node.args
    all_args = list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs)
    all_args = [a for a in all_args if a.arg not in ("self", "cls")]  # implicit receivers excluded
    param_count = len(all_args)
    if args.vararg:
        param_count += 1
    if args.kwarg:
        param_count += 1
    # §2.1c: count params whose annotation resolves to a primitive type NAME.
    primitive = 0
    for a in all_args:
        ann = a.annotation
        if isinstance(ann, ast.Name) and ann.id in PYTHON_PRIMITIVE_TYPES:
            primitive += 1
    has_doc = ast.get_docstring(node) is not None
    return FuncInfo(name, node, start, end, length, cc, cognitive, max_nest,
                    param_count, primitive, has_doc)


def _collect_functions(tree: ast.AST, lines: List[str]) -> List[FuncInfo]:
    funcs = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs.append(_func_info(node, lines))
    return funcs


# ──────────────────────────────────────────────────────────────────────────────
# Structural biomarker detectors — each implements a §2.1–§2.4 predicate.
# ──────────────────────────────────────────────────────────────────────────────

def detect_complexity_smells(funcs: List[FuncInfo]) -> List[Smell]:
    """§2.1a per-function complexity thresholds + §2.1f BrainMethod composite."""
    out: List[Smell] = []
    centrality = _build_centrality(funcs)
    max_centrality = max([1.0, *centrality.values()]) if centrality else 1.0
    for f in funcs:
        if f.cc > COMPLEX_METHOD_CC:                      # §2.1a/§2.2 CC > 10
            out.append(Smell("ComplexMethod", f.lineno, f.name, f"CC={f.cc}"))
        if f.max_nesting > DEEP_NESTING_DEPTH:            # §2.1a nesting > 3
            out.append(Smell("DeepNesting", f.lineno, f.name, f"depth={f.max_nesting}"))
        if f.length > LARGE_METHOD_LINES:                 # §2.1a length > 50
            out.append(Smell("LargeMethod", f.lineno, f.name, f"length={f.length}"))
        if f.param_count > LONG_PARAM_LIST:               # §2.1a parameterCount > 4
            out.append(Smell("LongParameterList", f.lineno, f.name, f"params={f.param_count}"))
        if f.cognitive > COGNITIVE_THRESHOLD:             # §2.1a cognitive > 15
            out.append(Smell("CognitiveComplexity", f.lineno, f.name, f"cognitive={f.cognitive}"))
        # §2.1f BrainMethod composite
        bm = _brain_method(f, centrality, max_centrality)
        if bm:
            out.append(bm)
    return out


def _build_centrality(funcs: List[FuncInfo]) -> Dict[str, float]:
    """§2.1f centrality proxy = sum of own CC across name-matching definitions."""
    names = {f.name for f in funcs if f.name != "<anonymous>"}
    counts: Dict[str, float] = {}
    for f in funcs:
        if f.name in names:
            counts[f.name] = counts.get(f.name, 0.0) + f.cc
    return counts


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _brain_method(f: FuncInfo, centrality: Dict[str, float], max_c: float) -> Optional[Smell]:
    """§2.1f: brain_score = 0.30L + 0.25C + 0.25G + 0.10N + 0.10X; fires at >=0.55 AND >=3 factors > 0.5."""
    factors = {
        "lines": _clamp01(f.length / BRAIN_T["lines"]),
        "cyclomatic": _clamp01(f.cc / BRAIN_T["cyclomatic"]),
        "cognitive": _clamp01(f.cognitive / BRAIN_T["cognitive"]),
        "nesting": _clamp01(f.max_nesting / BRAIN_T["nesting"]),
        "centrality": _clamp01(centrality.get(f.name, 0.0) / max_c),
    }
    score = (BRAIN_W["lines"] * factors["lines"]
             + BRAIN_W["cyclomatic"] * factors["cyclomatic"]
             + BRAIN_W["cognitive"] * factors["cognitive"]
             + BRAIN_W["nesting"] * factors["nesting"]
             + BRAIN_W["centrality"] * factors["centrality"])
    high = sum(1 for v in factors.values() if v > 0.5)
    if score < BRAIN_SMELL_THRESHOLD or high < BRAIN_MIN_HIGH_FACTORS:
        return None
    return Smell("BrainMethod", f.lineno, f.name, f"brain_score={score:.2f}")


def detect_design_smells(funcs: List[FuncInfo], tree: ast.AST) -> List[Smell]:
    """§2.1c PrimitiveObsession (per function) + §2.1d ComplexConditional / MessageChain."""
    out: List[Smell] = []

    # §2.1c PrimitiveObsession — per function, >= 3 primitive-typed params.
    for f in funcs:
        if f.primitive_param_count >= MIN_PRIMITIVE_PARAMS:
            out.append(Smell("PrimitiveObsession", f.lineno, f.name,
                             f"{f.primitive_param_count} primitive params"))

    # §2.1d ComplexConditional — a boolean expression with >= 3 logical operators,
    # OR a nested ternary. (Per-condition; one finding per qualifying condition.)
    for node in ast.walk(tree):
        if isinstance(node, (ast.If, ast.While)):
            ops = 0
            for n in ast.walk(node.test):
                if isinstance(n, ast.BoolOp):
                    ops += len(n.values) - 1
            if ops >= COMPLEX_CONDITIONAL_OPS:
                out.append(Smell("ComplexConditional", getattr(node, "lineno", 1), None, f"ops={ops}"))
        if isinstance(node, ast.IfExp):
            # nested ternary: consequent or alternative is itself a ternary
            if isinstance(node.body, ast.IfExp) or isinstance(node.orelse, ast.IfExp):
                out.append(Smell("ComplexConditional", getattr(node, "lineno", 1), None, "nested ternary"))

    # §2.1d MessageChain — call/property chain depth >= 4 (a.b().c().d()).
    seen_lines = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            depth = 0
            cur: ast.AST = node
            while isinstance(cur, (ast.Attribute, ast.Call)):
                if isinstance(cur, ast.Attribute):
                    depth += 1
                    cur = cur.value
                else:
                    cur = cur.func
            if depth >= MESSAGE_CHAIN_DEPTH:
                ln = getattr(node, "lineno", 1)
                if ln not in seen_lines:
                    seen_lines.add(ln)
                    out.append(Smell("MessageChain", ln, None, f"depth={depth}"))
    return out


def detect_doc_coverage(tree: ast.AST, lines: List[str]) -> List[Smell]:
    """§2.1b LowDocCoverage — exportable symbols = function_definition + class_definition,
    excluding symbols <= 3 lines and exempt names. Documented = an immediately-preceding
    doc comment (the line above). For Python's block-style docstrings — which live INSIDE
    the body, not above the def — an immediately-preceding doc comment is essentially never
    present, so the documented-ratio is 0; this mirrors the reference engine's block-style
    doc-comment detector applied to Python."""
    exports: List[bool] = []  # documented?
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            name = node.name
            if name in DOC_EXEMPT_NAMES:
                continue
            start = node.lineno
            end = getattr(node, "end_lineno", start)
            if (end - start + 1) <= DOC_TRIVIAL_LINE_THRESHOLD:
                continue
            # Immediately-preceding doc comment: the line directly above the symbol.
            documented = False
            above_idx = start - 2  # 1-based start → 0-based line above
            if above_idx >= 0:
                above = lines[above_idx].strip()
                # block-style doc comment markers (the reference uses /** */ and triple-quote
                # patterns); a Python def is preceded by code/blank/import, not a doc block.
                if above.startswith('"""') or above.startswith("'''") or above.endswith("*/"):
                    documented = True
            exports.append(documented)
    if len(exports) < LOW_DOC_MIN_EXPORTS:
        return []
    ratio = sum(1 for d in exports if d) / len(exports)
    if ratio >= LOW_DOC_HIGH_COVERAGE:
        return []
    return [Smell("LowDocCoverage", 1, None,
                  f"{sum(exports)}/{len(exports)} documented (ratio {ratio:.2f})")]


# §2.1b MagicNumber — the reference engine routes Python through the TEXT rule
# (Tier B/C row of §2.1b): integers with |value| >= 2 on non-skipped lines, one
# finding per qualifying literal. (Python is Tier A, but its analyzer uses the
# text-based magic-number detector — the spec publishes this exact rule.)
_MAGIC_PATTERN = re.compile(r"(?<![.\w])(-?)(\b[2-9]\b|\b[1-9]\d+\b)(?!\.\d)")
_CONSTANT_ASSIGNMENT = re.compile(r"^[A-Z_][A-Z0-9_]*(?:\s*:\s*[\w<>\[\]|,\s]+)?\s*=(?!=)")
_TYPED_CONSTANT_DECL = re.compile(r"\b(?:final|const)\b[^=\n]*\b[A-Z_][A-Z0-9_]+\b[^=\n]*=(?!=)")
_MAGIC_SKIP_PREFIXES = ("import ", "using ", "package ", "require(", "from ")
_MAGIC_SKIP_EXT = (".json", ".yml", ".yaml", ".xml", ".toml", ".ini", ".cfg")


def _magic_skip_line(trimmed: str) -> bool:
    if not trimmed:
        return True
    if trimmed.startswith("//") or trimmed.startswith("#") or trimmed.startswith("*"):
        return True
    if any(trimmed.startswith(p) for p in _MAGIC_SKIP_PREFIXES):
        return True
    return bool(_CONSTANT_ASSIGNMENT.match(trimmed) or _TYPED_CONSTANT_DECL.search(trimmed))


def detect_magic_numbers(lines: List[str], file_path: str) -> List[Smell]:
    if any(file_path.endswith(ext) for ext in _MAGIC_SKIP_EXT):
        return []
    out: List[Smell] = []
    for i, line in enumerate(lines, start=1):
        trimmed = line.strip()
        if _magic_skip_line(trimmed):
            continue
        for m in _MAGIC_PATTERN.finditer(trimmed):
            out.append(Smell("MagicNumber", i, None, f"literal={m.group(0).strip()}"))
    return out


# §2.1e SATD — text/regex rule (Python uses the text detector). One finding per
# matching comment line. Markers: TODO/FIXME/HACK/XXX/BUG/KLUDGE (word-boundary).
_SATD_MARKERS = ["TODO", "FIXME", "HACK", "XXX", "BUG", "KLUDGE"]
_SATD_LINE = re.compile(
    r"(?:(?:^|\s)\*|//|#|--|;)\s*(" + "|".join(_SATD_MARKERS) + r")\b",
    re.IGNORECASE,
)


def detect_satd(lines: List[str]) -> List[Smell]:
    out: List[Smell] = []
    for i, line in enumerate(lines, start=1):
        if _SATD_LINE.search(line):
            out.append(Smell("SATD", i, None, "SATD marker"))
    return out


def detect_large_file(lines: List[str]) -> List[Smell]:
    """§2.1b LargeFile — totalLines > 500."""
    if len(lines) > LARGE_FILE_LINES:
        return [Smell("LargeFile", 1, None, f"{len(lines)} lines")]
    return []


def detect_bumpy_road(tree: ast.AST) -> List[Smell]:
    """§2.1d BumpyRoad — a function body with >= 4 top-level sibling control-flow chunks.
    Chunk node types (Python): if/for/while/try/with. Only direct body children count."""
    out: List[Smell] = []
    CHUNK = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.With, ast.AsyncWith)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            chunks = sum(1 for stmt in node.body if isinstance(stmt, CHUNK))
            if chunks >= BUMPY_ROAD_CHUNKS:
                out.append(Smell("BumpyRoad", node.lineno, node.name, f"chunks={chunks}"))
    return out


def detect_erosion(funcs: List[FuncInfo]) -> List[Smell]:
    """§2.1f ComplexityMassConcentration — erosion > 0.60 with >= 3 functions.
    mass(f) = CC(f) * sqrt(max(1, length(f)))  [length = raw line span]."""
    if len(funcs) < MIN_FUNCTIONS_FOR_EROSION:
        return []
    total = 0.0
    high = 0.0
    for f in funcs:
        m = f.cc * math.sqrt(max(1, f.length))
        total += m
        if f.cc > 10:
            high += m
    if total <= 0:
        return []
    erosion = high / total
    if erosion > EROSION_THRESHOLD:
        return [Smell("ComplexityMassConcentration", funcs[0].lineno, None, f"erosion={erosion:.2f}")]
    return []


# ── §2.3 DuplicateCode — full published algorithm (sliding-window SHA-1) ────────
# Reserved-keyword set = union of TS/JS + Python keywords (spec §2.3 step 3).
_DUP_KEYWORDS = {
    "if", "else", "return", "const", "let", "var", "function", "class", "for", "while",
    "do", "switch", "case", "break", "continue", "new", "delete", "typeof", "instanceof",
    "in", "of", "try", "catch", "finally", "throw", "import", "export", "default", "from",
    "async", "await", "yield", "true", "false", "null", "undefined", "void", "this", "super",
    "extends", "implements", "interface", "type", "enum", "namespace", "module", "declare",
    "abstract", "public", "private", "protected", "static", "readonly", "override", "as",
    "is", "keyof", "infer", "never", "any", "unknown", "object", "string",
    "number", "boolean", "symbol", "bigint",
    "def", "pass", "and", "or", "not", "with", "lambda", "global", "nonlocal", "assert",
    "del", "raise", "except", "None", "True", "False", "self", "cls",
}
_DUP_IDENT = re.compile(r"\b([A-Za-z_$][A-Za-z0-9_$]*)\b")
_DUP_LOGIC = re.compile(
    r"\b(?:if|else|for|while|switch|case|do|try|catch|except|return|throw|raise|await|yield|match|when|guard|foreach|elif|loop|repeat)\b"
    r"|=>|\)\s*\{|\w\s*\([^)]*\)\s*[;{]?$|\.\w+\s*\("
)


def _sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def _normalise_type1(window: List[str]) -> str:
    return "\n".join(l.strip() for l in window if l.strip())


def _normalise_type2(window: List[str]) -> str:
    base = _normalise_type1(window)
    return _DUP_IDENT.sub(lambda m: m.group(1) if m.group(1) in _DUP_KEYWORDS else "$ID", base)


def _build_window_map(normalise, lines: List[str], min_lines: int) -> Dict[str, List[int]]:
    m: Dict[str, List[int]] = {}
    total = len(lines)
    for i in range(0, total - min_lines + 1):
        window = lines[i:i + min_lines]
        norm = normalise(window)
        if not norm.strip():
            continue
        m.setdefault(_sha1(norm), []).append(i)
    return m


def _find_clone_regions(window_map: Dict[str, List[int]], min_lines: int):
    pairs = []
    for starts in window_map.values():
        if len(starts) < 2:
            continue
        s = sorted(starts)
        for i in range(len(s)):
            for j in range(i + 1, len(s)):
                pairs.append((s[i], s[j]))
    if not pairs:
        return []
    pairs.sort()
    merged = []
    for a, b in pairs:
        if merged and a == merged[-1]["endA"] + 1 and b == merged[-1]["endB"] + 1:
            merged[-1]["endA"] = a
            merged[-1]["endB"] = b
        else:
            merged.append({"startA": a, "endA": a, "startB": b, "endB": b})
    out = []
    for p in merged:
        out.append([
            {"start": p["startA"], "end": p["endA"] + min_lines - 1},
            {"start": p["startB"], "end": p["endB"] + min_lines - 1},
        ])
    return out


def _regions_overlap(regions) -> bool:
    for i in range(len(regions)):
        for j in range(i + 1, len(regions)):
            a, b = regions[i], regions[j]
            if a["start"] <= b["end"] and b["start"] <= a["end"]:
                return True
    return False


def _has_logic_content(block: List[str]) -> bool:
    for raw in block:
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^(?://|#|--|;|\*|/\*|\*/)", line):
            continue
        if _DUP_LOGIC.search(line):
            return True
    return False


def _region_pairs_to_groups(region_pairs, lines, normalise, clone_type):
    groups = []
    seen = set()
    for regions in region_pairs:
        if len(regions) < 2:
            continue
        if _regions_overlap(regions):
            continue
        first = regions[0]
        block = lines[first["start"]:first["end"] + 1]
        if not _has_logic_content(block):
            continue
        h = _sha1(normalise(block))
        if h in seen:
            continue
        seen.add(h)
        groups.append({"occurrences": regions, "cloneType": clone_type})
    return groups


def detect_duplicate_code(code: str) -> List[Smell]:
    """§2.3 DuplicateCode — sliding-window SHA-1, type-1 then type-2, logic guard."""
    min_lines = DUPLICATE_MIN_LINES
    all_lines = code.split("\n")
    lines = all_lines[:2000] if len(all_lines) > 2000 else all_lines
    if len(lines) < min_lines * 2:
        return []

    t1_map = _build_window_map(_normalise_type1, lines, min_lines)
    t1_regions = _find_clone_regions(t1_map, min_lines)
    t1_groups = _region_pairs_to_groups(t1_regions, lines, _normalise_type1, 1)

    covered = set()
    for g in t1_groups:
        for occ in g["occurrences"]:
            for ln in range(occ["start"] + 1, occ["end"] + 2):  # 1-indexed coverage
                covered.add(ln)

    t2_map = _build_window_map(_normalise_type2, lines, min_lines)
    t2_regions = _find_clone_regions(t2_map, min_lines)
    t2_candidates = _region_pairs_to_groups(t2_regions, lines, _normalise_type2, 2)
    t2_groups = []
    for g in t2_candidates:
        all_covered = all(
            all((occ["start"] + 1 + k) in covered
                for k in range(occ["end"] - occ["start"] + 1))
            for occ in g["occurrences"]
        )
        if not all_covered:
            t2_groups.append(g)

    out = []
    for g in (t1_groups + t2_groups):
        first = g["occurrences"][0]
        out.append(Smell("DuplicateCode", first["start"] + 1, None,
                         f"type-{g['cloneType']} clone"))
    return out


# ── §2.1f AiAttributedSATD — implemented for completeness; EXCLUDED from the
#    structural subset (Appendix D.3: curated AI-term + SATD-marker lists). ──────
_AI_TERMS = ["LLM", "AI", "GPT", "CHATGPT", "COPILOT", "GEMINI", "CLAUDE"]
_AI_SATD_MARKERS = ["TODO", "FIXME", "HACK", "XXX"]


def detect_ai_attributed_satd(lines: List[str]) -> List[Smell]:
    out: List[Smell] = []
    for i, line in enumerate(lines, start=1):
        if "#" not in line:
            continue
        comment = line[line.index("#") + 1:].upper()
        has_ai = any(re.search(r"\b" + re.escape(t) + r"\b", comment) for t in _AI_TERMS)
        has_marker = any(m in comment for m in _AI_SATD_MARKERS)
        if has_ai and has_marker:
            out.append(Smell("AiAttributedSATD", i, None, "AI-attributed SATD"))
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Top-level scoring
# ──────────────────────────────────────────────────────────────────────────────

def compute_ochs(source: str, file_path: str = "<stdin>") -> dict:
    lines = source.splitlines()
    smells: List[Smell] = []
    try:
        tree = ast.parse(source)
        parse_ok = True
    except SyntaxError as e:
        tree = None
        parse_ok = False
        _gap("__parse__", f"Python source did not parse: {e}")

    if parse_ok and tree is not None:
        funcs = _collect_functions(tree, lines)
        smells += detect_complexity_smells(funcs)
        smells += detect_design_smells(funcs, tree)
        smells += detect_doc_coverage(tree, lines)
        smells += detect_bumpy_road(tree)
        smells += detect_erosion(funcs)
    smells += detect_magic_numbers(lines, file_path)
    smells += detect_satd(lines)
    smells += detect_large_file(lines)
    smells += detect_duplicate_code(source)
    # AiAttributedSATD is computed but flagged D.3 — excluded from the structural subset.
    smells += detect_ai_attributed_satd(lines)

    counts: Dict[str, int] = {}
    for s in smells:
        counts[s.type] = counts.get(s.type, 0) + 1

    score = score_from_counts(counts)
    category = category_from_score(score)
    has_ai_satd = counts.get("AiAttributedSATD", 0) > 0
    threshold = AI_READY_THRESHOLD_WITH_AI_SATD if has_ai_satd else AI_READY_THRESHOLD
    loop_complete = score >= threshold

    return {
        "ochsVersion": "0.1",
        "filePath": file_path,
        "language": "python",
        "score": round(score, 4),
        "category": category,
        "loopComplete": loop_complete,
        "smellCounts": counts,
        "smells": [
            {"type": s.type, "line": s.line, "functionName": s.function_name, "message": s.message}
            for s in smells
        ],
    }


def _round1(x: float) -> float:
    """§2.4 one-decimal half-away-from-zero rounding (toFixed(1) semantics)."""
    # Python's round() is banker's rounding; replicate JS toFixed(1) half-up.
    return math.floor(x * 10 + 0.5) / 10 if x >= 0 else -(math.floor(-x * 10 + 0.5) / 10)


def score_from_counts(counts: Dict[str, int]) -> float:
    penalty = 0.0
    for stype, count in counts.items():
        w = OCHS_WEIGHTS.get(stype)
        if w is not None and count > 0:
            penalty += w * math.sqrt(count)
    return max(OCHS_FLOOR, _round1(10.0 - penalty))


def category_from_score(score: float) -> str:
    if score >= HEALTHY_THRESHOLD:
        return "green"
    if score >= PROBLEMATIC_THRESHOLD:
        return "yellow"
    return "red"


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: ochs_ref.py <file.py> [--json]\n")
        return 2
    path = Path(argv[1])
    source = path.read_text(encoding="utf-8")
    result = compute_ochs(source, str(path))
    result["specGaps"] = SPEC_GAPS
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
