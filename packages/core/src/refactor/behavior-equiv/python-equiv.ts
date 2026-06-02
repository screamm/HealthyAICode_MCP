/**
 * Python differential-equivalence engine (Sprint 51–60, behaviour-equivalence track).
 *
 * Given the `before` (original) and `after` (refactored) source of a Python module plus a
 * target function name, this module decides whether the refactoring is behaviour-preserving
 * by *differential execution*: it runs both versions of the target on a large set of
 * automatically-synthesised inputs in a sandboxed subprocess and compares the observable
 * behaviour of each call — the return value, any raised exception, and any mutation of the
 * arguments (observable side effects). A single divergence proves non-equivalence and is
 * reported with the witnessing input.
 *
 * Design honesty (carried over from scripts/spikes/behavior-equiv/README.md):
 *   - Inputs are derived ONLY from the `before` signature (parameter count, names and any
 *     annotations). The harness never inspects the injected bug or any expected outputs —
 *     this mirrors "synthesise characterisation tests from `before`".
 *   - Nondeterminism is neutralised: `time`/`random` are frozen identically for both sides,
 *     and a single seed drives input synthesis, so any divergence is a real semantic
 *     difference rather than flakiness. Re-runs are byte-identical.
 *   - Input synthesis is *edge-biased* (min/max/0/±1, empty/singleton collections, falsy
 *     values, missing dict keys) because uniform random fuzzing under-samples boundary
 *     bugs — the dominant LLM-refactoring break class (arXiv:2602.15761, arXiv:2502.18454).
 *   - When the `hypothesis` library is present it is used to broaden coverage with its
 *     property-based generators (seeded → deterministic); otherwise a self-contained seeded
 *     PRNG with explicit edge values is used. atheris is preferred for coverage-guided
 *     fuzzing but is optional and absent on Windows, so it is never required.
 *
 * Scope limits (do NOT overclaim): this verifies pure-ish, self-contained Python functions
 * whose arguments are scalars / lists / dicts / strings / None. It does not model network,
 * filesystem, DB, threads, or arbitrary object graphs, and a non-divergence is "no
 * divergence found within the input budget", not a proof of equivalence. Outside Python the
 * project ships static-equivalence only (advisory).
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Verdict of a differential-equivalence check. */
export type EquivVerdict = 'pass' | 'divergence' | 'unverified';

/** A concrete input + the two observed behaviours that differ. */
export interface DivergingInput {
  /** JSON-serialisable positional args (repr() fallback for non-serialisable values). */
  readonly args: unknown[];
  /** Observed behaviour of the `before` version: a value, an error, or mutated side effects. */
  readonly before: ObservedBehaviour;
  /** Observed behaviour of the `after` version. */
  readonly after: ObservedBehaviour;
}

/** Observable behaviour of one call: its outcome, return value, and post-call arg state. */
export interface ObservedBehaviour {
  /** 'value' = returned normally; 'error' = raised an exception. */
  readonly outcome: 'value' | 'error';
  /** Return value when outcome==='value' (JSON-safe, repr() fallback). */
  readonly value?: unknown;
  /** Exception class name when outcome==='error' (e.g. "KeyError"). */
  readonly error?: string;
  /** Post-call state of the (deep-copied) arguments — captures observable mutation. */
  readonly argsAfter: unknown[];
}

/** Result of {@link verifyPythonEquivalence}. */
export interface PythonEquivResult {
  readonly verdict: EquivVerdict;
  /** Present only when verdict==='divergence'. */
  readonly divergingInput?: DivergingInput;
  /** Human-readable explanation of the verdict (and, when unverified, the reason). */
  readonly detail: string;
  /** Number of synthesised inputs actually executed against both versions. */
  readonly checked: number;
  /** Whether the optional `hypothesis` generator augmentation was active for this run. */
  readonly usedHypothesis: boolean;
}

/** Options controlling the differential run. */
export interface PythonEquivOptions {
  /**
   * Number of synthesised inputs per function. Defaults to 2000, matching the per-function
   * budget reported in arXiv:2602.15761. Lower values trade detection power for speed.
   */
  readonly inputs?: number;
  /** Subprocess wall-clock timeout in ms (default 30s). */
  readonly timeoutMs?: number;
  /**
   * Python interpreter. Defaults to `HEALTHY_AI_PYTHON` env override, else `python`/`python3`
   * resolution. The first interpreter that successfully imports `ast` wins.
   */
  readonly python?: string;
  /** Deterministic seed for input synthesis (default 1337). */
  readonly seed?: number;
  /**
   * When true (default) the engine statically refuses to differentially execute a target
   * that is impure / not self-contained (file/IO, network, subprocess, global mutation,
   * unfrozen nondeterminism) and returns `verdict:'unverified'` with reason `impure: <cause>`.
   * Set false only to bypass the gate in controlled tests.
   */
  readonly checkPurity?: boolean;
}

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: NodeJS.ErrnoException;
}

/** Resolves candidate interpreters in priority order; never silently overrides an explicit one. */
function pythonCandidates(explicit?: string): string[] {
  const override = (explicit ?? process.env.HEALTHY_AI_PYTHON)?.trim();
  if (override && override.length > 0) return [override];
  return ['python', 'python3'];
}

/** Runs an executable without ever rejecting; failures surface in the resolved result. */
function runProcess(file: string, args: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
        const spawnError = e && typeof e.code === 'string' ? (e as NodeJS.ErrnoException) : undefined;
        const exitCode = e && typeof e.code === 'number' ? e.code : spawnError ? null : 0;
        resolve({
          code: exitCode,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          spawnError,
        });
      },
    );
  });
}

