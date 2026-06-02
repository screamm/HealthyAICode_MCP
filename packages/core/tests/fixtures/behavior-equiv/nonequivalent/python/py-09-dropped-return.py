# pair: py-09-dropped-return
# expected: divergent
# bugClass: dropped-return-value
# description: accumulate: early-return path removed; always returns None instead of partial result.
# provenance: arXiv:2502.18454 finding — LLM drops guard-clause return during cleanup


def before(items, limit):
    """Sums items up to limit; returns partial sum if limit is hit early."""
    total = 0
    for v in items:
        if total + v > limit:
            return total  # early return with partial result
        total += v
    return total


def after(items, limit):
    """BUG: early return removed; function always runs to end but implicit None when limit hit."""
    total = 0
    for v in items:
        if total + v > limit:
            pass  # BUG: dropped return, falls through to loop end then returns total
            # Actually returns total at end of loop — but semantics differ when
            # we mutate total AFTER the guard. Original returned BEFORE adding.
            # To make the divergence concrete: after adds v even past limit.
            total += v  # BUG: still accumulates after limit exceeded
            continue
        total += v
    return total


# Divergence witness: before([1, 2, 10, 1], 5) == 3 (stops before 10), after == 14 (adds everything)
