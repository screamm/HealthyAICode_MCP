# pair: py-eq-02-comprehension
# expected: equivalent
# bugClass: none
# description: evens: explicit for-loop replaced by list comprehension. Semantics identical.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(a):
    out = []
    for v in a:
        if v % 2 == 0:
            out.append(v)
    return out


def after(a):
    return [v for v in a if v % 2 == 0]


# Identical output for all lists.
