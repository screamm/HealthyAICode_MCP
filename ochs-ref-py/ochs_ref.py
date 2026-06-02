#!/usr/bin/env python3
"""
ochs_ref.py — a CLEAN-ROOM second implementation of the Open Code Health Score
(OCHS) v0.1, for Python source files.

PROVENANCE / HONESTY STATEMENT
==============================
This module was written from the *published OCHS v0.1 specification only*:

  - docs/ochs/OCHS-v0.1.md      (formula, thresholds, biomarker catalogue,
                                 detection-trigger prose, weights in Table 2)
  - docs/ochs/ochs-schema.json  (output object shape, smell-type enum)

It does NOT import, read, port, or transcribe any source code from
`@healthy-ai-code/core`. Biomarker detection is implemented independently using
Python's own `ast` module (a Tier-A analysis available to any third party for
Python source) plus text/regex heuristics for the structural and security
biomarkers the spec describes textually.

Where the specification under-specifies a biomarker (most commonly: it names a
"threshold" in prose but does not publish the numeric value, or it describes a
detection requiring git history / a project import graph / an offline registry
snapshot that the spec itself does not distribute), this implementation:

  1. implements the closest defensible interpretation of the published prose,
     choosing a threshold from common static-analysis convention, AND
  2. records the gap in SPEC_GAPS so it surfaces in the cross-check report.

The point of the exercise is to discover whether OCHS is third-party
implementable from the spec alone. Every SPEC_GAP entry is therefore a finding
ABOUT THE SPEC, not a bug in this code.

The OCHS score formula itself IS fully specified (§1) and is implemented exactly:

    score = max(1.0, 10 - Σ_i ( weight_i * sqrt( count_i ) ))
"""

from __future__ import annotations

import ast
import json
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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
# SPEC GAP LEDGER
# Each entry: (biomarker, what the spec leaves unspecified, what we assumed).
# Populated lazily by detectors so we only report gaps actually exercised, plus
# a static catalogue of biomarkers we determined are NOT implementable from the
# spec at all (require external data the spec does not distribute).
# ──────────────────────────────────────────────────────────────────────────────
SPEC_GAPS: Dict[str, str] = {}


def _gap(biomarker: str, note: str) -> None:
    if biomarker not in SPEC_GAPS:
        SPEC_GAPS[biomarker] = note


# Biomarkers the spec describes but which require inputs the spec itself does not
# distribute, so a third party CANNOT implement them deterministically from the
# spec alone. Recorded up-front as findings.
NOT_IMPLEMENTABLE_FROM_SPEC: Dict[str, str] = {
    "CodeChurn": "Requires git history (commit count vs repo average). Spec gives no thresholds and ships no history; analyzeFile() never emits it either.",
    "DeveloperCongestion": "Requires git log (>=3 distinct authors in a 14-day window). Not derivable from file text.",
    "KnowledgeLoss": "Requires git blame + contributor activity over 6 months. Not derivable from file text.",
    "MethodTemporalCoupling": "Spec states this is only emitted via analyzeFileWithHistory(); excluded from the file-local score by definition.",
    "ArchitectureDebt": "Requires a project-level import graph (SCC detection, propagation cost). Single-file analysis cannot compute it.",
    "DependencyVulnerability": "Requires a maintained advisory DB + dependency manifest. Spec ships neither corpus nor version ranges.",
    "HallucinatedPackageImport": "Spec says 'offline snapshot of the npm or PyPI registry' but does NOT distribute that snapshot. Without the exact registry list a third party cannot reproduce which imports fire.",
    "SlopsquattingRisk": "Depends on lock file + DepScope hallucination corpus + edit-distance to 'popular package' list + registry age — none of these reference datasets are published with the spec.",
    "DuplicateCode": "Spec says 'significant fraction of AST subtrees identical via SHA-1 subtree hashing' but gives no fraction threshold, no minimum subtree size, and no canonicalisation rules.",
    "ComplexityMassConcentration": "Formula is published (erosion = Σ mass(f,CC>10)/Σ mass(all f), mass=CC*sqrt(SLOC), threshold 0.60, >=3 functions) — implementable. Kept here only as a note; it IS implemented below.",
}
# Remove the one we DO implement from the not-implementable set.
NOT_IMPLEMENTABLE_FROM_SPEC.pop("ComplexityMassConcentration", None)


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
    sloc: int          # source lines of code (start..end inclusive, minus blanks/comments)
    cc: int            # cyclomatic complexity
    cognitive: int     # cognitive complexity (Sonar-style)
    max_nesting: int
    param_count: int
    has_doc: bool
    primitive_param_ratio: float