/** Returns the first interpreter that can `import ast`, or null when none is usable. Never throws. */
async function resolveInterpreter(explicit: string | undefined, timeoutMs: number): Promise<string | null> {
  for (const cand of pythonCandidates(explicit)) {
    const res = await runProcess(cand, ['-c', 'import ast,inspect,copy,json,random,sys'], timeoutMs);
    if (res.code === 0 && !res.spawnError) return cand;
  }
  return null;
}

/**
 * The generated Python harness. It is self-contained (only stdlib + optional hypothesis),
 * receives a JSON job on argv[1] = path to a JSON file describing the run, imports the
 * before/after modules from two files, derives inputs from the target signature, runs both
 * versions on identical deep-copied inputs with frozen nondeterminism, and prints a single
 * JSON verdict object to stdout.
 *
 * It is emitted verbatim to a temp file so the analysis is reproducible and inspectable.
 */
export const GENERATED_HARNESS = String.raw`# AUTOGENERATED by python-equiv.ts — differential-equivalence harness. Do not edit by hand.
import ast
import copy
import importlib.util
import inspect
import json
import random
import sys
import time

try:
    import hypothesis  # noqa: F401
    from hypothesis import strategies as st
    _HAS_HYPOTHESIS = True
except Exception:  # noqa: BLE001 - optional dependency
    _HAS_HYPOTHESIS = False


def _detect_target(file_path):
    """When no target is supplied, pick a top-level function from the source AST.

    Preference order: a sole top-level function; else the last public (non-underscore)
    top-level function; else the last top-level function. Returns its name or None.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
    except Exception:  # noqa: BLE001
        return None
    funcs = [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if not funcs:
        return None
    if len(funcs) == 1:
        return funcs[0]
    public = [f for f in funcs if not f.startswith("_")]
    return (public or funcs)[-1]


def _load_func(file_path, mod_name, func_name):
    spec = importlib.util.spec_from_file_location(mod_name, file_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fn = getattr(mod, func_name, None)
    if fn is None or not callable(fn):
        raise ValueError("target function %r not found in %s" % (func_name, file_path))
    return fn


# --- Purity / self-containment gate ------------------------------------------------------
# BEFORE running differential execution we statically check whether the TARGET function is
# pure enough to be deterministically comparable. Executing an impure / non-self-contained
# function yields a FALSE pass-or-divergence: the result would depend on the filesystem, the
# network, the wall clock, an unseeded RNG, or module-level state mutated across the input
# loop — none of which the harness controls. When any such cause is found we decline with
# verdict 'unverified' and a SPECIFIC reason rather than fabricating a verdict.
#
# Scope: the analysis is FUNCTION-SCOPED (the target's own body + any nested functions it
# defines). It deliberately does NOT flag:
#   * mutation of the function's OWN parameters (e.g. acc.append(x), d[k]=v) -- that
#     is observable behaviour the engine already compares via post-call argument state, and
#     is the very thing the mutable-default / reordered-side-effect corpus pairs test.
#   * pure reads of module-level CONSTANTS used as default argument values.
# It DOES flag: file/IO, network, subprocess/os process control, global/nonlocal
# writes, writes to module-level names, and nondeterministic sources that are not already
# frozen by _freeze_nondeterminism (datetime.now/today, random used WITHOUT a
# local seeded RNG, uuid, os.environ/os.getenv, secrets).

# Module names whose mere import-and-use signals an un-sandboxable effect.
_IMPURE_MODULES = {
    "io": "file/IO (io)",
    "pathlib": "file/IO (pathlib)",
    "socket": "network (socket)",
    "urllib": "network (urllib)",
    "requests": "network (requests)",
    "http": "network (http)",
    "httpx": "network (httpx)",
    "ftplib": "network (ftplib)",
    "smtplib": "network (smtplib)",
    "subprocess": "subprocess",
    "shutil": "filesystem mutation (shutil)",
    "tempfile": "filesystem (tempfile)",
    "sqlite3": "database (sqlite3)",
    "uuid": "nondeterministic id source (uuid) not frozen",
    "secrets": "nondeterministic source (secrets) not frozen",
    "datetime": "wall-clock source (datetime) not frozen",
}

# Bare builtins / dotted calls that signal an un-sandboxable effect when CALLED in the body.
# random.* is intentionally NOT a hard block here: it is frozen by _freeze_nondeterminism
# (random.seed(0)) so a divergence from random would be identical on both sides. We only
# flag random when the code constructs an UNSEEDED random.Random() instance (its own
# RNG that the global seed does not cover).


def _attr_chain(node):
    """Return the dotted attribute/name chain of a call target, e.g. 'os.path.join' or 'open'."""
    parts = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    parts.reverse()
    return ".".join(parts)


def _impurity_reason(func_node, module_tree, target_name):
    """Return a specific impurity reason string, or None if the target is pure enough.

    func_node     : the ast.FunctionDef/AsyncFunctionDef of the target.
    module_tree   : the parsed module (for resolving module-level names / imports).
    """
    # Names bound at module level (so we can detect WRITES to module state from the body).
    module_level_names = set()
    for n in module_tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            module_level_names.add(n.name)
        elif isinstance(n, ast.Assign):
            for t in n.targets:
                for nm in ast.walk(t):
                    if isinstance(nm, ast.Name):
                        module_level_names.add(nm.id)
        elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
            module_level_names.add(n.target.id)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                module_level_names.add((a.asname or a.name).split(".")[0])

    # Parameters of the target (and of nested functions) are "local" — mutating them is fine.
    param_names = set()
    for a in func_node.args.posonlyargs + func_node.args.args + func_node.args.kwonlyargs:
        param_names.add(a.arg)
    if func_node.args.vararg:
        param_names.add(func_node.args.vararg.arg)
    if func_node.args.kwarg:
        param_names.add(func_node.args.kwarg.arg)

    # Walk ONLY the body (not the signature defaults — module constants used as defaults are ok).
    body_nodes = []
    for stmt in func_node.body:
        body_nodes.extend(ast.walk(stmt))

    # Locals assigned inside the body (so a later use of a module name is distinguishable).
    local_assigned = set(param_names)
    for node in body_nodes:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    local_assigned.add(t.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            local_assigned.add(node.target.id)
        elif isinstance(node, (ast.For, ast.comprehension)):
            tgt = getattr(node, "target", None)
            if isinstance(tgt, ast.Name):
                local_assigned.add(tgt.id)
        elif isinstance(node, ast.withitem) and isinstance(node.optional_vars, ast.Name):
            local_assigned.add(node.optional_vars.id)

    for node in body_nodes:
        # global / nonlocal — explicit escape from the function's own scope.
        if isinstance(node, ast.Global):
            return "global mutation (global %s)" % ", ".join(node.names)
        if isinstance(node, ast.Nonlocal):
            return "global mutation (nonlocal %s)" % ", ".join(node.names)

        # Calls: file/network/subprocess/nondeterministic.
        if isinstance(node, ast.Call):
            chain = _attr_chain(node.func)
            head = chain.split(".")[0] if chain else ""
            # bare builtins
            if chain in ("open", "input", "print"):
                if chain == "open":
                    return "file/IO (open)"
                if chain == "input":
                    return "stdin/IO (input)"
                # print to stdout would corrupt our JSON protocol AND is an observable effect
                return "stdout/IO (print)"
            if chain in ("eval", "exec", "compile", "__import__"):
                return "dynamic code execution (%s)" % chain
            # dotted module calls
            if head in _IMPURE_MODULES and head not in local_assigned:
                # datetime.now / datetime.today specifically; bare datetime construction is ok-ish
                if head == "datetime" and not chain.endswith((".now", ".today", ".utcnow")):
                    pass
                else:
                    return _IMPURE_MODULES[head]
            if head == "os" and head not in local_assigned:
                if chain in ("os.system", "os.popen", "os.remove", "os.unlink", "os.rename",
                             "os.mkdir", "os.makedirs", "os.rmdir", "os.getenv") \
                        or chain.startswith(("os.path.exists", "os.path.isfile", "os.path.isdir")) \
                        or chain.startswith("os.environ"):
                    return "os process/filesystem/env access (%s)" % chain
            if head == "time" and chain in ("time.sleep",) and head not in local_assigned:
                return "blocking IO (time.sleep)"
            # unseeded RNG instance — global random.seed(0) does NOT cover its own Random()
            if chain in ("random.Random", "random.SystemRandom") and "random" not in local_assigned:
                return "unseeded RNG (%s) not frozen" % chain

        # Attribute reads of nondeterministic sources, even without a call:
        if isinstance(node, ast.Attribute):
            chain = _attr_chain(node)
            head = chain.split(".")[0] if chain else ""
            if head == "os" and chain.startswith("os.environ") and head not in local_assigned:
                return "os environment access (os.environ)"

        # Writes to MODULE-LEVEL names (not params, not body locals) — module state mutation.
        if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                base = t
                # x.attr = ... or x[i] = ... mutates the object bound to the base name.
                while isinstance(base, (ast.Attribute, ast.Subscript)):
                    base = base.value
                if isinstance(base, ast.Name):
                    nm = base.id
                    if nm in param_names or nm in local_assigned:
                        continue
                    if nm in module_level_names:
                        return "global mutation (writes module-level '%s')" % nm

    return None


def _check_purity(file_path, target_name):
    """Parse the module, locate the target, and return an impurity reason or None.

    Returns None when the file cannot be parsed / target cannot be found in the AST — in that
    case the downstream loader will surface a precise error, so we don't double-report here.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
    except Exception:  # noqa: BLE001
        return None

    # Resolve the target: it may be defined directly, or be an ALIAS of another top-level
    # function (the corpus uses f = before). Follow one level of aliasing.
    func_defs = {n.name: n for n in tree.body
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    resolved = target_name
    if resolved not in func_defs:
        for n in tree.body:
            if isinstance(n, ast.Assign) and len(n.targets) == 1 \
                    and isinstance(n.targets[0], ast.Name) and n.targets[0].id == target_name \
                    and isinstance(n.value, ast.Name) and n.value.id in func_defs:
                resolved = n.value.id
                break
    func_node = func_defs.get(resolved)
    if func_node is None:
        return None
    return _impurity_reason(func_node, tree, resolved)


def _params(fn):
    """Return [(name, annotation_str_or_None, has_default)] for positional/keyword params."""
    sig = inspect.signature(fn)
    out = []
    for p in sig.parameters.values():
        if p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            # *args/**kwargs: synthesise nothing extra; covered by fixed-arity inputs.
            continue
        ann = None
        if p.annotation is not inspect.Parameter.empty:
            ann = getattr(p.annotation, "__name__", None) or str(p.annotation)
        out.append((p.name, ann, p.default is not inspect.Parameter.empty))
    return out


# --- Edge-biased value synthesis ---------------------------------------------------------
# A "kind" is inferred from the annotation (if any) else from the parameter name, else a
# permissive default that mixes ints / strings / collections / falsy / None so coercion,
# boundary and edge-case bugs all get sampled.

_EDGE_INTS = [0, 1, -1, 2, -2, 10, -10, 50, -50, 100]
_EDGE_STRS = ["", "x", "Hello World", "  pad  ", "a b c", "0"]


def _kind_from_annotation(ann):
    """Map a type-hint string to a synthesis kind, or None when the hint is unhelpful.

    Handles exact scalars, container hints, AND union types ('str | bytes', 'Optional[int]',
    'int | None'). Honoring unions matters: a param annotated 'str | bytes' must NOT be fed
    None/ints — doing so makes a genuinely-equivalent pair diverge on an input the function can
    never receive (the documented false-positive cause). A union with None → 'optional'."""
    a = (ann or "").lower().strip()
    if not a:
        return None
    if a in ("int",):
        return "int"
    if a in ("float", "complex", "number"):
        return "float"
    if a in ("str", "string"):
        return "str"
    if a in ("bytes", "bytearray"):
        return "str"  # synthesise text/edge strings — bytes-vs-str share the string edge set
    if a in ("bool",):
        return "bool"
    if a.startswith("list") or a.startswith("sequence") or a.startswith("tuple") \
            or a.endswith("[]") or a in ("list", "sequence", "iterable", "tuple"):
        return "list"
    if a.startswith("dict") or a.startswith("mapping") or a in ("dict", "mapping"):
        return "dict"
    # Union types: split on '|' and the Optional[...]/Union[...] wrappers.
    if "|" in a or a.startswith("optional[") or a.startswith("union["):
        inner = a.replace("optional[", "").replace("union[", "").rstrip("]")
        parts = [p.strip() for p in inner.replace(",", "|").split("|") if p.strip()]
        nonnull = [p for p in parts if p not in ("none", "nonetype")]
        has_none = len(nonnull) != len(parts)
        # A scalar | None union is the falsy/nullish edge → 'optional'.
        if has_none:
            return "optional"
        # str | bytes union → feed BOTH text and bytes (so isinstance/decode branches diverge),
        # never None. A pure str|string union → plain string edge set.
        if all(p in ("str", "string", "bytes", "bytearray") for p in nonnull) and nonnull:
            return "strbytes" if any(p in ("bytes", "bytearray") for p in nonnull) else "str"
        # int | float etc. → numeric.
        if all(p in ("int", "float", "complex", "number", "bool") for p in nonnull) and nonnull:
            return "int"
        # mixed/unknown union: fall through to usage/name heuristics.
        return None
    if "optional" in a or a == "none":
        return "optional"
    return None


def _kind_from_name(name):
    """Best-effort kind from a conventional parameter name."""
    n = (name or "").lower()
    if n in ("log", "logs", "history", "trace", "acc", "accumulator", "out", "sink"):
        return "list"  # often a mutated side-effect collection
    if n in ("items", "values", "arr", "array", "nums", "numbers", "xs", "data", "elements",
             "seq", "weights", "lst", "list"):
        return "list"
    if n in ("d", "dict", "mapping", "table", "counts", "m"):
        return "dict"
    if n in ("key", "k", "name", "label", "s", "text", "word"):
        return "str"
    if n in ("n", "i", "j", "x", "y", "count", "limit", "lo", "hi", "low", "high", "idx",
             "index", "size", "len"):
        return "int"
    if n in ("val", "value", "v", "fallback", "default", "opt", "maybe"):
        return "optional"
    return None


def _infer_kind(name, ann, usage=None):
    """Infer a synthesis kind for a parameter.

    Priority (most authoritative first):
      1. an explicit type annotation,
      2. USAGE inferred from how the BEFORE body uses the parameter (subscript/iterate/len
         -> list/dict; arithmetic -> numeric; string methods -> str). Usage is the key lever
         that stops untyped genuinely-equivalent pairs being fed nonsensical inputs (None,
         garbage) they would never receive in real callers — the documented FP cause.
      3. a conventional-name heuristic,
      4. a permissive 'any' mixture.
    Annotation and usage are reconciled: when both are present the annotation wins, except
    that a list/dict usage is honoured over a bare 'optional' hint (a common x=None list).
    """
    k_ann = _kind_from_annotation(ann)
    k_use = usage
    if k_ann is not None:
        if k_ann == "optional" and k_use in ("list", "dict", "int", "float", "str"):
            return k_use
        return k_ann
    if k_use is not None:
        return k_use
    k_name = _kind_from_name(name)
    if k_name is not None:
        return k_name
    return "any"


def _infer_usage_kinds(file_path, target_name, params):
    """Infer a kind per parameter from how the TARGET body uses each parameter.

    Reads the BEFORE module AST only (never the after / never expected outputs), follows the
    f = before aliasing the corpus uses, and classifies each parameter by the operations
    applied to it. Returns a dict {param_name: kind}; absent params get no usage signal.

    Signals:
      * len(p), for x in p, p[i], slicing p[:k], p + [..]            -> list
      * p[key] with a string key, p.get(...), p.keys/items/values    -> dict
      * p / q, p * q, p // q, p % q, p - q, range(p), p < lo         -> int/float
      * p.strip()/lower()/upper()/split()/replace()...               -> str
    Ambiguous evidence falls through to caller's name/annotation heuristics.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
    except Exception:  # noqa: BLE001
        return {}

    func_defs = {n.name: n for n in tree.body
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    resolved = target_name
    if resolved not in func_defs:
        for n in tree.body:
            if isinstance(n, ast.Assign) and len(n.targets) == 1 \
                    and isinstance(n.targets[0], ast.Name) and n.targets[0].id == target_name \
                    and isinstance(n.value, ast.Name) and n.value.id in func_defs:
                resolved = n.value.id
                break
    func_node = func_defs.get(resolved)
    if func_node is None:
        return {}

    pset = {name for (name, _ann, _d) in params}
    # Per-param vote tallies.
    votes = {p: {"list": 0, "dict": 0, "num": 0, "str": 0} for p in pset}

    _STR_METHODS = {"strip", "lstrip", "rstrip", "lower", "upper", "title", "split",
                    "rsplit", "replace", "join", "startswith", "endswith", "format",
                    "encode", "capitalize", "casefold", "splitlines", "zfill"}
    _DICT_METHODS = {"get", "keys", "values", "items", "setdefault", "update", "pop"}
    _LIST_METHODS = {"append", "extend", "insert", "sort", "reverse"}

    def base_name(node):
        cur = node
        while isinstance(cur, (ast.Attribute, ast.Subscript)):
            cur = cur.value
        return cur.id if isinstance(cur, ast.Name) else None

    body_nodes = []
    for stmt in func_node.body:
        body_nodes.extend(ast.walk(stmt))

    for node in body_nodes:
        # for x in p:
        if isinstance(node, ast.For) and isinstance(node.iter, ast.Name) and node.iter.id in votes:
            votes[node.iter.id]["list"] += 1
        if isinstance(node, ast.comprehension) and isinstance(node.iter, ast.Name) \
                and node.iter.id in votes:
            votes[node.iter.id]["list"] += 1
        # subscript p[...] — list vs dict by index expression
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) \
                and node.value.id in votes:
            p = node.value.id
            sl = node.slice
            if isinstance(sl, ast.Slice):
                votes[p]["list"] += 1
            elif isinstance(sl, ast.Constant) and isinstance(sl.value, str):
                votes[p]["dict"] += 1
            elif isinstance(sl, ast.Constant) and isinstance(sl.value, int):
                votes[p]["list"] += 1
            elif isinstance(sl, ast.Name):
                # p[i] where i is itself a param/loop var → indexing → list (default lean)
                votes[p]["list"] += 1
            else:
                votes[p]["list"] += 1
        # A PARAM USED AS A SLICE BOUND / SUBSCRIPT INDEX is an integer, regardless of which
        # collection it indexes. e.g. a[:k], a[i:j], a[k - 1], m[i]. The index/bound expression
        # is a numeric position, NOT the indexed collection -- so vote those param names 'num'.
        # Without this, head(a, k) -> a[:k] left k with no usage signal and the name heuristic
        # mis-typed k as a string (a[:'x'] raises TypeError on BOTH sides, so the off-by-one
        # a[:k-1] never executed and the divergence was missed -- py-06).
        # Exception: a STRING-CONSTANT subscript (d['key']) is a dict access, handled above; we
        # only walk Name/expression index positions here, never string constants.
        if isinstance(node, ast.Subscript):
            if isinstance(node.slice, ast.Slice):
                index_exprs = [node.slice.lower, node.slice.upper, node.slice.step]
            else:
                index_exprs = [node.slice]
            for ix in index_exprs:
                if ix is None:
                    continue
                # The index position may be a bare Name (a[k]) or an arithmetic expression on
                # one (a[k - 1], a[i + 1]). Any param Name appearing here is a numeric index.
                for sub in ast.walk(ix):
                    if isinstance(sub, ast.Name) and sub.id in votes:
                        votes[sub.id]["num"] += 1
        # method call p.<method>()
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and isinstance(node.func.value, ast.Name) and node.func.value.id in votes:
            p = node.func.value.id
            m = node.func.attr
            if m in _STR_METHODS:
                votes[p]["str"] += 1
            elif m in _DICT_METHODS:
                votes[p]["dict"] += 1
            elif m in _LIST_METHODS:
                votes[p]["list"] += 1
        # len(p) / range(p) / sum(p) / sorted(p) / max(p) / min(p)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            fn = node.func.id
            for arg in node.args:
                if isinstance(arg, ast.Name) and arg.id in votes:
                    if fn in ("len", "sorted", "sum", "max", "min", "list", "set",
                              "enumerate", "reversed", "any", "all"):
                        votes[arg.id]["list"] += 1
                    elif fn in ("range",):
                        votes[arg.id]["num"] += 1
                    elif fn in ("int", "abs", "float", "round"):
                        votes[arg.id]["num"] += 1
                    elif fn in ("str",):
                        votes[arg.id]["str"] += 1
        # arithmetic / numeric binops. Div/FloorDiv/Mod/Mult/Sub/Pow are unambiguously numeric
        # for their operands. Add is overloaded (list/str concatenation) so it only votes
        # numeric when the OTHER operand is a numeric literal (e.g. a + 1).
        if isinstance(node, ast.BinOp):
            if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod, ast.Mult, ast.Sub, ast.Pow)):
                for side in (node.left, node.right):
                    if isinstance(side, ast.Name) and side.id in votes:
                        votes[side.id]["num"] += 1
            elif isinstance(node.op, ast.Add):
                pairs_lr = ((node.left, node.right), (node.right, node.left))
                for nm_node, other in pairs_lr:
                    if isinstance(nm_node, ast.Name) and nm_node.id in votes \
                            and isinstance(other, ast.Constant) \
                            and isinstance(other.value, (int, float)) \
                            and not isinstance(other.value, bool):
                        votes[nm_node.id]["num"] += 1
        # numeric comparison (p < lo etc.) — only < <= > >= signal ordering on numbers
        if isinstance(node, ast.Compare):
            ops = node.ops
            if any(isinstance(o, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for o in ops):
                operands = [node.left] + list(node.comparators)
                for operand in operands:
                    if isinstance(operand, ast.Name) and operand.id in votes:
                        votes[operand.id]["num"] += 1

    result = {}
    for p, tally in votes.items():
        # list / dict usage is strong structural evidence; pick the dominant structural vote.
        if tally["dict"] > 0 and tally["dict"] >= tally["list"]:
            result[p] = "dict"
        elif tally["list"] > 0:
            result[p] = "list"
        elif tally["str"] > 0 and tally["str"] >= tally["num"]:
            result[p] = "str"
        elif tally["num"] > 0:
            # numeric: default to int (edge-biased ints dominate refactor bug classes); the
            # generator still mixes in float-friendly values via the 'int' edge set.
            result[p] = "int"
    return result


def _gen_value(kind, rng):
    if kind == "int":
        # Bias heavily toward edge ints; occasionally a wider random int.
        if rng.random() < 0.7:
            return rng.choice(_EDGE_INTS)
        return rng.randint(-50, 50)
    if kind == "float":
        return rng.choice([0.0, 1.0, -1.0, 0.5, -0.5, 2.5, rng.uniform(-10, 10)])
    if kind == "bool":
        return rng.choice([True, False])
    if kind == "str":
        return rng.choice(_EDGE_STRS)
    if kind == "strbytes":
        # A 'str | bytes' param: feed BOTH text and bytes so type-dispatch branches
        # (isinstance(x, str) vs isinstance(x, bytes), .decode vs str()) are exercised on
        # the values the function actually accepts — never None/ints (which it never receives).
        s = rng.choice(_EDGE_STRS)
        if rng.random() < 0.5:
            try:
                return s.encode("utf-8")
            except Exception:  # noqa: BLE001
                return b""
        return s
    if kind == "list":
        size = rng.choice([0, 0, 1, 1, 2, 3, 5])  # bias to empty/singleton
        return [rng.choice(_EDGE_INTS) for _ in range(size)]
    if kind == "dict":
        keys = ["a", "b", "c"]
        return {k: rng.choice(_EDGE_INTS) for k in keys if rng.random() < 0.5}
    if kind == "optional":
        # Mix None with falsy values (0, '', []) and truthy — this is the coercion edge.
        return rng.choice([None, 0, "", [], False, 1, "name", rng.choice(_EDGE_INTS)])
    # "any": permissive mixture.
    return rng.choice([0, 1, -1, "", "x", [], [1, 2], {}, None, rng.choice(_EDGE_INTS)])


def _hypothesis_strategy(kind):
    if kind == "int":
        return st.integers(min_value=-100, max_value=100)
    if kind == "float":
        return st.floats(allow_nan=False, allow_infinity=False, width=32)
    if kind == "bool":
        return st.booleans()
    if kind == "str":
        return st.text(max_size=8)
    if kind == "strbytes":
        return st.one_of(st.text(max_size=8), st.binary(max_size=8))
    if kind == "list":
        return st.lists(st.integers(min_value=-50, max_value=50), max_size=6)
    if kind == "dict":
        return st.dictionaries(st.sampled_from(["a", "b", "c", "z"]),
                               st.integers(min_value=-50, max_value=50), max_size=3)
    if kind == "optional":
        return st.one_of(st.none(), st.just(0), st.just(""), st.just([]),
                         st.integers(min_value=-50, max_value=50), st.text(max_size=5))
    return st.one_of(st.none(), st.integers(min_value=-50, max_value=50), st.text(max_size=5),
                     st.lists(st.integers(), max_size=4))


def _synth_args_rng(kinds, rng):
    return [_gen_value(k, rng) for k in kinds]


def _synth_args_hypothesis(kinds, n, seed):
    """Draw n argument-tuples deterministically via hypothesis's data generation."""
    from hypothesis.strategies import tuples
    from hypothesis import given, settings, HealthCheck
    drawn = []
    strat = tuples(*[_hypothesis_strategy(k) for k in kinds]) if kinds else st.just(())

    @settings(max_examples=n, derandomize=True, deadline=None,
              suppress_health_check=list(HealthCheck), database=None)
    @given(strat)
    def _collect(t):
        drawn.append(list(t))

    try:
        _collect()
    except Exception:  # noqa: BLE001 - if hypothesis bails, we still have whatever it drew
        pass
    return drawn


def _freeze_nondeterminism():
    time.time = lambda: 1_700_000_000.0  # type: ignore
    time.monotonic = lambda: 0.0  # type: ignore
    random.seed(0)


def _jsonsafe(x):
    try:
        json.dumps(x)
        return x
    except (TypeError, ValueError):
        return repr(x)


import types


def _materialize(result):
    """Make a return value comparable. Generators / non-list iterators yield different object
    identities (repr includes a memory address) on the before/after sides, so comparing the
    OBJECTS is meaningless. Instead we drain a generator / iterator to a bounded list of its
    produced values — the observable output a caller would actually see. The cap guards against
    an accidentally-infinite generator; both sides are capped identically so a divergence within
    the cap is real, and hitting the cap is recorded so it is never mistaken for equivalence."""
    if isinstance(result, types.GeneratorType) or (
        hasattr(result, "__next__") and hasattr(result, "__iter__")
        and not isinstance(result, (list, tuple, set, dict, str, bytes, bytearray))
    ):
        out = []
        capped = False
        cap = 10000
        for i, item in enumerate(result):
            if i >= cap:
                capped = True
                break
            out.append(_jsonsafe(item))
        return {"__iter__": out, "__capped__": capped}
    return _jsonsafe(result)


def _observe(fn, args):
    """Run fn on a deep copy of args; capture outcome, value/error, and post-call arg state."""
    local = copy.deepcopy(args)
    try:
        _freeze_nondeterminism()
        result = fn(*local)
        return {"outcome": "value", "value": _materialize(result),
                "argsAfter": [_jsonsafe(a) for a in local]}
    except Exception as e:  # noqa: BLE001 - exception type IS observable behaviour
        return {"outcome": "error", "error": type(e).__name__,
                "argsAfter": [_jsonsafe(a) for a in local]}


def _behaviour_eq(ob, oa):
    if ob["outcome"] != oa["outcome"]:
        return False
    if ob["outcome"] == "value":
        if ob["value"] != oa["value"]:
            return False
    else:
        if ob["error"] != oa["error"]:
            return False
    # Observable side effects: post-call argument state must match (catches mutation /
    # reordered-side-effect bugs where the *return* is identical but a list/dict arg differs).
    return ob["argsAfter"] == oa["argsAfter"]


def main():
    job = json.load(open(sys.argv[1], "r", encoding="utf-8"))
    target = (job.get("target") or "").strip()
    if not target:
        target = _detect_target(job["beforeFile"])
        if not target:
            print(json.dumps({"verdict": "unverified", "checked": 0,
                              "detail": "no target function supplied and none could be auto-detected",
                              "usedHypothesis": False}))
            return
    # PURITY GATE: refuse to differentially execute an impure / non-self-contained target.
    # Executing such a function yields a FALSE pass/divergence, so we decline honestly. The
    # gate is scoped to the BEFORE target body (the specification side).
    if job.get("checkPurity", True):
        reason = _check_purity(job["beforeFile"], target)
        if reason is not None:
            print(json.dumps({"verdict": "unverified", "checked": 0,
                              "detail": "impure: %s" % reason, "usedHypothesis": False}))
            return

    try:
        before = _load_func(job["beforeFile"], "before_mod", target)
        after = _load_func(job["afterFile"], "after_mod", target)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"verdict": "unverified", "checked": 0,
                          "detail": "load error: %s" % e, "usedHypothesis": False}))
        return

    # Derive input shape from the BEFORE signature only.
    try:
        params = _params(before)
    except (TypeError, ValueError) as e:
        print(json.dumps({"verdict": "unverified", "checked": 0,
                          "detail": "signature inspect error: %s" % e, "usedHypothesis": False}))
        return

    # Usage-guided inference from the BEFORE body refines untyped params so equivalent pairs
    # are not fed nonsensical inputs (None/garbage) they could never receive.
    usage = _infer_usage_kinds(job["beforeFile"], target, params)
    kinds = [_infer_kind(name, ann, usage.get(name)) for (name, ann, _default) in params]
    n = int(job.get("inputs", 2000))
    seed = int(job.get("seed", 1337))

    arg_tuples = []
    used_hyp = False
    if _HAS_HYPOTHESIS and job.get("useHypothesis", True):
        try:
            arg_tuples = _synth_args_hypothesis(kinds, n, seed)
            used_hyp = len(arg_tuples) > 0
        except Exception:  # noqa: BLE001
            arg_tuples = []
    # Always also include a deterministic edge-biased PRNG batch (and fill if hypothesis under-drew).
    rng = random.Random(seed)
    target_count = n if not arg_tuples else max(0, n - len(arg_tuples))
    for _ in range(target_count):
        arg_tuples.append(_synth_args_rng(kinds, rng))

    checked = 0
    for args in arg_tuples:
        ob = _observe(before, args)
        oa = _observe(after, args)
        checked += 1
        if not _behaviour_eq(ob, oa):
            print(json.dumps({
                "verdict": "divergence",
                "checked": checked,
                "usedHypothesis": used_hyp,
                "detail": "behaviour differs on synthesised input #%d" % checked,
                "divergingInput": {
                    "args": [_jsonsafe(a) for a in args],
                    "before": ob,
                    "after": oa,
                },
            }))
            return

    print(json.dumps({
        "verdict": "pass",
        "checked": checked,
        "usedHypothesis": used_hyp,
        "detail": "no divergence found across %d synthesised inputs" % checked,
    }))


if __name__ == "__main__":
    main()
`;

