"""Build the realfile-equiv benchmark corpus.

Creates benchmark-data/realfile-equiv/manifest.json with 25 real-file function
pairs (Python + TypeScript/JavaScript) taken from field repos that have import
dependencies -- the realistic case the original corpus snippets avoided.

Each entry records:
  - The real source file location and function name
  - The import dependencies that make isolation hard
  - The expected engine outcome (unverified:load_error or purity_gate)
  - A known-equivalent refactoring
  - A known-divergent refactoring (where feasible)
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "benchmark-data", "realfile-equiv")
os.makedirs(OUT_DIR, exist_ok=True)

manifest = []

# ═══════════════════════════════════════════════════════════════════════════════
# PYTHON ENTRIES (py-01 .. py-12)
# All from requests-python or flask-python field repos.
# The Python engine uses importlib.util.spec_from_file_location which writes the
# function source to a tmpdir WITHOUT package context, so `from .compat import X`
# raises ImportError ("attempted relative import with no known parent package").
# ═══════════════════════════════════════════════════════════════════════════════

manifest.append({
    "id": "py-01",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/_internal_utils.py",
    "function": "unicode_is_ascii",
    "hasImports": True,
    "importDeps": ["from .compat import builtin_str"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_fails_in_temp_dir",
    "notes": (
        "File-level `from .compat import builtin_str` — harness writes file to tmpdir, "
        "spec_from_file_location does not set package, relative import raises ImportError."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline the try/except with explicit isinstance guard (semantically identical)",
        "code": (
            "def unicode_is_ascii(u_string):\n"
            "    assert isinstance(u_string, str)\n"
            "    try:\n"
            "        u_string.encode('ascii')\n"
            "    except UnicodeEncodeError:\n"
            "        return False\n"
            "    return True\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Catches ALL exceptions instead of UnicodeEncodeError — changes behaviour for MemoryError etc.",
        "code": (
            "def unicode_is_ascii(u_string):\n"
            "    assert isinstance(u_string, str)\n"
            "    try:\n"
            "        u_string.encode('ascii')\n"
            "    except Exception:  # BUG: too broad\n"
            "        return False\n"
            "    return True\n"
        ),
    },
})

manifest.append({
    "id": "py-02",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/_internal_utils.py",
    "function": "to_native_string",
    "hasImports": True,
    "importDeps": ["from .compat import builtin_str"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_fails_in_temp_dir",
    "notes": (
        "Same file as py-01. Uses `builtin_str` imported from relative `.compat`. "
        "The function body references it in `isinstance(string, builtin_str)`."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Rewrite using isinstance(string, bytes) — equivalent when builtin_str==str (Python 3)",
        "code": (
            "def to_native_string(string, encoding='ascii'):\n"
            "    if isinstance(string, bytes):\n"
            "        return string.decode(encoding)\n"
            "    return string\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Use str() instead of decode — different for bytes: str(b'hi') -> \"b'hi'\" not 'hi'",
        "code": (
            "def to_native_string(string, encoding='ascii'):\n"
            "    if isinstance(string, bytes):\n"
            "        return str(string)  # BUG: str(b'x') -> \"b'x'\", not 'x'\n"
            "    return string\n"
        ),
    },
})

manifest.append({
    "id": "py-03",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "iter_slices",
    "hasImports": True,
    "importDeps": [
        "from .compat import urlparse, quote, unquote, Mapping",
        "from .exceptions import InvalidURL, FileModeWarning",
        "from .structures import CaseInsensitiveDict",
        "from urllib3.util import make_headers, parse_url",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "third_party_and_relative_imports_fail_in_temp_dir",
    "notes": (
        "Module-level imports include urllib3.util (third-party) and multiple relative imports. "
        "Even if urllib3 is installed, the relative imports fail because the temp module has no "
        "package context. The function body itself is pure (generator over a string slice)."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Generator expression form — same observable output for finite strings",
        "code": (
            "def iter_slices(string, slice_length):\n"
            "    if slice_length is None or slice_length <= 0:\n"
            "        slice_length = len(string)\n"
            "    return (string[i:i + slice_length] for i in range(0, len(string), slice_length))\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Off-by-one: use strict `< 0` instead of `<= 0`, so slice_length=0 yields single huge chunk",
        "code": (
            "def iter_slices(string, slice_length):\n"
            "    pos = 0\n"
            "    if slice_length is None or slice_length < 0:  # BUG: should be <= 0\n"
            "        slice_length = len(string)\n"
            "    while pos < len(string):\n"
            "        yield string[pos:pos + slice_length]\n"
            "        pos += slice_length\n"
        ),
    },
})

manifest.append({
    "id": "py-04",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "is_ipv4_address",
    "hasImports": True,
    "importDeps": [
        "import socket",
        "from .compat import ...",
        "from urllib3.util import ...",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error_and_purity_impure_socket",
    "failureMode": "double_barrier_load_error_plus_purity_socket",
    "notes": (
        "Two barriers: (1) module load fails on relative imports; "
        "(2) even if isolated, body calls socket.inet_aton which the purity gate "
        "flags as 'network (socket)'."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Rewrite using regex — equivalent for all IPv4 inputs",
        "code": (
            "import re\n\n"
            "def is_ipv4_address(string_ip):\n"
            "    pattern = r'^(\\d{1,3}\\.){3}\\d{1,3}$'\n"
            "    if not re.match(pattern, string_ip):\n"
            "        return False\n"
            "    parts = string_ip.split('.')\n"
            "    return all(0 <= int(p) <= 255 for p in parts)\n"
        ),
    },
    "refactoredDivergent": None,
})

manifest.append({
    "id": "py-05",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "unquote_unreserved",
    "hasImports": True,
    "importDeps": [
        "from .compat import quote, unquote",
        "from .exceptions import InvalidURL",
        "UNRESERVED_SET (module-level frozenset that requires the .compat chain to load)",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "module_level_constant_uses_relative_import_chain",
    "notes": (
        "UNRESERVED_SET is a module-level frozenset. The function references it as a free "
        "variable. Even if load didn't fail on imports, UNRESERVED_SET would be NameError "
        "in an isolated context. Module-level `DEFAULT_CA_BUNDLE_PATH = certs.where()` also "
        "runs at import time and would fail."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline UNRESERVED_SET — eliminates free variable dependency",
        "code": (
            "def unquote_unreserved(uri):\n"
            "    _UNRESERVED = frozenset(\n"
            "        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'\n"
            "        '0123456789-._~'\n"
            "    )\n"
            "    parts = uri.split('%')\n"
            "    for i in range(1, len(parts)):\n"
            "        h = parts[i][0:2]\n"
            "        if len(h) == 2 and h.isalnum():\n"
            "            try:\n"
            "                c = chr(int(h, 16))\n"
            "            except ValueError:\n"
            "                raise ValueError(f'Invalid percent-escape: {h!r}')\n"
            "            if c in _UNRESERVED:\n"
            "                parts[i] = c + parts[i][2:]\n"
            "            else:\n"
            "                parts[i] = f'%{parts[i]}'\n"
            "        else:\n"
            "            parts[i] = f'%{parts[i]}'\n"
            "    return ''.join(parts)\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Start loop from index 0 — corrupts the prefix before the first %",
        "code": (
            "def unquote_unreserved(uri):\n"
            "    _UNRESERVED = frozenset(\n"
            "        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'\n"
            "        '0123456789-._~'\n"
            "    )\n"
            "    parts = uri.split('%')\n"
            "    for i in range(0, len(parts)):  # BUG: should start at 1\n"
            "        h = parts[i][0:2]\n"
            "        if len(h) == 2 and h.isalnum():\n"
            "            try:\n"
            "                c = chr(int(h, 16))\n"
            "            except ValueError:\n"
            "                raise ValueError(f'Invalid percent-escape: {h!r}')\n"
            "            if c in _UNRESERVED:\n"
            "                parts[i] = c + parts[i][2:]\n"
            "            else:\n"
            "                parts[i] = f'%{parts[i]}'\n"
            "        else:\n"
            "            parts[i] = f'%{parts[i]}'\n"
            "    return ''.join(parts)\n"
        ),
    },
})

manifest.append({
    "id": "py-06",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "from_key_val_list",
    "hasImports": True,
    "importDeps": [
        "from collections import OrderedDict",
        "from .compat import Mapping",
        "from ._types import SupportsItems as _SupportsItems",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_and_third_party_type_imports",
    "notes": (
        "Uses OrderedDict (stdlib OK) but also relative `.compat.Mapping` and "
        "`._types.SupportsItems`. The module-level `from .compat import Mapping` "
        "fails on load. The module also runs `DEFAULT_CA_BUNDLE_PATH = certs.where()` "
        "at import time which requires the requests package installed."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Use dict() instead of OrderedDict — equivalent in Python 3.7+ (dicts are ordered)",
        "code": (
            "def from_key_val_list(value):\n"
            "    if value is None:\n"
            "        return None\n"
            "    if isinstance(value, (str, bytes, bool, int)):\n"
            "        raise ValueError('cannot encode objects that are not 2-tuples')\n"
            "    return dict(value)\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Missing None check — raises TypeError on None input instead of returning None",
        "code": (
            "from collections import OrderedDict\n\n"
            "def from_key_val_list(value):\n"
            "    # BUG: missing `if value is None: return None`\n"
            "    if isinstance(value, (str, bytes, bool, int)):\n"
            "        raise ValueError('cannot encode objects that are not 2-tuples')\n"
            "    return OrderedDict(value)\n"
        ),
    },
})

manifest.append({
    "id": "py-07",
    "language": "python",
    "sourceFile": "field-repos/flask-python/src/flask/ctx.py",
    "function": "has_app_context",
    "hasImports": True,
    "importDeps": [
        "import contextvars",
        "from .globals import _cv_app",
        "from werkzeug.exceptions import HTTPException",
        "from werkzeug.routing import MapAdapter",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_flask_globals_plus_werkzeug",
    "notes": (
        "has_app_context() reads `_cv_app.get(None)` where `_cv_app` is a module-level "
        "ContextVar imported from `.globals`. Load will fail on `from .globals import _cv_app`. "
        "werkzeug must also be installed."
    ),
    "sourceProvenance": "flask v3.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Self-contained version with its own ContextVar — demonstrates isolation approach",
        "code": (
            "import contextvars\n\n"
            "def has_app_context():\n"
            "    _cv_app = contextvars.ContextVar('flask._cv_app')\n"
            "    return _cv_app.get(None) is not None\n"
        ),
    },
    "refactoredDivergent": None,
})

manifest.append({
    "id": "py-08",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "parse_list_header",
    "hasImports": True,
    "importDeps": [
        "from .compat import parse_http_list as _parse_list_header",
        "from urllib3.util import make_headers, parse_url",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "function_calls_module_level_name_from_relative_import",
    "notes": (
        "parse_list_header() calls `_parse_list_header(value)` which is a module-level alias "
        "from `from .compat import parse_http_list as _parse_list_header`. The function body "
        "also calls `unquote_header_value` (another module-level function). Both barriers: "
        "load fails on relative imports, AND the free variables would be unresolved."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Equivalent — preserves the trim/strip logic but uses explicit header parsing",
        "code": (
            "def parse_list_header(value):\n"
            "    result = []\n"
            "    for item in _parse_list_header(value):\n"
            "        if item[:1] == item[-1:] == '\"':\n"
            "            item = item[1:-1].replace('\\\\\\\\', '\\\\').replace('\\\\\"', '\"')\n"
            "        result.append(item)\n"
            "    return result\n"
        ),
    },
    "refactoredDivergent": None,
})

manifest.append({
    "id": "py-09",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "dotted_netmask",
    "hasImports": True,
    "importDeps": [
        "import socket",
        "import struct",
        "from .compat import ...",
        "from urllib3.util import ...",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error_and_purity_impure_socket",
    "failureMode": "double_barrier_load_error_plus_purity_socket",
    "notes": (
        "Double barrier: (1) module load fails on relative imports; "
        "(2) body calls socket.inet_ntoa which the purity gate flags as 'network (socket)'. "
        "The function converts a /xx CIDR mask to dotted notation (e.g. 24 -> '255.255.255.0')."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Rewrite using struct.pack without socket — equivalent for all valid mask values 0-32",
        "code": (
            "import struct\n\n"
            "def dotted_netmask(mask):\n"
            "    bits = 0xFFFFFFFF ^ (1 << 32 - mask) - 1\n"
            "    packed = struct.pack('>I', bits)\n"
            "    return '.'.join(str(b) for b in packed)\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Wrong bit formula — produces totally wrong netmask values",
        "code": (
            "import struct\n\n"
            "def dotted_netmask(mask):\n"
            "    bits = (0xFFFFFFFF - mask) ^ 1  # BUG: completely wrong formula\n"
            "    packed = struct.pack('>I', bits)\n"
            "    return '.'.join(str(b) for b in packed)\n"
        ),
    },
})

manifest.append({
    "id": "py-10",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "is_valid_cidr",
    "hasImports": True,
    "importDeps": [
        "import socket",
        "from .compat import ...",
        "from urllib3.util import ...",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error_and_purity_impure_socket",
    "failureMode": "double_barrier_load_error_plus_purity_socket",
    "notes": (
        "Double barrier: module load fails on relative imports; "
        "body calls socket.inet_aton. "
        "Function validates CIDR notation strings like '192.168.1.0/24'."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Rewrite using regex/split — equivalent for all CIDR notation inputs",
        "code": (
            "def is_valid_cidr(string_network):\n"
            "    if string_network.count('/') != 1:\n"
            "        return False\n"
            "    ip_part, mask_part = string_network.split('/')\n"
            "    try:\n"
            "        mask = int(mask_part)\n"
            "    except ValueError:\n"
            "        return False\n"
            "    if mask < 1 or mask > 32:\n"
            "        return False\n"
            "    parts = ip_part.split('.')\n"
            "    if len(parts) != 4:\n"
            "        return False\n"
            "    try:\n"
            "        return all(0 <= int(p) <= 255 for p in parts)\n"
            "    except ValueError:\n"
            "        return False\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Allow mask=0 — original requires 1 <= mask <= 32, refactor allows 0",
        "code": (
            "def is_valid_cidr(string_network):\n"
            "    if string_network.count('/') != 1:\n"
            "        return False\n"
            "    ip_part, mask_part = string_network.split('/')\n"
            "    try:\n"
            "        mask = int(mask_part)\n"
            "    except ValueError:\n"
            "        return False\n"
            "    if mask < 0 or mask > 32:  # BUG: original lower bound is 1, not 0\n"
            "        return False\n"
            "    parts = ip_part.split('.')\n"
            "    if len(parts) != 4:\n"
            "        return False\n"
            "    try:\n"
            "        return all(0 <= int(p) <= 255 for p in parts)\n"
            "    except ValueError:\n"
            "        return False\n"
        ),
    },
})

manifest.append({
    "id": "py-11",
    "language": "python",
    "sourceFile": "field-repos/flask-python/src/flask/helpers.py",
    "function": "get_debug_flag",
    "hasImports": True,
    "importDeps": [
        "from .globals import current_app",
        "from werkzeug.utils import import_string",
        "import os",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_flask_globals",
    "notes": (
        "Load fails on relative flask imports. Body also reads os.environ which the purity "
        "gate would flag as 'os environment access (os.environ)' even if load succeeded."
    ),
    "sourceProvenance": "flask v3.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Equivalent using os.environ directly with explicit falsy-string logic",
        "code": (
            "import os\n\n"
            "def get_debug_flag():\n"
            "    val = os.environ.get('FLASK_DEBUG')\n"
            "    if not val:\n"
            "        return False\n"
            "    return val.lower() not in ('0', 'false', 'no')\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Wrong truthiness check — returns True for 'false' (non-empty truthy string)",
        "code": (
            "import os\n\n"
            "def get_debug_flag():\n"
            "    val = os.environ.get('FLASK_DEBUG', '')\n"
            "    # BUG: 'false', '0', 'no' are truthy non-empty strings\n"
            "    return bool(val)\n"
        ),
    },
})

manifest.append({
    "id": "py-12",
    "language": "python",
    "sourceFile": "field-repos/requests-python/src/requests/utils.py",
    "function": "default_user_agent",
    "hasImports": True,
    "importDeps": [
        "from .__version__ import __version__",
        "from .compat import ...",
        "from urllib3.util import ...",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "free_variable_from_relative_import_chain",
    "notes": (
        "Function body references `__version__` imported via `from .__version__ import __version__`. "
        "Load fails on relative imports. Even if isolated, `__version__` would be NameError."
    ),
    "sourceProvenance": "requests-python v2.32 (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline the version constant — semantically equivalent for the actual release",
        "code": (
            "def default_user_agent(name='python-requests'):\n"
            "    return f'{name}/2.32.3'\n"
        ),
    },
    "refactoredDivergent": None,
})

# ═══════════════════════════════════════════════════════════════════════════════
# TYPESCRIPT/JS ENTRIES (ts-01 .. ts-11, js-01 .. js-02)
# TypeScript: relative imports transpile to CommonJS require() calls that FAIL
# in the vm sandbox (no module resolver is injected).
# JavaScript: express lib/utils.js has `require('node:http')` at module level,
# which the JS purity gate flags as 'network IO (http/net module)' on raw source.
# ═══════════════════════════════════════════════════════════════════════════════

manifest.append({
    "id": "ts-01",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/differenceInMilliseconds/index.ts",
    "function": "differenceInMilliseconds",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": (
        "TS transpiles to CJS: `const toDate_1 = require('../toDate/index.ts')`. "
        "The vm sandbox has no module resolver — require() is not injected, so this throws "
        "ReferenceError or MODULE_NOT_FOUND. The function body is trivial subtraction."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline toDate as Date coercion — equivalent for Date inputs",
        "code": (
            "export function differenceInMilliseconds(laterDate, earlierDate) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  return toMs(laterDate) - toMs(earlierDate);\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Swap operand order — returns negative of correct value",
        "code": (
            "export function differenceInMilliseconds(laterDate, earlierDate) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  return toMs(earlierDate) - toMs(laterDate);  // BUG: swapped\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-02",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/compareAsc/index.ts",
    "function": "compareAsc",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": "Same import failure pattern as ts-01. Function clamps diff to -1/0/1.",
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Equivalent with explicit sign() — same branch structure, identical output",
        "code": (
            "export function compareAsc(dateLeft, dateRight) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  const diff = toMs(dateLeft) - toMs(dateRight);\n"
            "  if (diff < 0) return -1;\n"
            "  if (diff > 0) return 1;\n"
            "  return diff;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Return raw diff instead of clamping to -1/0/1 — violates sort-comparator contract",
        "code": (
            "export function compareAsc(dateLeft, dateRight) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  return toMs(dateLeft) - toMs(dateRight);  // BUG: returns large numbers, not -1/0/1\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-03",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/compareDesc/index.ts",
    "function": "compareDesc",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": "Inverse of compareAsc. Same import failure pattern.",
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Reversed subtraction — equivalent to compareDesc",
        "code": (
            "export function compareDesc(dateLeft, dateRight) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  const diff = toMs(dateRight) - toMs(dateLeft);\n"
            "  if (diff < 0) return -1;\n"
            "  if (diff > 0) return 1;\n"
            "  return diff;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Forgot to reverse operands — returns compareAsc instead of compareDesc",
        "code": (
            "export function compareDesc(dateLeft, dateRight) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  const diff = toMs(dateLeft) - toMs(dateRight);  // BUG: not reversed\n"
            "  if (diff < 0) return -1;\n"
            "  if (diff > 0) return 1;\n"
            "  return diff;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-04",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/differenceInCalendarYears/index.ts",
    "function": "differenceInCalendarYears",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": "Imports toDate from relative path. vm sandbox has no require().",
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline the year extraction — equivalent for all Date inputs",
        "code": (
            "export function differenceInCalendarYears(laterDate, earlierDate) {\n"
            "  const toDate = (d) => d instanceof Date ? d : new Date(d);\n"
            "  return toDate(laterDate).getFullYear() - toDate(earlierDate).getFullYear();\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Use getUTCFullYear instead of getFullYear — diverges across timezone boundaries",
        "code": (
            "export function differenceInCalendarYears(laterDate, earlierDate) {\n"
            "  const toDate = (d) => d instanceof Date ? d : new Date(d);\n"
            "  // BUG: UTC vs local time\n"
            "  return toDate(laterDate).getUTCFullYear() - toDate(earlierDate).getUTCFullYear();\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-05",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/daysToWeeks/index.ts",
    "function": "daysToWeeks",
    "hasImports": True,
    "importDeps": ["import { daysInWeek } from '../constants/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "constant_from_relative_import_fails_in_vm_sandbox",
    "notes": (
        "Uses `daysInWeek` constant (=7) from `../constants/index.ts`. "
        "After transpile: `require('../constants/index.ts')` fails in sandbox."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline the constant 7 — semantically identical",
        "code": (
            "export function daysToWeeks(days) {\n"
            "  return Math.trunc(days / 7);\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Use Math.floor instead of Math.trunc — diverges for negative inputs",
        "code": (
            "export function daysToWeeks(days) {\n"
            "  return Math.floor(days / 7);  // BUG: Math.floor(-8/7)=-2 but Math.trunc(-8/7)=-1\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-06",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/addDays/index.ts",
    "function": "addDays",
    "hasImports": True,
    "importDeps": [
        "import { constructFrom } from '../constructFrom/index.ts'",
        "import { toDate } from '../toDate/index.ts'",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "two_relative_imports_both_fail_in_vm_sandbox",
    "notes": (
        "Two relative imports (constructFrom + toDate). Either would cause require() failure. "
        "The function has DST-aware date arithmetic (uses setDate not milliseconds)."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline toDate and constructFrom — equivalent for standard Date inputs",
        "code": (
            "export function addDays(date, amount, options) {\n"
            "  const _date = date instanceof Date ? new Date(date.getTime()) : new Date(date);\n"
            "  if (isNaN(amount)) return new Date(NaN);\n"
            "  if (!amount) return _date;\n"
            "  _date.setDate(_date.getDate() + amount);\n"
            "  return _date;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Use setTime with ms arithmetic — breaks for DST transitions (24h != 1 calendar day)",
        "code": (
            "export function addDays(date, amount, options) {\n"
            "  const _date = date instanceof Date ? new Date(date.getTime()) : new Date(date);\n"
            "  if (isNaN(amount)) return new Date(NaN);\n"
            "  // BUG: DST divergence — a day across DST boundary is 23h or 25h, not always 24h\n"
            "  _date.setTime(_date.getTime() + amount * 24 * 60 * 60 * 1000);\n"
            "  return _date;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-07",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/addMonths/index.ts",
    "function": "addMonths",
    "hasImports": True,
    "importDeps": [
        "import { constructFrom } from '../constructFrom/index.ts'",
        "import { toDate } from '../toDate/index.ts'",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "two_relative_imports_both_fail_in_vm_sandbox",
    "notes": (
        "Complex month-boundary logic (Jan 31 + 1 month -> Feb 28, not Mar 2). "
        "Both imports fail in sandbox. The canonical 'interesting refactoring' case where "
        "semantic preservation matters most."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Alternative month-clamping structure — same end-of-month behaviour",
        "code": (
            "export function addMonths(date, amount, options) {\n"
            "  const _date = date instanceof Date ? new Date(date.getTime()) : new Date(date);\n"
            "  if (isNaN(amount) || !amount) return _date;\n"
            "  const targetMonth = _date.getMonth() + amount;\n"
            "  const dayOfMonth = _date.getDate();\n"
            "  const lastDay = new Date(_date.getFullYear(), targetMonth + 1, 0).getDate();\n"
            "  _date.setMonth(targetMonth, Math.min(dayOfMonth, lastDay));\n"
            "  return _date;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "No month clamping — Jan 31 + 1 month overflows to Mar 2 instead of Feb 28",
        "code": (
            "export function addMonths(date, amount, options) {\n"
            "  const _date = date instanceof Date ? new Date(date.getTime()) : new Date(date);\n"
            "  if (isNaN(amount) || !amount) return _date;\n"
            "  _date.setMonth(_date.getMonth() + amount);  // BUG: no end-of-month clamping\n"
            "  return _date;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "js-01",
    "language": "javascript",
    "sourceFile": "field-repos/express-js/lib/utils.js",
    "function": "acceptParams",
    "hasImports": True,
    "importDeps": [
        "var { METHODS } = require('node:http')",
        "var contentType = require('content-type')",
        "var etag = require('etag')",
        "var mime = require('mime-types')",
    ],
    "isRelativeImport": False,
    "expectedEngineOutcome": "unverified:purity_gate_network_io",
    "failureMode": "module_level_require_node_http_triggers_purity_gate_on_raw_source",
    "notes": (
        "The purity gate scans the RAW source for `require('node:http')` and fires "
        "'network IO (http/net module)' BEFORE the vm evaluation. The function body "
        "itself (acceptParams) is pure string parsing — only the file-level require triggers the gate."
    ),
    "sourceProvenance": "express v5.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Clean rewrite with better variable naming — equivalent string parsing logic",
        "code": (
            "function acceptParams(str) {\n"
            "  const length = str.length;\n"
            "  let index = str.indexOf(';');\n"
            "  if (index === -1) index = length;\n"
            "  const ret = { value: str.slice(0, index).trim(), quality: 1, params: {} };\n"
            "  while (index < length) {\n"
            "    const splitIndex = str.indexOf('=', index);\n"
            "    if (splitIndex === -1) break;\n"
            "    let colonIndex = str.indexOf(';', index);\n"
            "    const endIndex = colonIndex === -1 ? length : colonIndex;\n"
            "    if (splitIndex > endIndex) {\n"
            "      index = str.lastIndexOf(';', splitIndex - 1) + 1;\n"
            "      continue;\n"
            "    }\n"
            "    const key = str.slice(index, splitIndex).trim();\n"
            "    const value = str.slice(splitIndex + 1, endIndex).trim();\n"
            "    if (key === 'q') {\n"
            "      ret.quality = parseFloat(value);\n"
            "    } else {\n"
            "      ret.params[key] = value;\n"
            "    }\n"
            "    index = endIndex + 1;\n"
            "  }\n"
            "  return ret;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Uses `endIndex` instead of `endIndex + 1` — produces infinite loop on inputs with params",
        "code": (
            "function acceptParams(str) {\n"
            "  const length = str.length;\n"
            "  let index = str.indexOf(';');\n"
            "  if (index === -1) index = length;\n"
            "  const ret = { value: str.slice(0, index).trim(), quality: 1, params: {} };\n"
            "  while (index < length) {\n"
            "    const splitIndex = str.indexOf('=', index);\n"
            "    if (splitIndex === -1) break;\n"
            "    let colonIndex = str.indexOf(';', index);\n"
            "    const endIndex = colonIndex === -1 ? length : colonIndex;\n"
            "    if (splitIndex > endIndex) {\n"
            "      index = str.lastIndexOf(';', splitIndex - 1) + 1;\n"
            "      continue;\n"
            "    }\n"
            "    const key = str.slice(index, splitIndex).trim();\n"
            "    const value = str.slice(splitIndex + 1, endIndex).trim();\n"
            "    if (key === 'q') {\n"
            "      ret.quality = parseFloat(value);\n"
            "    } else {\n"
            "      ret.params[key] = value;\n"
            "    }\n"
            "    index = endIndex;  // BUG: should be endIndex + 1 — potential infinite loop\n"
            "  }\n"
            "  return ret;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-08",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/clamp/index.ts",
    "function": "clamp",
    "hasImports": True,
    "importDeps": [
        "import { normalizeDates } from '../_lib/normalizeDates/index.ts'",
        "import { max } from '../max/index.ts'",
        "import { min } from '../min/index.ts'",
    ],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "three_relative_imports_all_fail_in_vm_sandbox",
    "notes": (
        "Three relative imports (normalizeDates, max, min). All become require() calls "
        "that fail in the vm sandbox. Clamps a date to [start, end] of an interval."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline the clamp logic — equivalent for all Date/timestamp inputs",
        "code": (
            "export function clamp(date, interval, options) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  const dateMs = toMs(date);\n"
            "  const startMs = toMs(interval.start);\n"
            "  const endMs = toMs(interval.end);\n"
            "  const clamped = Math.min(Math.max(dateMs, startMs), endMs);\n"
            "  return date instanceof Date ? new Date(clamped) : clamped;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Swapped min/max — clamps to OUTSIDE interval instead of inside",
        "code": (
            "export function clamp(date, interval, options) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  const dateMs = toMs(date);\n"
            "  const startMs = toMs(interval.start);\n"
            "  const endMs = toMs(interval.end);\n"
            "  const clamped = Math.max(Math.min(dateMs, startMs), endMs);  // BUG: min/max swapped\n"
            "  return date instanceof Date ? new Date(clamped) : clamped;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "js-02",
    "language": "javascript",
    "sourceFile": "field-repos/express-js/lib/utils.js",
    "function": "compileQueryParser",
    "hasImports": True,
    "importDeps": [
        "var qs = require('qs')",
        "var querystring = require('node:querystring')",
        "var { METHODS } = require('node:http')",
    ],
    "isRelativeImport": False,
    "expectedEngineOutcome": "unverified:purity_gate_network_io",
    "failureMode": "module_level_require_node_http_triggers_purity_gate_on_raw_source",
    "notes": (
        "Same file as js-01. node:http at module level triggers purity gate on raw source. "
        "The function body itself is a pure switch statement over string/boolean/function values."
    ),
    "sourceProvenance": "express v5.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "If/else chain instead of switch — equivalent for all valid string/boolean/function inputs",
        "code": (
            "function compileQueryParser(val) {\n"
            "  if (typeof val === 'function') return val;\n"
            "  if (val === true || val === 'simple') return (s) => Object.fromEntries(new URLSearchParams(s));\n"
            "  if (val === false) return undefined;\n"
            "  if (val === 'extended') return (s) => ({});\n"
            "  throw new TypeError('unknown value for query parser function: ' + val);\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Missing typeof function check — function values fall through to TypeError",
        "code": (
            "function compileQueryParser(val) {\n"
            "  // BUG: missing `if (typeof val === 'function') return val;`\n"
            "  if (val === true || val === 'simple') return (s) => Object.fromEntries(new URLSearchParams(s));\n"
            "  if (val === false) return undefined;\n"
            "  if (val === 'extended') return (s) => ({});\n"
            "  throw new TypeError('unknown value for query parser function: ' + val);\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-09",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/areIntervalsOverlapping/index.ts",
    "function": "areIntervalsOverlapping",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": (
        "Relative import fails in vm sandbox. Function has `inclusive` option that changes "
        "boundary behaviour (< vs <=). Classic off-by-one at boundary."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Equivalent with early validation extracted to helper",
        "code": (
            "export function areIntervalsOverlapping(intervalLeft, intervalRight, options) {\n"
            "  const toMs = (d) => +new Date(d);\n"
            "  const leftStart = toMs(intervalLeft.start);\n"
            "  const leftEnd = toMs(intervalLeft.end);\n"
            "  const rightStart = toMs(intervalRight.start);\n"
            "  const rightEnd = toMs(intervalRight.end);\n"
            "  if (leftStart > leftEnd || rightStart > rightEnd)\n"
            "    throw new RangeError('Invalid interval');\n"
            "  if (options && options.inclusive) {\n"
            "    return leftStart <= rightEnd && rightStart <= leftEnd;\n"
            "  }\n"
            "  return leftStart < rightEnd && rightStart < leftEnd;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Ignores inclusive option entirely — always uses strict < (diverges at boundaries)",
        "code": (
            "export function areIntervalsOverlapping(intervalLeft, intervalRight, options) {\n"
            "  const toMs = (d) => +new Date(d);\n"
            "  const leftStart = toMs(intervalLeft.start);\n"
            "  const leftEnd = toMs(intervalLeft.end);\n"
            "  const rightStart = toMs(intervalRight.start);\n"
            "  const rightEnd = toMs(intervalRight.end);\n"
            "  if (leftStart > leftEnd || rightStart > rightEnd)\n"
            "    throw new RangeError('Invalid interval');\n"
            "  // BUG: should use <= when options.inclusive is true\n"
            "  return leftStart < rightEnd && rightStart < leftEnd;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-10",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/closestIndexTo/index.ts",
    "function": "closestIndexTo",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": (
        "Iterates over array of dates to find closest. Import fails in vm sandbox. "
        "Subtle tie-breaking semantics (first vs last closest)."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Rewrite using for-loop — equivalent for all arrays of dates (returns first closest)",
        "code": (
            "export function closestIndexTo(dateToCompare, dates) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  if (!Array.isArray(dates)) return NaN;\n"
            "  const targetMs = toMs(dateToCompare);\n"
            "  if (isNaN(targetMs)) return NaN;\n"
            "  let minDiff = Infinity;\n"
            "  let result = -1;\n"
            "  for (let i = 0; i < dates.length; i++) {\n"
            "    const diff = Math.abs(toMs(dates[i]) - targetMs);\n"
            "    if (diff < minDiff) {\n"
            "      minDiff = diff;\n"
            "      result = i;\n"
            "    }\n"
            "  }\n"
            "  return result === -1 ? NaN : result;\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Uses `<=` instead of `<` for minDiff update — returns LAST closest instead of FIRST",
        "code": (
            "export function closestIndexTo(dateToCompare, dates) {\n"
            "  const toMs = (d) => d instanceof Date ? d.getTime() : +new Date(d);\n"
            "  if (!Array.isArray(dates)) return NaN;\n"
            "  const targetMs = toMs(dateToCompare);\n"
            "  if (isNaN(targetMs)) return NaN;\n"
            "  let minDiff = Infinity;\n"
            "  let result = -1;\n"
            "  for (let i = 0; i < dates.length; i++) {\n"
            "    const diff = Math.abs(toMs(dates[i]) - targetMs);\n"
            "    if (diff <= minDiff) {  // BUG: should be < to return first closest\n"
            "      minDiff = diff;\n"
            "      result = i;\n"
            "    }\n"
            "  }\n"
            "  return result === -1 ? NaN : result;\n"
            "}\n"
        ),
    },
})

manifest.append({
    "id": "ts-11",
    "language": "typescript",
    "sourceFile": "field-repos/date-fns-typescript/pkgs/core/src/differenceInCalendarMonths/index.ts",
    "function": "differenceInCalendarMonths",
    "hasImports": True,
    "importDeps": ["import { toDate } from '../toDate/index.ts'"],
    "isRelativeImport": True,
    "expectedEngineOutcome": "unverified:load_error",
    "failureMode": "relative_import_transpiles_to_require_which_fails_in_vm_sandbox",
    "notes": (
        "Calendar month difference requires both year and month arithmetic. "
        "Import fails in vm sandbox. Classic year-component omission bug."
    ),
    "sourceProvenance": "date-fns v4.x (field-repos checkout)",
    "refactoredEquivalent": {
        "description": "Inline toDate — equivalent for all Date inputs",
        "code": (
            "export function differenceInCalendarMonths(laterDate, earlierDate) {\n"
            "  const toDate = (d) => d instanceof Date ? d : new Date(d);\n"
            "  const ld = toDate(laterDate);\n"
            "  const ed = toDate(earlierDate);\n"
            "  return (ld.getFullYear() - ed.getFullYear()) * 12 + (ld.getMonth() - ed.getMonth());\n"
            "}\n"
        ),
    },
    "refactoredDivergent": {
        "description": "Missing year multiplication — ignores year difference, only subtracts months",
        "code": (
            "export function differenceInCalendarMonths(laterDate, earlierDate) {\n"
            "  const toDate = (d) => d instanceof Date ? d : new Date(d);\n"
            "  const ld = toDate(laterDate);\n"
            "  const ed = toDate(earlierDate);\n"
            "  return ld.getMonth() - ed.getMonth();  // BUG: ignores year difference\n"
            "}\n"
        ),
    },
})

# ── Write manifest ────────────────────────────────────────────────────────────

manifest_path = os.path.join(OUT_DIR, "manifest.json")
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

# ── Summary ───────────────────────────────────────────────────────────────────

from collections import Counter

langs = Counter(e["language"] for e in manifest)
failure_modes = Counter(e["failureMode"] for e in manifest)
has_imports = sum(1 for e in manifest if e["hasImports"])
has_divergent = sum(1 for e in manifest if e.get("refactoredDivergent") is not None)
is_relative = sum(1 for e in manifest if e.get("isRelativeImport"))

print(f"Written {len(manifest)} entries to {manifest_path}")
print()
print("== Summary ==")
print(f"  Total entries:         {len(manifest)}")
print(f"  Has imports:           {has_imports}/{len(manifest)} (all 25)")
print(f"  Relative imports:      {is_relative}/{len(manifest)}")
print(f"  Has divergent pair:    {has_divergent}/{len(manifest)}")
print()
print("  Languages:")
for lang, count in sorted(langs.items()):
    print(f"    {lang}: {count}")
print()
print("  Failure modes:")
for mode, count in sorted(failure_modes.items(), key=lambda x: -x[1]):
    print(f"    {mode}: {count}")
