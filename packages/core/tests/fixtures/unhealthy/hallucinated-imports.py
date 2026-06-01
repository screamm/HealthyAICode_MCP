"""
unhealthy/hallucinated-imports.py

Fixture for HallucinatedPackageImport detection in Python.
Contains one real PyPI package (requests) and one obviously-fake package (xyzzy_not_a_real_package_abc123).
Used in packages/core/tests/analyzers/hallucinated-import.test.ts.
"""

# Real package — should NOT trigger HallucinatedPackageImport
import requests

# Fake package — should trigger HallucinatedPackageImport
import xyzzy_not_a_real_package_abc123


def fetch_data(url: str) -> dict:
    response = requests.get(url)
    result = xyzzy_not_a_real_package_abc123.process(response.json())
    return result
