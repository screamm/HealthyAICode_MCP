# pair: py-eq-04-extract-method
# expected: equivalent
# bugClass: none
# description: normalize: inline expression extracted to named local variables. Semantics unchanged.
# provenance: arXiv:2602.15761 extract-method class


def before(s):
    return s.strip().lower().replace(" ", "-")


def after(s):
    stripped = s.strip()
    lowered = stripped.lower()
    return lowered.replace(" ", "-")


# Functionally identical for all strings.
