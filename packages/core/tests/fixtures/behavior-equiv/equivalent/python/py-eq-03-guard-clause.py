# pair: py-eq-03-guard-clause
# expected: equivalent
# bugClass: none
# description: safe_div: try/except ZeroDivisionError replaced by explicit guard. Same result.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None


def after(a, b):
    if b == 0:
        return None
    return a / b


# Equivalent for all (a, b) where b is numeric.
