"""Input validation helpers — pure functions with clear contracts."""
import re
from typing import Optional


EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
URL_PATTERN = re.compile(r"^https?://[^\s/$.?#].[^\s]*$")


def is_valid_email(address: str) -> bool:
    """Return True when address matches a basic e-mail pattern."""
    return bool(EMAIL_PATTERN.match(address))


def is_valid_url(url: str) -> bool:
    """Return True when url starts with http:// or https:// and is non-trivial."""
    return bool(URL_PATTERN.match(url))


def is_non_empty_string(value: Optional[str]) -> bool:
    """Return True when value is a non-None, non-blank string."""
    return value is not None and value.strip() != ""


def clamp_int(value: int, min_val: int, max_val: int) -> int:
    """Return value clamped to the inclusive range [min_val, max_val]."""
    return max(min_val, min(max_val, value))


def is_positive(value: float) -> bool:
    """Return True when value is strictly positive."""
    return value > 0
