# Unhealthy fixture: insecure deserialization patterns
# Sprint 58 — detectSecuritySinks fixture
import pickle
import yaml

def load_user_data(file_path: str):
    """Load user data from a pickle file — unsafe deserialization."""
    with open(file_path, 'rb') as f:
        return pickle.load(f)  # UnsafeDeserialization: arbitrary code execution risk

def parse_config(data: str):
    """Parse YAML config without SafeLoader — unsafe deserialization."""
    return yaml.load(data)  # UnsafeDeserialization: yaml.load without SafeLoader

def parse_another_config(raw: str):
    """Another yaml.load call without loader param."""
    config = yaml.load(raw)  # UnsafeDeserialization: should use yaml.safe_load
    return config