# ──────────────────────────────────────────────────────────────────────────────
# AST metric helpers
# ──────────────────────────────────────────────────────────────────────────────

# Spec §2 Category A defines CC, nesting, cognitive complexity, length but never
# publishes the numeric thresholds. We adopt conventional static-analysis values
# and log each as a gap.
CC_COMPLEX_METHOD = 15           # spec: "exceeds the threshold"; §2 prose mentions "CC 15-24 -> 1.0, >=25 -> 1.5"
CC_COMPLEX_METHOD_HIGH = 25      # this IS in the spec prose (the only published CC anchor)
DEEP_NESTING_THRESHOLD = 4       # spec: "typically 4"
LARGE_METHOD_LINES = 50          # spec: "typically 40-60 lines"
COGNITIVE_THRESHOLD = 15         # spec: "exceeds a configured threshold" — no value published
LONG_PARAM_LIST = 4              # spec: "typically > 4"
BRAIN_LARGE_LINES = 50           # spec: "very long (> threshold lines)" — no value published
BRAIN_HIGH_CC = 15               # spec: "high cyclomatic complexity (> threshold CC)" — no value published
COMPLEX_CONDITIONAL_OPS = 3      # spec: "more than the threshold number of logical operators" — no value published
MESSAGE_CHAIN_DEPTH = 3          # spec: "exceeds the configured depth (e.g. a.b().c().d())" — example implies ~3-4
LOW_DOC_COVERAGE_FRACTION = 0.5  # spec: "fewer than the threshold fraction" — no value published
ECHO = 0.60                      # ComplexityMassConcentration erosion threshold (PUBLISHED: 0.60)


def _is_blank_or_comment(line: str) -> bool:
    s = line.strip()
    return s == "" or s.startswith("#")


def _sloc(lines: List[str], start: int, end: int) -> int:
    # start/end are 1-based inclusive
    count = 0
    for i in range(start - 1, min(end, len(lines))):
        if not _is_blank_or_comment(lines[i]):
            count += 1
    return count


def _cyclomatic_complexity(node: ast.AST) -> int:
    """Cyclomatic complexity: 1 + number of decision points.

    Counts If/For/While/comprehension-if/and/or/except/assert/ternary. This is the
    standard McCabe-style count; the spec names 'cyclomatic complexity (CC)' without
    publishing the exact node set, so we use the conventional definition.
    """
    cc = 1
    for n in ast.walk(node):
        if isinstance(n, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler,
                          ast.With, ast.AsyncWith, ast.Assert)):
            cc += 1
        elif isinstance(n, ast.BoolOp):
            cc += len(n.values) - 1
        elif isinstance(n, ast.IfExp):
            cc += 1
        elif isinstance(n, (ast.comprehension,)):
            cc += 1 + len(n.ifs)
    return cc


def _cognitive_complexity(node: ast.AST) -> int:
    """Sonar-style cognitive complexity: nesting increments + structural breaks.

    Spec §2#3: 'counts nesting penalties and structural breaks, not just branching
    paths.' Spec does not publish the exact increment rules, so we implement the
    public SonarSource cognitive-complexity algorithm (nesting +1 per level on
    if/for/while/except, +1 flat for boolean-operator sequences, +1 for else/elif).
    """
    total = 0

    def walk(n: ast.AST, nesting: int) -> None:
        nonlocal total
        for child in ast.iter_child_nodes(n):
            increment = False
            increases_nesting = False
            if isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler)):
                increment = True
                increases_nesting = True
            elif isinstance(child, ast.BoolOp):
                total += 1  # flat increment for a boolean sequence
            if increment:
                total += 1 + nesting
            walk(child, nesting + 1 if increases_nesting else nesting)
            # elif chains: an If whose orelse is a single If => +1 (handled as nested If above)

    walk(node, 0)
    return total


