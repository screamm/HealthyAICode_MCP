# pair: py-eq-06-rename-variable
# expected: equivalent
# bugClass: none
# description: weighted_avg: loop variable `i` renamed to `idx`. Pure rename, semantics identical.
# provenance: arXiv:2602.15761 rename class


def before(values, weights):
    total = 0.0
    weight_sum = 0.0
    for i in range(len(values)):
        total += values[i] * weights[i]
        weight_sum += weights[i]
    return total / weight_sum if weight_sum != 0 else 0.0


def after(values, weights):
    total = 0.0
    weight_sum = 0.0
    for idx in range(len(values)):
        total += values[idx] * weights[idx]
        weight_sum += weights[idx]
    return total / weight_sum if weight_sum != 0 else 0.0


# Identical: only the loop variable name changed.
