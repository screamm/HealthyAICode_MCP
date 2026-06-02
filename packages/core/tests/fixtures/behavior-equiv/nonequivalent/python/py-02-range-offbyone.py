# pair: py-02-range-offbyone
# expected: divergent
# bugClass: off-by-one
# description: sum_range: range(1, n) skips index 0, dropping first element.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(a):
    """Correct: sums all elements."""
    s = 0
    for v in a:
        s += v
    return s


def after(a):
    """BUG: range(1, len(a)) skips a[0], drops first element."""
    s = 0
    for i in range(1, len(a)):
        s += a[i]
    return s


# Divergence witness: before([3, 1, 2]) == 6, after([3, 1, 2]) == 3
