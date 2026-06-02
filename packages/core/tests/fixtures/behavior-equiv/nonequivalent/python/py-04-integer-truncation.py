# pair: py-04-integer-truncation
# expected: divergent
# bugClass: integer-truncation
# description: halve: // floor-division changes result for odd integers and negatives.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(n):
    """Returns exact half (float for odd n)."""
    return n / 2


def after(n):
    """BUG: floor division truncates — 3//2==1 not 1.5, -3//2==-2 not -1.5."""
    return n // 2


# Divergence witness: before(3) == 1.5, after(3) == 1
# Also: before(-3) == -1.5, after(-3) == -2
