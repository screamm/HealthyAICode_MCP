"""Benchmark fixture: refactored Python — healthy-code AFTER comparison.

All smells from bad-python.py have been addressed:
  - deep nesting eliminated via guard clauses and extracted helpers
  - magic numbers replaced with named constants
  - docstrings added to every function
  - statistics module used instead of manual loops
"""

from dataclasses import dataclass, field as dc_field
import re
import statistics
from typing import Any

# ─── Shipping constants ───────────────────────────────────────────────────────
_STANDARD_RATES: list[tuple[float, float]] = [
    (0.5, 3.99), (2.0, 5.99), (5.0, 8.99), (10.0, 12.99),
]
_STANDARD_EXCESS_RATE = 1.25
_EXPRESS_RATES: list[tuple[float, float]] = [
    (0.5, 9.99), (2.0, 14.99), (5.0, 21.99),
]
_EXPRESS_EXCESS_RATE = 2.50
_OVERNIGHT_BASE = 39.99
_OVERNIGHT_PER_KG = 4.99
_FUEL_SURCHARGE_RATE = 0.16
_REMOTE_AREA_RATE = 0.25
_REMOTE_DESTINATIONS = frozenset({'AK', 'HI', 'PR', 'GU', 'VI'})
_INSURANCE_HIGH_THRESHOLD = 50.0
_INSURANCE_HIGH_RATE = 0.03
_INSURANCE_MINIMUM = 1.50
_TIER_DISCOUNTS: dict[str, float] = {'gold': 0.10, 'silver': 0.05}
_VALID_PRIORITIES = frozenset({'standard', 'express', 'overnight'})

# ─── Statistics constants ────────────────────────────────────────────────────
_PERCENTILE_POINTS = [10, 25, 75, 90, 95, 99]
_ROUND_SHIPPING = 2    # decimal places for monetary shipping values
_ROUND_STATS = 4       # decimal places for statistical output values
_PERCENT = 100         # divisor for percentile index calculation
_MIN_SECRET_LENGTH = 16  # minimum acceptable length for passwords/secrets


# ─── Domain objects ───────────────────────────────────────────────────────────

@dataclass
class ShippingRequest:
    """A shipping request capturing all parameters needed to compute costs."""

    weight: float
    destination: str
    priority: str
    account: dict[str, Any]


@dataclass
class FieldContext:
    """Encapsulates validation context for a single config field."""

    key: str
    value: Any
    rules: dict[str, Any]
    errors: list[str] = dc_field(default_factory=list)


# ─── Shipping helpers ─────────────────────────────────────────────────────────

def _tiered_rate(weight: float, tiers: list[tuple[float, float]], excess_rate: float) -> float:
    """Returns the shipping rate for *weight* using a tiered rate table.

    Each tier is a (max_weight, rate) pair. For weights exceeding the last
    tier the rate is last_tier_rate + (weight - last_tier_max) * excess_rate.
    """
    for max_weight, rate in tiers:
        if weight <= max_weight:
            return rate
    last_max, last_rate = tiers[-1]
    return last_rate + (weight - last_max) * excess_rate


def _is_valid_request(req: ShippingRequest) -> bool:
    """Returns True when the shipping request has valid, non-empty inputs."""
    if not (req.weight and req.weight > 0 and req.destination):
        return False
    if not (req.account and req.account.get('active')):
        return False
    return req.priority in _VALID_PRIORITIES


def _compute_base_rate(weight: float, priority: str) -> float:
    """Returns the base shipping rate for the given weight and priority."""
    if priority == 'standard':
        return _tiered_rate(weight, _STANDARD_RATES, _STANDARD_EXCESS_RATE)
    if priority == 'express':
        return _tiered_rate(weight, _EXPRESS_RATES, _EXPRESS_EXCESS_RATE)
    return _OVERNIGHT_BASE + weight * _OVERNIGHT_PER_KG


def _compute_insurance(base_rate: float, account: dict[str, Any]) -> float:
    """Returns the insurance surcharge based on base rate and account settings."""
    if not account.get('insurance_required'):
        return 0.0
    return (base_rate * _INSURANCE_HIGH_RATE
            if base_rate > _INSURANCE_HIGH_THRESHOLD else _INSURANCE_MINIMUM)


def calculate_shipping_cost(req: ShippingRequest) -> float | None:
    """Calculates the total shipping cost for a package.

    Applies base rate, fuel surcharge, remote-area fee, insurance, and
    tier-based discount. Returns None when the request is invalid or the
    account is inactive.
    """
    if not _is_valid_request(req):
        return None
    base_rate = _compute_base_rate(req.weight, req.priority)
    fuel = base_rate * _FUEL_SURCHARGE_RATE
    remote = base_rate * _REMOTE_AREA_RATE if req.destination in _REMOTE_DESTINATIONS else 0.0
    insurance = _compute_insurance(base_rate, req.account)
    discount = _TIER_DISCOUNTS.get(req.account.get('tier', ''), 0.0) * (base_rate + fuel)
    return round(base_rate + fuel + remote + insurance - discount, _ROUND_SHIPPING)


# ─── Config validation helpers ────────────────────────────────────────────────

def _validate_int(ctx: FieldContext) -> int | None:
    """Validates and coerces a field to int, appending any errors."""
    value = ctx.value
    if not isinstance(value, int):
        try:
            value = int(value)
        except (ValueError, TypeError):
            ctx.errors.append(f'Field {ctx.key} must be an integer')
            return None
    if 'min' in ctx.rules and value < ctx.rules['min']:
        ctx.errors.append(f'Field {ctx.key} must be >= {ctx.rules["min"]}')
    if 'max' in ctx.rules and value > ctx.rules['max']:
        ctx.errors.append(f'Field {ctx.key} must be <= {ctx.rules["max"]}')
    return value


