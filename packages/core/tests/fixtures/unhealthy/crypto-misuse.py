# Unhealthy fixture: cryptographic misuse in Python
# Sprint 58 — detectSecuritySinks fixture
import hashlib
import random
import secrets  # safe alternative — for reference

# CryptographicMisuseRisk: hashlib.md5 used for password hashing
def hash_password(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest()

# CryptographicMisuseRisk: random.random() used as cryptographic nonce
def generate_nonce() -> float:
    nonce = random.random()
    return nonce

# CryptographicMisuseRisk: hashlib.sha1 used for token generation
def compute_token(data: str) -> str:
    return hashlib.sha1(data.encode()).hexdigest()

# Safe usage — should NOT trigger
def secure_token() -> str:
    return secrets.token_hex(32)
