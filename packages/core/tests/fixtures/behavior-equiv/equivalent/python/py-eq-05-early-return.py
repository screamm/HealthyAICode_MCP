# pair: py-eq-05-early-return
# expected: equivalent
# bugClass: none
# description: find_positive: nested if-else flattened to early return. Behavior unchanged.
# provenance: arXiv:2602.15761 guard-clause / early-return class


def before(a):
    result = None
    if len(a) > 0:
        if a[0] > 0:
            result = a[0]
        else:
            result = None
    return result


def after(a):
    if not a:
        return None
    if a[0] > 0:
        return a[0]
    return None


# Same output for empty lists, positive first element, non-positive first element.
