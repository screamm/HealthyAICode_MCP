# pair: py-eq-07-use-builtin
# expected: equivalent
# bugClass: none
# description: max_val: explicit max-tracking loop replaced by `max()` builtin. Semantics identical.
# provenance: arXiv:2602.15761 use-library-function class


def before(a):
    if not a:
        return None
    m = a[0]
    for v in a[1:]:
        if v > m:
            m = v
    return m


def after(a):
    if not a:
        return None
    return max(a)


# max() is defined to return the same value as the manual loop for finite numeric lists.
