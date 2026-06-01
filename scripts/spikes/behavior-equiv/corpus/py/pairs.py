"""Python before/after pairs.

`arg_spec` declares the shape of each argument so the harness can SYNTHESIZE
characterization inputs. Spec tokens mirror the TS side:
  int, int_arr, str_arr, str, int_or_zero, small_non_neg_int,
  str_or_none, missing_key.
"""


# ---- ts-style boundary bug ----
def clamp_before(x, lo, hi):
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x


def clamp_after(x, lo, hi):
    # BUG: < instead of <= at lower bound (clamps one short)
    if x <= lo:  # equivalent here; the real divergence is below
        pass
    if x < lo:
        return lo + 1  # injected boundary break
    if x > hi:
        return hi
    return x


def sum_range_before(a):
    s = 0
    for v in a:
        s += v
    return s


def sum_range_after(a):
    # BUG: off-by-one, range(1, n) drops first element
    s = 0
    for i in range(1, len(a)):
        s += a[i]
    return s


def append_item_before(item, acc=None):
    if acc is None:
        acc = []
    acc = acc + [item]
    return acc


_SHARED = []


def append_item_after(item, acc=_SHARED):
    # BUG: mutable default arg accumulates across calls
    acc.append(item)
    return acc


def halve_before(n):
    return n / 2


def halve_after(n):
    # BUG: integer floor division changes result for odd n
    return n // 2


def pick_before(val, fallback):
    return val if val is not None else fallback


def pick_after(val, fallback):
    # BUG: truthy 'or' fires on 0 / '' / empty
    return val or fallback


def head_before(a, k):
    return a[:k]


def head_after(a, k):
    # BUG: off-by-one slice bound
    return a[: k - 1]


def count_get_before(d, key):
    return d.get(key, 0)


def count_get_after(d, key):
    # BUG: direct index raises KeyError on missing key
    return d[key]


def factorial_before(n):
    return 1 if n <= 1 else n * factorial_before(n - 1)


def factorial_after(n):
    r = 1
    for i in range(2, n + 1):
        r *= i
    return r


def evens_before(a):
    out = []
    for v in a:
        if v % 2 == 0:
            out.append(v)
    return out


def evens_after(a):
    return [v for v in a if v % 2 == 0]


def safe_div_before(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None


def safe_div_after(a, b):
    if b == 0:
        return None
    return a / b


PAIRS = {
    "py-clamp-boundary": {"fn": "clamp", "arg_spec": ["int", "int", "int"],
                          "before": clamp_before, "after": clamp_after},
    "py-range-offbyone": {"fn": "sum_range", "arg_spec": ["int_arr"],
                          "before": sum_range_before, "after": sum_range_after},
    "py-mutable-default": {"fn": "append_item", "arg_spec": ["int"],
                           "before": append_item_before, "after": append_item_after},
    "py-int-div": {"fn": "halve", "arg_spec": ["int"],
                   "before": halve_before, "after": halve_after},
    "py-truthy": {"fn": "pick", "arg_spec": ["int_or_zero", "str"],
                  "before": pick_before, "after": pick_after},
    "py-slice-offbyone": {"fn": "head", "arg_spec": ["int_arr", "small_non_neg_int"],
                          "before": head_before, "after": head_after},
    "py-dict-default": {"fn": "count_get", "arg_spec": ["missing_key"],
                        "before": count_get_before, "after": count_get_after},
    "py-rename-eq": {"fn": "factorial", "arg_spec": ["small_non_neg_int"],
                     "before": factorial_before, "after": factorial_after},
    "py-comprehension-eq": {"fn": "evens", "arg_spec": ["int_arr"],
                            "before": evens_before, "after": evens_after},
    "py-guard-eq": {"fn": "safe_div", "arg_spec": ["int", "int"],
                    "before": safe_div_before, "after": safe_div_after},
}
