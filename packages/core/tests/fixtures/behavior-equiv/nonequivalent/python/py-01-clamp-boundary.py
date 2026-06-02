# pair: py-01-clamp-boundary
# expected: divergent
# bugClass: boundary-condition
# description: Lower-bound clamp returns lo+1 instead of lo at x===lo.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(x, lo, hi):
    """Correct clamp: returns lo when x <= lo, hi when x >= hi."""
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x


def after(x, lo, hi):
    """BUG: injected boundary break — returns lo+1 when x is exactly lo."""
    if x < lo:
        return lo + 1  # off-by-one at exact lower boundary
    if x > hi:
        return hi
    return x


# Divergence witness: before(5, 5, 10) == 5, after(5, 5, 10) == 6
