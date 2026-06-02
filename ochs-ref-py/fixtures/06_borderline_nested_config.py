"""Config loader with some nesting — borderline maintainability."""
from typing import Any, Dict, Optional


def resolve_config(
    base: Dict[str, Any],
    overrides: Optional[Dict[str, Any]] = None,
    env: str = "production",
) -> Dict[str, Any]:
    """Merge base config with optional overrides and environment-specific values."""
    result = dict(base)
    if overrides:
        for key, value in overrides.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = resolve_config(result[key], value)
            else:
                result[key] = value
    if env == "development":
        result.setdefault("debug", True)
        result.setdefault("log_level", "DEBUG")
    elif env == "staging":
        result.setdefault("debug", False)
        result.setdefault("log_level", "INFO")
    elif env == "production":
        result.setdefault("debug", False)
        result.setdefault("log_level", "WARNING")
    return result


def get_nested(config: Dict[str, Any], *keys: str) -> Optional[Any]:
    """Navigate nested dict keys; return None if any key is missing."""
    current: Any = config
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current