/** Shape of the JSON the harness prints. Kept internal; mapped to PythonEquivResult. */
interface RawVerdict {
  verdict: EquivVerdict;
  checked: number;
  detail: string;
  usedHypothesis?: boolean;
  divergingInput?: {
    args: unknown[];
    before: ObservedBehaviour;
    after: ObservedBehaviour;
  };
}

/**
 * Differentially verifies whether refactoring `beforeSource` → `afterSource` preserves the
 * behaviour of the function named `target`. Both sources must define a top-level function
 * with that exact name. Never throws — failures surface as `verdict: 'unverified'`.
 *
 * @param beforeSource  Full Python source of the ORIGINAL module (must define `target`).
 * @param afterSource   Full Python source of the REFACTORED module (must define `target`).
 * @param target        Name of the function to verify in both modules. When omitted/empty,
 *                      the engine auto-detects a top-level function from the source AST
 *                      (a sole function, else the last public top-level function).
 */
export async function verifyPythonEquivalence(
  beforeSource: string,
  afterSource: string,
  target?: string,
  options: PythonEquivOptions = {},
): Promise<PythonEquivResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const interp = await resolveInterpreter(options.python, Math.min(timeoutMs, 10_000));
  if (!interp) {
    return {
      verdict: 'unverified',
      detail:
        'no usable Python interpreter found (set HEALTHY_AI_PYTHON to an interpreter with the stdlib)',
      checked: 0,
      usedHypothesis: false,
    };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'py-equiv-'));
  try {
    const beforeFile = path.join(tmpDir, 'before_mod.py');
    const afterFile = path.join(tmpDir, 'after_mod.py');
    const harnessFile = path.join(tmpDir, 'harness.py');
    const jobFile = path.join(tmpDir, 'job.json');

    const job = {
      beforeFile,
      afterFile,
      target: target ?? '',
      inputs: options.inputs ?? 2000,
      seed: options.seed ?? 1337,
      useHypothesis: true,
      checkPurity: options.checkPurity ?? true,
    };

    await Promise.all([
      fs.writeFile(beforeFile, beforeSource, 'utf8'),
      fs.writeFile(afterFile, afterSource, 'utf8'),
      fs.writeFile(harnessFile, GENERATED_HARNESS, 'utf8'),
      fs.writeFile(jobFile, JSON.stringify(job), 'utf8'),
    ]);

    const res = await runProcess(interp, [harnessFile, jobFile], timeoutMs);

    if (res.spawnError) {
      return {
        verdict: 'unverified',
        detail: `failed to spawn interpreter ${interp}: ${res.spawnError.message}`,
        checked: 0,
        usedHypothesis: false,
      };
    }

    const stdout = res.stdout.trim();
    if (!stdout) {
      return {
        verdict: 'unverified',
        detail:
          res.code === null
            ? `harness timed out after ${timeoutMs}ms` +
              (res.stderr ? `: ${res.stderr.trim().slice(-400)}` : '')
            : `harness produced no output (exit ${res.code})` +
              (res.stderr ? `: ${res.stderr.trim().slice(-400)}` : ''),
        checked: 0,
        usedHypothesis: false,
      };
    }

    let raw: RawVerdict;
    try {
      // The harness prints exactly one JSON object; take the last line defensively.
      const lastLine = stdout.split(/\r?\n/).filter(Boolean).pop() ?? stdout;
      raw = JSON.parse(lastLine) as RawVerdict;
    } catch (parseErr) {
      return {
        verdict: 'unverified',
        detail: `could not parse harness output: ${(parseErr as Error).message}; raw="${stdout.slice(
          0,
          300,
        )}"`,
        checked: 0,
        usedHypothesis: false,
      };
    }

    if (raw.verdict === 'divergence' && raw.divergingInput) {
      return {
        verdict: 'divergence',
        divergingInput: {
          args: raw.divergingInput.args,
          before: raw.divergingInput.before,
          after: raw.divergingInput.after,
        },
        detail: raw.detail,
        checked: raw.checked,
        usedHypothesis: Boolean(raw.usedHypothesis),
      };
    }

    if (raw.verdict === 'pass') {
      return {
        verdict: 'pass',
        detail: raw.detail,
        checked: raw.checked,
        usedHypothesis: Boolean(raw.usedHypothesis),
      };
    }

    return {
      verdict: 'unverified',
      detail: raw.detail || 'harness reported unverified',
      checked: raw.checked ?? 0,
      usedHypothesis: Boolean(raw.usedHypothesis),
    };
  } catch (err) {
    return {
      verdict: 'unverified',
      detail: `internal error: ${(err as Error).message}`,
      checked: 0,
      usedHypothesis: false,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Adapter to the unified behavior-equiv dispatcher contract ──────────────────
//
// The sibling dispatcher (./index.ts) expects each language engine to expose
//   verify<Lang>Equiv(before, after, targetFunction?): Promise<VerifyResult>
// where VerifyResult uses verdict 'equivalent' | 'divergence' | 'unverified'.
// This adapter maps the richer PythonEquivResult onto that shape without duplicating
// any logic. It lives here (not in index.ts) so this build unit stays self-contained.

/** Verdict surface used by the unified dispatcher (./index.ts). */
type DispatcherVerdict = 'equivalent' | 'divergence' | 'unverified';

/** Result shape consumed by the unified dispatcher (./index.ts). Kept structurally in sync. */
export interface DispatcherVerifyResult {
  verdict: DispatcherVerdict;
  mode: 'dynamic' | 'static-only-advisory';
  inputsTested?: number;
  divergingInput?: string;
  reason: string;
  staticNote?: string;
}

/**
 * Dispatcher-facing entry point. Runs the Python differential-equivalence engine and maps
 * its result onto the unified {@link DispatcherVerifyResult} contract used by
 * ./index.ts's `verifyRefactor`. A `pass` (no divergence found) maps to `'equivalent'`;
 * a `divergence` maps to `'divergence'` with the witnessing input stringified; an
 * `unverified` engine result stays `'unverified'` in `static-only-advisory` mode so the
 * honesty contract is preserved (never claim equivalence the engine could not establish).
 */
export async function verifyPythonEquiv(
  before: string,
  after: string,
  targetFunction?: string,
): Promise<DispatcherVerifyResult> {
  const r = await verifyPythonEquivalence(before, after, targetFunction);

  if (r.verdict === 'divergence') {
    return {
      verdict: 'divergence',
      mode: 'dynamic',
      inputsTested: r.checked,
      divergingInput: r.divergingInput ? JSON.stringify(r.divergingInput) : undefined,
      reason: r.detail,
    };
  }

  if (r.verdict === 'pass') {
    return {
      verdict: 'equivalent',
      mode: 'dynamic',
      inputsTested: r.checked,
      reason: r.detail,
    };
  }

  // unverified — the engine could not run (no interpreter, missing target, etc.).
  return {
    verdict: 'unverified',
    mode: 'static-only-advisory',
    reason: r.detail,
  };
}
