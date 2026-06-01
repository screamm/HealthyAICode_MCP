# Sprint 58 fixture: exception anti-patterns in Python
# Expected: >= 1 ExceptionHandlingAntiPattern smell

import json


def parse_config(path: str) -> dict:
    """Load configuration from file."""
    try:
        with open(path) as f:
            return json.load(f)
    except:
        pass  # EmptyCatch with bare except + pass


def load_user(user_id: int) -> dict:
    """Fetch user from database."""
    try:
        return db_query(f"SELECT * FROM users WHERE id = {user_id}")
    except Exception as e:
        pass  # CatchGeneric — catches Exception with pass


def transform_data(raw: str) -> dict:
    """Transform raw input to structured data."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(str(e))  # DestructiveWrapping — no "from e"


def db_query(sql: str) -> dict:
    """Stub database query."""
    return {}
