# pair: py-05-truthy-coercion
# expected: divergent
# bugClass: falsy-coercion
# description: pick: `val or fallback` fires on 0 and '' where None-check would not.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(val, fallback):
    """Correct: only substitute fallback when val is None."""
    return val if val is not None else fallback


def after(val, fallback):
    """BUG: `or` treats 0, '', [], False as missing — changes semantics for falsy non-None."""
    return val or fallback


# Divergence witness: before(0, 'x') == 0, after(0, 'x') == 'x'
# Also: before('', 'x') == '', after('', 'x') == 'x'
