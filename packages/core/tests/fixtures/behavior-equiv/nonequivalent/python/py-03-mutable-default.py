# pair: py-03-mutable-default
# expected: divergent
# bugClass: mutable-default-arg
# description: append_item: mutable list default accumulates across calls.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(item, acc=None):
    """Correct: new list each call when acc is not provided."""
    if acc is None:
        acc = []
    return acc + [item]


_SHARED = []


def after(item, acc=_SHARED):
    """BUG: mutable default arg — acc persists between calls, accumulating garbage."""
    acc.append(item)
    return acc


# Divergence witness:
#   before(1) -> [1]; before(2) -> [2]  (independent)
#   after(1)  -> [1]; after(2)  -> [1, 2]  (accumulates)
