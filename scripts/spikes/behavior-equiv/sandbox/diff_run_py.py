"""Differential-execution sandbox for Python before/after pairs.

Honest design:
  * Input synthesis is driven ONLY by arg_spec (the shape inferred from the
    `before` signature). The runner never inspects the injected bug or any
    expected outputs.
  * Nondeterminism is neutralized: a single seeded PRNG drives input synthesis,
    and time/random are frozen identically for both `before` and `after` so a
    divergence reflects a real semantic difference, not flakiness.
  * Observable behavior = (return value) OR (exception type). A thrown error in
    one side and a value/other-error in the other counts as DIVERGENCE.

Output: JSON to stdout: {id: {"verdict": "EQUIVALENT"|"DIVERGENCE"|"UNVERIFIED",
                              "checked": n, "firstCounterexample": ...}}
"""
import importlib.util
import json
import os
import random
import sys
import time
import copy

SEED = 1337
N_INPUTS = 2000  # function-level budget, mirrors arXiv:2602.15761 (2000/fn)

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "..", "corpus", "py", "pairs.py")


def load_pairs():
    spec = importlib.util.spec_from_file_location("pairs", CORPUS)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.PAIRS


def synth_value(spec_tok, rng):
    """Synthesize one argument value from a shape token using the seeded rng."""
    if spec_tok == "int":
        return rng.randint(-50, 50)
    if spec_tok == "int_or_zero":
        # deliberately weight 0 / falsy values to exercise coercion edges
        return rng.choice([0, 0, rng.randint(-5, 5), rng.randint(1, 30)])
    if spec_tok == "small_non_neg_int":
        return rng.randint(0, 8)
    if spec_tok == "int_arr":
        n = rng.randint(0, 8)  # includes empty array edge
        return [rng.randint(-20, 20) for _ in range(n)]
    if spec_tok == "str_arr":
        n = rng.randint(0, 5)
        return [rng.choice(["a", "b", "c", ""]) for _ in range(n)]
    if spec_tok == "str":
        return rng.choice(["", "x", "Hello World", "  pad  ", "a b c"])
    if spec_tok == "str_or_none":
        return rng.choice([None, "", "name"])
    if spec_tok == "missing_key":
        # produce a (dict, key) where key may or may not be present
        keys = ["a", "b", "c"]
        d = {k: rng.randint(0, 9) for k in keys if rng.random() < 0.5}
        key = rng.choice(keys + ["z"])  # 'z' is always absent
        return [d, key]
    raise ValueError(f"unknown spec token {spec_tok}")


def synth_args(arg_spec, rng):
    args = []
    for tok in arg_spec:
        v = synth_value(tok, rng)
        if tok == "missing_key":
            args.extend(v)  # (dict, key) expands to two positional args
        else:
            args.append(v)
    return args


def freeze_nondeterminism():
    """Freeze time/random so both sides observe identical environment."""
    time.time = lambda: 1_700_000_000.0  # type: ignore
    time.monotonic = lambda: 0.0  # type: ignore
    random.seed(0)  # any in-code random() use is reproducible & identical per call


def observe(fn, args):
    """Run fn on a deep copy of args; return ('value', result) or ('error', type)."""
    try:
        # deep-copy so mutable-default / aliasing bugs are observable, and so the
        # two sides never share state through the args we pass them.
        result = fn(*copy.deepcopy(args))
        return ("value", result)
    except Exception as e:  # noqa: BLE001 - exception type IS observable behavior
        return ("error", type(e).__name__)


def diff_pair(pair):
    before, after = pair["before"], pair["after"]
    arg_spec = pair["arg_spec"]
    rng = random.Random(SEED)
    checked = 0
    for _ in range(N_INPUTS):
        args = synth_args(arg_spec, rng)
        freeze_nondeterminism()
        ob = observe(before, args)
        freeze_nondeterminism()
        oa = observe(after, args)
        checked += 1
        if ob != oa:
            return {"verdict": "DIVERGENCE", "checked": checked,
                    "firstCounterexample": {"args": _safe(args),
                                            "before": _safe(ob), "after": _safe(oa)}}
    return {"verdict": "EQUIVALENT", "checked": checked, "firstCounterexample": None}


def _safe(x):
    try:
        json.dumps(x)
        return x
    except (TypeError, ValueError):
        return repr(x)


def main():
    pairs = load_pairs()
    out = {}
    for pid, pair in pairs.items():
        try:
            out[pid] = diff_pair(pair)
        except Exception as e:  # noqa: BLE001
            out[pid] = {"verdict": "UNVERIFIED", "checked": 0, "error": str(e)}
    print(json.dumps(out))


if __name__ == "__main__":
    main()
