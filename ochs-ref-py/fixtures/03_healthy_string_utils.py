"""String utility helpers — straightforward, single-responsibility functions."""
from typing import List


def capitalize_words(text: str) -> str:
    """Capitalize the first letter of each word in text."""
    return " ".join(word.capitalize() for word in text.split())


def truncate(text: str, max_length: int, suffix: str = "...") -> str:
    """Truncate text to max_length characters, appending suffix if needed."""
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix


def split_words(text: str) -> List[str]:
    """Split text into individual words, stripping extra whitespace."""
    return text.split()


def is_palindrome(text: str) -> bool:
    """Return True when text reads the same forwards and backwards (ignoring case)."""
    normalized = text.lower().replace(" ", "")
    return normalized == normalized[::-1]


def count_vowels(text: str) -> int:
    """Count the number of vowels (a, e, i, o, u) in text."""
    return sum(1 for ch in text.lower() if ch in "aeiou")
