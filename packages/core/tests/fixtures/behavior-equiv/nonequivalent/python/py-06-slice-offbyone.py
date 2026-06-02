# pair: py-06-slice-offbyone
# expected: divergent
# bugClass: off-by-one
# description: head(a, k): slice a[:k-1] instead of a[:k] drops the kth element.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(a, k):
    """Returns first k elements."""
    return a[:k]


def after(a, k):
    """BUG: k-1 shifts slice bound; drops last intended element."""
    return a[: k - 1]


# Divergence witness: before([1,2,3,4,5], 3) == [1,2,3], after([1,2,3,4,5], 3) == [1,2]
