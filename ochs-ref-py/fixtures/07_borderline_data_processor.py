"""Data processing with moderate complexity — borderline health score expected."""
from typing import List, Dict, Optional


def process_records(
    records: List[Dict],
    filter_key: str,
    filter_value: str,
    transform_key: Optional[str] = None,
) -> List[Dict]:
    """Filter records by key/value and optionally transform a field."""
    result = []
    for record in records:
        if filter_key not in record:
            continue
        if str(record[filter_key]) != filter_value:
            continue
        if transform_key and transform_key in record:
            record = dict(record)
            value = record[transform_key]
            if isinstance(value, str):
                record[transform_key] = value.strip().lower()
            elif isinstance(value, int):
                record[transform_key] = value * 2
        result.append(record)
    return result


def aggregate_by_key(records: List[Dict], key: str) -> Dict[str, List[Dict]]:
    """Group records into a dict keyed by the given field."""
    groups: Dict[str, List[Dict]] = {}
    for record in records:
        bucket = str(record.get(key, "unknown"))
        if bucket not in groups:
            groups[bucket] = []
        groups[bucket].append(record)
    return groups
