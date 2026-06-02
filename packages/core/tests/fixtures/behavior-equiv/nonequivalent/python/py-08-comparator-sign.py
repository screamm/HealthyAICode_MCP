# pair: py-08-comparator-sign
# expected: divergent
# bugClass: comparator-sign-swap
# description: top_n: sort key reversed; ascending instead of descending returns wrong top elements.
# provenance: arXiv:2602.15761 Table 2 pattern — sort key sign flip


def before(a, n):
    """Returns n largest elements in descending order."""
    return sorted(a, reverse=True)[:n]


def after(a, n):
    """BUG: reverse=True removed; returns n smallest instead of n largest."""
    return sorted(a)[:n]


# Divergence witness: before([3, 1, 4, 1, 5], 2) == [5, 4], after([3, 1, 4, 1, 5], 2) == [1, 1]