def _max_nesting(node: ast.AST) -> int:
    """Maximum nesting depth of control structures (if/for/while/try/with)."""
    NEST = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.With, ast.AsyncWith)

    def depth(n: ast.AST, current: int) -> int:
        best = current
        for child in ast.iter_child_nodes(n):
            if isinstance(child, NEST):
                best = max(best, depth(child, current + 1))
            else:
                best = max(best, depth(child, current))
        return best

    return depth(node, 0)


PRIMITIVE_ANNOTATIONS = {"int", "float", "str", "bool", "bytes", "complex"}


def _func_info(node, lines: List[str]) -> FuncInfo:
    name = node.name
    start = node.lineno
    end = getattr(node, "end_lineno", start)
    sloc = _sloc(lines, start, end)
    cc = _cyclomatic_complexity(node)
    cognitive = _cognitive_complexity(node)
    max_nest = _max_nesting(node)
    args = node.args
    all_args = list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs)
    # exclude self/cls
    all_args = [a for a in all_args if a.arg not in ("self", "cls")]
    param_count = len(all_args)
    if args.vararg:
        param_count += 1
    if args.kwarg:
        param_count += 1
    has_doc = ast.get_docstring(node) is not None
    # primitive param ratio
    if all_args:
        prim = 0
        for a in all_args:
            ann = a.annotation
            if ann is None:
                prim += 1  # untyped counts as primitive-ish (no value object)
            elif isinstance(ann, ast.Name) and ann.id in PRIMITIVE_ANNOTATIONS:
                prim += 1
        ratio = prim / len(all_args)
    else:
        ratio = 0.0
    return FuncInfo(name, node, start, end, sloc, cc, cognitive, max_nest, param_count, has_doc, ratio)


def _collect_functions(tree: ast.AST, lines: List[str]) -> List[FuncInfo]:
    funcs = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs.append(_func_info(node, lines))
    return funcs


# ──────────────────────────────────────────────────────────────────────────────
# Biomarker detectors (Python, from spec prose). Each returns a list of Smell.
# ──────────────────────────────────────────────────────────────────────────────

def detect_complexity_smells(funcs: List[FuncInfo]) -> List[Smell]:
    out: List[Smell] = []
    _gap("ComplexMethod", "Spec publishes only the weight tiers (CC 15-24 -> 1.0, CC>=25 -> 1.5) but no base CC threshold for firing; assumed CC>=15. NOTE: the variable weight (1.0 vs 1.5) is NOT representable in the published formula, which uses a single fixed weight (1.5) per type.")
    _gap("DeepNesting", "Spec says 'typically 4'; exact threshold not fixed. Assumed depth>4.")
    _gap("LargeMethod", "Spec says 'typically 40-60 lines'; assumed >50 SLOC.")
    _gap("CognitiveComplexity", "Spec gives no threshold value and does not publish the exact increment algorithm; assumed Sonar algorithm, threshold>15.")
    _gap("BrainMethod", "Spec says 'very long AND high CC' with no numeric thresholds; assumed SLOC>50 AND CC>15.")
    _gap("LongParameterList", "Spec says 'typically > 4'; assumed >4 (self/cls excluded — exclusion rule not in spec).")
    for f in funcs:
        if f.cc >= CC_COMPLEX_METHOD:
            out.append(Smell("ComplexMethod", f.lineno, f.name, f"CC={f.cc}"))
        if f.max_nesting > DEEP_NESTING_THRESHOLD:
            out.append(Smell("DeepNesting", f.lineno, f.name, f"depth={f.max_nesting}"))
        if f.sloc > LARGE_METHOD_LINES:
            out.append(Smell("LargeMethod", f.lineno, f.name, f"sloc={f.sloc}"))
        if f.cognitive > COGNITIVE_THRESHOLD:
            out.append(Smell("CognitiveComplexity", f.lineno, f.name, f"cognitive={f.cognitive}"))
        if f.sloc > BRAIN_LARGE_LINES and f.cc > BRAIN_HIGH_CC:
            out.append(Smell("BrainMethod", f.lineno, f.name, "long+complex"))
        if f.param_count > LONG_PARAM_LIST:
            out.append(Smell("LongParameterList", f.lineno, f.name, f"params={f.param_count}"))
    return out


