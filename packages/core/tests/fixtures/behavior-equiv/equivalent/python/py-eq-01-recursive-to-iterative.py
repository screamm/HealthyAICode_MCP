# pair: py-eq-01-recursive-to-iterative
# expected: equivalent
# bugClass: none
# description: factorial: recursive replaced by iterative loop. Same result for all n >= 0.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(n):
    return 1 if n <= 1 else n * before(n - 1)


def after(n):
    r = 1
    for i in range(2, n + 1):
        r *= i
    return r


# Both return same value for all non-negative integers.
# before(0)==1, after(0)==1; before(5)==120, after(5)==120
