# pair: py-07-dict-default
# expected: divergent
# bugClass: dropped-edge-case
# description: count_get: d[key] raises KeyError on missing key; d.get(key, 0) returns 0.
# provenance: scripts/spikes/behavior-equiv/corpus/py/pairs.py


def before(d, key):
    """Returns 0 for missing keys."""
    return d.get(key, 0)


def after(d, key):
    """BUG: direct index raises KeyError when key is absent."""
    return d[key]


# Divergence witness: before({}, 'x') == 0, after({}, 'x') -> KeyError