# Ordered validation rules for string fields: (rule_key, error_template, predicate).
_STR_CONSTRAINTS: list[tuple[str, str, Any]] = [
    ('min_length', 'must be at least {r} chars', lambda v, r: len(v) < r),
    ('max_length', 'must be at most {r} chars', lambda v, r: len(v) > r),
    ('pattern', 'does not match required pattern', lambda v, r: not re.match(r, v)),
]


def _validate_str(ctx: FieldContext) -> str | None:
    """Validates a string field against length and regex pattern rules."""
    if not isinstance(ctx.value, str):
        ctx.errors.append(f'Field {ctx.key} must be a string')
        return None
    for rule_key, msg_tmpl, check in _STR_CONSTRAINTS:
        if rule_key in ctx.rules and check(ctx.value, ctx.rules[rule_key]):
            ctx.errors.append(f'Field {ctx.key} {msg_tmpl.format(r=ctx.rules[rule_key])}')
    return ctx.value


def _coerce_bool(value: Any) -> bool | None:
    """Coerces common truthy/falsy representations to bool.

    Returns None when the value cannot be coerced.
    """
    if isinstance(value, bool):
        return value
    if value in ('true', 'True', '1', 1):
        return True
    if value in ('false', 'False', '0', 0):
        return False
    return None


def _validate_list(ctx: FieldContext) -> list | None:
    """Validates a list field and optionally checks item types."""
    if not isinstance(ctx.value, list):
        ctx.errors.append(f'Field {ctx.key} must be a list')
        return None
    allowed = ctx.rules.get('items')
    if not allowed:
        return ctx.value
    type_map: dict[str, type | tuple] = {'str': str, 'int': int, 'float': (int, float)}
    expected = type_map.get(allowed)
    if expected:
        for idx, item in enumerate(ctx.value):
            if not isinstance(item, expected):
                ctx.errors.append(f'Field {ctx.key}[{idx}] must be a {allowed}')
    return ctx.value


def _check_production_warnings(
    key: str, value: Any, environment: str, warnings: list[str]
) -> None:
    """Appends security warnings for risky field values in production."""
    if environment != 'production':
        return
    if key.endswith('_debug') and value:
        warnings.append(f'Debug flag {key} is enabled in production')
    if (key.endswith('_password') or key.endswith('_secret')) and len(str(value)) < _MIN_SECRET_LENGTH:
        warnings.append(f'Secret {key} appears too short for production')


# Dispatch table mapping schema type names to their validation functions.
_FIELD_VALIDATORS: dict[str, Any] = {
    'int': _validate_int,
    'str': _validate_str,
    'list': _validate_list,
}


def _process_field_value(ctx: FieldContext, environment: str) -> Any:
    """Validates and coerces a field value; returns the processed value or None on error."""
    expected_type = ctx.rules.get('type')
    if expected_type == 'bool':
        coerced = _coerce_bool(ctx.value)
        if coerced is None:
            ctx.errors.append(f'Field {ctx.key} must be a boolean')
            return None
        return coerced
    if expected_type in _FIELD_VALIDATORS:
        return _FIELD_VALIDATORS[expected_type](ctx)
    return ctx.value


def parse_and_validate_config(
    config_data: Any,
    schema: dict[str, Any],
    environment: str,
) -> tuple[dict | None, list[str], list[str]]:
    """Parses and validates a configuration dictionary against a schema.

    Returns (parsed_config, errors, warnings). Returns (None, errors, []) when
    config_data is not a dict.
    """
    if not isinstance(config_data, dict):
        return None, ['Config must be a dictionary'], []

    errors: list[str] = []
    warnings: list[str] = []
    parsed: dict[str, Any] = {}

    for key, rules in schema.items():
        if rules.get('required') and key not in config_data:
            errors.append(f'Missing required field: {key}')
            continue
        if key not in config_data:
            continue
        ctx = FieldContext(key=key, value=config_data[key], rules=rules, errors=errors)
        value = _process_field_value(ctx, environment)
        if value is not None:
            _check_production_warnings(key, value, environment, warnings)
            parsed[key] = value

    return parsed, errors, warnings


def compute_statistics(
    data_points: list[float],
    include_percentiles: bool,
    outlier_threshold: float,
) -> dict[str, Any]:
    """Computes descriptive statistics for a list of numeric values.

    Returns a dict with count, mean, median, std_dev, min, max, range,
    outliers, outlier_count, and optionally percentile values and trimmed_mean.
    Returns an empty dict for empty input.
    """
    if not data_points:
        return {}

    n = len(data_points)
    sorted_data = sorted(data_points)
    mean = statistics.mean(data_points)
    std_dev = statistics.pstdev(data_points)
    median = statistics.median(data_points)

    outliers = [v for v in data_points if abs(v - mean) > outlier_threshold * std_dev]
    clean_data = [v for v in data_points if abs(v - mean) <= outlier_threshold * std_dev]

    result: dict[str, Any] = {
        'count': n,
        'mean': round(mean, _ROUND_STATS),
        'median': median,
        'std_dev': round(std_dev, _ROUND_STATS),
        'min': sorted_data[0],
        'max': sorted_data[-1],
        'range': sorted_data[-1] - sorted_data[0],
        'outliers': outliers,
        'outlier_count': len(outliers),
    }

    if include_percentiles:
        for p in _PERCENTILE_POINTS:
            idx = min(int(n * p / _PERCENT), n - 1)
            result[f'p{p}'] = sorted_data[idx]

    if len(clean_data) > 1:
        result['trimmed_mean'] = round(statistics.mean(clean_data), _ROUND_STATS)

    return result
