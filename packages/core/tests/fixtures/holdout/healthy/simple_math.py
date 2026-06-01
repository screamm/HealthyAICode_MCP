"""Simple mathematical utility functions — well-documented and clean."""
from typing import List, Optional


def add(a: float, b: float) -> float:
    """Return the sum of two numbers."""
    return a + b


def subtract(a: float, b: float) -> float:
    """Return the difference of two numbers."""
    return a - b


def multiply(a: float, b: float) -> float:
    """Return the product of two numbers."""
    return a * b


def divide(a: float, b: float) -> Optional[float]:
    """Return a / b, or None when b is zero."""
    if b == 0:
        return None
    return a / b


def mean(values: List[float]) -> Optional[float]:
    """Return the arithmetic mean of a non-empty list, or None for empty lists."""
    if not values:
        return None
    return sum(values) / len(values)


def clamp(value: float, low: float, high: float) -> float:
    """Clamp value to the inclusive range [low, high]."""
    return max(low, min(high, value))
