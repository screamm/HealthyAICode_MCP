"""Validation module with a moderately complex function — one ComplexMethod smell expected."""
from typing import Optional, Dict, Any


def validate_user_input(data: Dict[str, Any], strict: bool = False) -> Optional[str]:
    """Validate user registration input; returns an error message or None on success."""
    if not data:
        return "No data provided"
    if "username" not in data:
        return "Username is required"
    username = data["username"]
    if not isinstance(username, str):
        return "Username must be a string"
    if len(username) < 3:
        return "Username too short"
    if len(username) > 64:
        return "Username too long"
    if "email" not in data:
        return "Email is required"
    email = data["email"]
    if not isinstance(email, str):
        return "Email must be a string"
    if "@" not in email:
        return "Invalid email address"
    if strict and "." not in email.split("@")[-1]:
        return "Email domain has no TLD"
    if "password" not in data:
        return "Password is required"
    password = data["password"]
    if not isinstance(password, str):
        return "Password must be a string"
    if len(password) < 8:
        return "Password must be at least 8 characters"
    return None