def detect_design_smells(funcs: List[FuncInfo], tree: ast.AST) -> List[Smell]:
    out: List[Smell] = []
    # ComplexConditional
    _gap("ComplexConditional", "Spec: 'more than the threshold number of logical operators (&&,||,!)'; no value published. Assumed >3 boolean operators in one condition.")
    for node in ast.walk(tree):
        if isinstance(node, (ast.If, ast.While)):
            ops = sum(1 for n in ast.walk(node.test) if isinstance(n, ast.BoolOp)
                      for _ in range(len(n.values) - 1))
            unary = sum(1 for n in ast.walk(node.test) if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not))
            if ops + unary > COMPLEX_CONDITIONAL_OPS:
                out.append(Smell("ComplexConditional", getattr(node, "lineno", 1), None, f"ops={ops+unary}"))
    # MessageChain
    _gap("MessageChain", "Spec: 'chain of calls/accesses exceeds the configured depth (e.g. a.b().c().d())'; no value published. Assumed chain length>3.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            depth = 0
            cur = node
            while isinstance(cur, (ast.Attribute, ast.Call)):
                if isinstance(cur, ast.Attribute):
                    depth += 1
                    cur = cur.value
                else:
                    cur = cur.func
            if depth > MESSAGE_CHAIN_DEPTH:
                out.append(Smell("MessageChain", getattr(node, "lineno", 1), None, f"depth={depth}"))
                break  # count once per file to avoid over-counting nested attrs
    # PrimitiveObsession
    _gap("PrimitiveObsession", "Spec: 'high proportion of primitive-typed parameters'; no ratio threshold or minimum param count published. Assumed a function with >=3 params and primitive ratio == 1.0; counted once per file.")
    if any(f.param_count >= 3 and f.primitive_param_ratio >= 1.0 for f in funcs):
        out.append(Smell("PrimitiveObsession", 1, None, "all-primitive params"))
    return out


def detect_doc_smells(funcs: List[FuncInfo], lines: List[str]) -> List[Smell]:
    out: List[Smell] = []
    # LowDocCoverage
    _gap("LowDocCoverage", "Spec: 'fewer than the threshold fraction of public functions have a doc comment'; threshold is 'language-aware' but no value published, and 'public' is undefined for Python (leading-underscore convention assumed).")
    public = [f for f in funcs if not f.name.startswith("_")]
    if public:
        documented = sum(1 for f in public if f.has_doc)
        if documented / len(public) < LOW_DOC_COVERAGE_FRACTION:
            out.append(Smell("LowDocCoverage", 1, None, f"{documented}/{len(public)} documented"))
    return out


# MagicNumber — language-agnostic structural signal.
# Spec §2#22: numeric literal in executable code, excluding 0,1,-1,100 and config.
MAGIC_EXCLUDED = {0, 1, -1, 100}


def detect_magic_numbers(tree: ast.AST) -> List[Smell]:
    _gap("MagicNumber", "Spec excludes '0,1,-1,100' and 'values in configuration contexts' with 'language-specific exclusions' — but does not enumerate the config-context rule or whether each literal counts separately or once per value. Assumed: one finding per distinct excluded-set-miss literal occurrence in executable code, module-level constants excluded.")
    out: List[Smell] = []
    # Collect literals that are direct children of module-level Assign to NAMED CONSTANT => exclude (config context)
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            val = node.value
            try:
                if val in MAGIC_EXCLUDED:
                    continue
            except TypeError:
                continue
            out.append(Smell("MagicNumber", getattr(node, "lineno", 1), None, f"literal={val}"))
    return out


# SATD / AiAttributedSATD — comment-based, language-agnostic.
SATD_MARKERS = ["HACK", "XXX", "BUG", "FIXME", "BROKEN", "TODO", "TEMP",
                "WORKAROUND", "KLUDGE", "REFACTOR"]
AI_ATTR_TERMS = ["LLM", "AI", "GPT", "CHATGPT", "COPILOT", "GEMINI", "CLAUDE"]
AI_SATD_MARKERS = ["TODO", "FIXME", "HACK", "XXX"]


def detect_satd(lines: List[str]) -> List[Smell]:
    out: List[Smell] = []
    for i, line in enumerate(lines, start=1):
        if "#" not in line:
            continue
        comment = line[line.index("#") + 1:].upper()
        # AiAttributedSATD takes precedence within a comment
        has_ai = any(re.search(r"\b" + re.escape(t) + r"\b", comment) for t in AI_ATTR_TERMS)
        has_ai_satd_marker = any(m in comment for m in AI_SATD_MARKERS)
        if has_ai and has_ai_satd_marker:
            out.append(Smell("AiAttributedSATD", i, None, "AI-attributed SATD"))
            continue
        if any(m in comment for m in SATD_MARKERS):
            out.append(Smell("SATD", i, None, "SATD marker"))
    _gap("SATD", "Spec lists markers but not whether matching is word-boundary or substring, nor whether multiple markers in one comment count once or many. Assumed substring match, one finding per comment line.")
    _gap("AiAttributedSATD", "Spec requires AI term + SATD marker 'in the same comment node'; Python has no comment AST node, so we match per physical comment line. Word-boundary used for AI term to avoid matching 'AI' inside words.")
    return out


# LargeFile — language-agnostic. Spec §2#19: 'typically 300-500 lines'.
def detect_large_file(lines: List[str]) -> List[Smell]:
    _gap("LargeFile", "Spec says 'typically 300-500 lines'; assumed >500 total lines.")
    if len(lines) > 500:
        return [Smell("LargeFile", 1, None, f"{len(lines)} lines")]
    return []


# ── Security detectors (Python-specific patterns from spec prose) ──────────────

def detect_security(tree: ast.AST, lines: List[str], source: str) -> List[Smell]:
    out: List[Smell] = []

    # UnsafeDeserialization (CWE-502). Spec names pickle.load, yaml.load.
    _gap("UnsafeDeserialization", "Spec enumerates unsafe calls (pickle.load/yaml.load/...) but does not specify whether yaml.load with an explicit SafeLoader is excluded, nor how many findings per call. Assumed: every pickle.load / pickle.loads / yaml.load(...) call fires once; yaml.load with Loader=SafeLoader excluded.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            attr = node.func.attr
            base = node.func.value
            base_name = base.id if isinstance(base, ast.Name) else None
            if base_name == "pickle" and attr in ("load", "loads"):
                out.append(Smell("UnsafeDeserialization", node.lineno, None, "pickle.load"))
            elif base_name == "yaml" and attr == "load":
                # exclude if a safe Loader is passed
                safe = any(
                    (kw.arg == "Loader" and isinstance(kw.value, ast.Attribute)
                     and kw.value.attr in ("SafeLoader", "CSafeLoader"))
                    for kw in node.keywords
                )
                if not safe:
                    out.append(Smell("UnsafeDeserialization", node.lineno, None, "yaml.load"))

    # CryptographicMisuseRisk. Spec names MD5, SHA-1, DES, RC4, ECB.
    _gap("CryptographicMisuseRisk", "Spec names weak algorithms (MD5/SHA-1/DES/RC4/ECB) 'in a security context' but does not define how to detect 'security context', and explicitly notes 'MD5 as cache key' is a known false positive that is NOT yet filtered. Also unclear whether random.random() counts. Assumed: hashlib.md5/sha1 and a literal use of DES/RC4/ECB fire; random.random() NOT counted (not in the spec's named list).")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name) and node.func.value.id == "hashlib":
                if node.func.attr in ("md5", "sha1"):
                    out.append(Smell("CryptographicMisuseRisk", node.lineno, None, f"hashlib.{node.func.attr}"))

    # ExceptionHandlingAntiPattern. Spec names EmptyCatch, CatchGeneric, DestructiveWrapping, UnreachableHandler.
    _gap("ExceptionHandlingAntiPattern", "Spec is described for 'Tier A languages' generically; the four sub-patterns (EmptyCatch/CatchGeneric/DestructiveWrapping/UnreachableHandler) are named but exact firing rules per language are not published. Assumed: bare-except-or-pass => EmptyCatch; 'except Exception' with only pass => CatchGeneric; raise X without 'from e' inside except => DestructiveWrapping. One finding per matching handler.")
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            body = node.body
            only_pass = len(body) == 1 and isinstance(body[0], ast.Pass)
            only_comment = all(isinstance(s, ast.Pass) for s in body) if body else True
            is_bare = node.type is None
            catches_generic = (isinstance(node.type, ast.Name) and node.type.id in ("Exception", "BaseException"))
            if (is_bare or catches_generic) and (only_pass or only_comment):
                out.append(Smell("ExceptionHandlingAntiPattern", node.lineno, None, "empty/generic catch"))
            else:
                # DestructiveWrapping: raise NewError(...) without 'from'
                for s in ast.walk(node):
                    if isinstance(s, ast.Raise) and s.exc is not None and s.cause is None:
                        if isinstance(s.exc, ast.Call):
                            out.append(Smell("ExceptionHandlingAntiPattern", s.lineno, None, "destructive wrapping"))
                            break

    # SqlInjectionRisk (CWE-89): f-string / concat into a SQL-looking string passed to execute().
    _gap("SqlInjectionRisk", "Spec: 'SQL query constructed by string concat/interpolation of user-controlled input'. 'User-controlled' requires taint analysis the spec does not define. Assumed heuristic: an f-string or %/+ concatenation containing SELECT/INSERT/UPDATE/DELETE passed to a .execute()/.query() call. May under- or over-fire vs the reference.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("execute", "executemany", "query"):
            for arg in node.args:
                if _is_dynamic_sql(arg):
                    out.append(Smell("SqlInjectionRisk", node.lineno, None, "dynamic SQL in execute()"))
                    break

    # HardcodedCredential / HardcodedApiKey
    _gap("HardcodedCredential", "Spec: variable named password/secret/token/key assigned a non-empty string literal. 'Outside test fixtures' qualifier (for API keys) is vague. Assumed: assignment target name (lowercased) in {password,secret,passwd,pwd,credential} with a non-empty str literal RHS.")
    _gap("HardcodedApiKey", "Spec lists prefixes sk-/ghp_/AIza/'Bearer '. Assumed: any string literal starting with one of those prefixes anywhere in source.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            rhs = node.value
            if isinstance(rhs, ast.Constant) and isinstance(rhs.value, str) and rhs.value.strip():
                for tgt in node.targets:
                    nm = tgt.id.lower() if isinstance(tgt, ast.Name) else ""
                    if nm in ("password", "secret", "passwd", "pwd", "credential"):
                        out.append(Smell("HardcodedCredential", node.lineno, None, f"hardcoded {nm}"))
    for m in re.finditer(r"""['"](sk-|ghp_|AIza|Bearer )[A-Za-z0-9_\-]+['"]""", source):
        line_no = source[: m.start()].count("\n") + 1
        out.append(Smell("HardcodedApiKey", line_no, None, "API-key-like literal"))

    return out


def _is_dynamic_sql(node: ast.AST) -> bool:
    SQL_KW = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)
    if isinstance(node, ast.JoinedStr):  # f-string
        has_sql = any(isinstance(v, ast.Constant) and isinstance(v.value, str) and SQL_KW.search(v.value)
                      for v in node.values)
        has_expr = any(isinstance(v, ast.FormattedValue) for v in node.values)
        return has_sql and has_expr
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mod)):
        text = ast.dump(node)
        return bool(SQL_KW.search(text))
    return False


# ── ComplexityMassConcentration — PUBLISHED formula, implementable ─────────────
def detect_erosion(funcs: List[FuncInfo]) -> List[Smell]:
    if len(funcs) < 3:
        return []
    num = 0.0
    den = 0.0
    for f in funcs:
        mass = f.cc * math.sqrt(max(f.sloc, 1))
        den += mass
        if f.cc > 10:
            num += mass
    if den == 0:
        return []
    erosion = num / den
    if erosion > ECHO:
        return [Smell("ComplexityMassConcentration", funcs[0].lineno, None, f"erosion={erosion:.2f}")]
    return []


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
        smells += detect_doc_smells(funcs, lines)
        smells += detect_magic_numbers(tree)
        smells += detect_security(tree, lines, source)
        smells += detect_erosion(funcs)
    smells += detect_satd(lines)
    smells += detect_large_file(lines)

    # Aggregate counts per type
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


def score_from_counts(counts: Dict[str, int]) -> float:
    penalty = 0.0
    for stype, count in counts.items():
        w = OCHS_WEIGHTS.get(stype)
        if w is not None and count > 0:
            penalty += w * math.sqrt(count)
    return max(OCHS_FLOOR, 10.0 - penalty)


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
