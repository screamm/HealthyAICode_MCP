"""Date utility functions — simple helpers using the standard library only."""
from datetime import date, timedelta
from typing import Optional


def days_between(start: date, end: date) -> int:
    """Return the number of days between two dates (end − start)."""
    return (end - start).days


def add_days(d: date, days: int) -> date:
    """Return the date that is `days` after the given date."""
    return d + timedelta(days=days)


def is_weekday(d: date) -> bool:
    """Return True when d falls on a Monday–Friday."""
    return d.weekday() < 5


def format_iso(d: date) -> str:
    """Return the ISO-8601 string representation of a date (YYYY-MM-DD)."""
    return d.isoformat()


def parse_iso(text: str) -> Optional[date]:
    """Parse an ISO-8601 date string; return None on invalid input."""
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None
