# pair: py-10-reordered-sideeffect
# expected: divergent
# bugClass: reordered-side-effects
# description: log_and_compute: logging moved after computation; when computation raises, log is skipped.
# provenance: arXiv:2602.15761 pattern — observable reordering of side effects
# NOTE: This pair captures observable ordering; in a pure differential-execution harness
# the log list (captured as return value) documents the divergence.


def before(values, log):
    """Appends 'start' to log BEFORE dividing — log records attempt even on ZeroDivisionError."""
    log.append("start")
    result = sum(v / values[0] for v in values)  # raises if values[0] == 0
    return result


def after(values, log):
    """BUG: 'start' appended AFTER computation — log never updated when division raises."""
    result = sum(v / values[0] for v in values)
    log.append("start")  # never reached if values[0] == 0
    return result


# Divergence witness (observable via log list):
#   log = []
#   try: before([0, 1], log) except: pass  -> log == ['start']
#   log = []
#   try: after([0, 1], log) except: pass   -> log == []
