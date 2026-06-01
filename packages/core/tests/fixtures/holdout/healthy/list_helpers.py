"""List helper utilities — clean, functional, with type hints."""
from typing import List, TypeVar, Optional

T = TypeVar("T")


def first(items: List[T]) -> Optional[T]:
    """Return the first element of a list, or None for empty lists."""
    return items[0] if items else None


def last(items: List[T]) -> Optional[T]:
    """Return the last element of a list, or None for empty lists."""
    return items[-1] if items else None


def flatten(nested: List[List[T]]) -> List[T]:
    """Flatten a list of lists into a single list."""
    result: List[T] = []
    for sublist in nested:
        result.extend(sublist)
    return result


def deduplicate(items: List[T]) -> List[T]:
    """Return a new list with duplicate values removed, preserving order."""
    seen: set = set()
    result: List[T] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def chunk(items: List[T], size: int) -> List[List[T]]:
    """Split items into chunks of the given size."""
    if size <= 0:
        return []
    return [items[i : i + size] for i in range(0, len(items), size)]
