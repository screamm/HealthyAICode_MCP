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


def _infer_kind(name, ann):
    n = (name or "").lower()
    a = (ann or "").lower()
    if a:
        if a in ("int",):
            return "int"
        if a in ("float",):
            return "float"
        if a in ("str", "string"):
            return "str"
        if a in ("bool",):
            return "bool"
        if a.startswith("list") or a.endswith("[]") or a in ("list", "sequence", "iterable"):
            return "list"
        if a.startswith("dict") or a in ("dict", "mapping"):
            return "dict"
        if "optional" in a or "none" in a:
            return "optional"
    # Heuristics from common parameter names.
    if n in ("log", "logs", "history", "trace", "acc", "accumulator", "out", "sink"):
        return "list"  # often a mutated side-effect collection
    if n in ("items", "values", "arr", "array", "nums", "numbers", "xs", "data", "elements", "seq"):
        return "list"
    if n in ("d", "dict", "mapping", "table", "counts", "m"):
        return "dict"
    if n in ("key", "k", "name", "label", "s", "text", "word"):
        return "str"
    if n in ("n", "i", "j", "x", "y", "count", "limit", "lo", "hi", "low", "high", "idx", "index", "size", "len"):
        return "int"
    if n in ("val", "value", "v", "fallback", "default", "opt", "maybe"):
        return "optional"
    return "any"


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


def _observe(fn, args):
    """Run fn on a deep copy of args; capture outcome, value/error, and post-call arg state."""
    local = copy.deepcopy(args)
    try:
        _freeze_nondeterminism()
        result = fn(*local)
        return {"outcome": "value", "value": _jsonsafe(result),
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

    kinds = [_infer_kind(name, ann) for (name, ann, _default) in params]
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
