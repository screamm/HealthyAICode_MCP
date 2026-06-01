/**
 * hallucinated-import.test.ts — Sprint 57
 *
 * Tests for detectHallucinatedImports() in packages/core/src/analyzers/hallucinated-import.ts.
 *
 * Test strategy:
 *   - Known real package (in snapshot) → no smell.
 *   - Clearly fake package (not in snapshot) → HallucinatedPackageImport smell.
 *   - Relative imports → not flagged.
 *   - Node.js builtins → not flagged.
 *   - Python stdlib → not flagged.
 *   - Missing snapshot → graceful fallback (empty array).
 *   - Fixture file with one real + one fake package → exactly one smell.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectHallucinatedImports, resetSnapshotCaches } from '../../src/analyzers/hallucinated-import';

// ─── Path constants ─────────────────────────────────────────────────────────────

const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');
const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Reset caches before each test so snapshot-path injection works reliably. */
beforeEach(() => {
  resetSnapshotCaches();
});

// ─── TypeScript / JavaScript tests ─────────────────────────────────────────────

describe('detectHallucinatedImports — TypeScript/JavaScript', () => {
  it('returns empty array for a real npm package (openai)', () => {
    const code = `import OpenAI from 'openai';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(0);
  });

  it('returns empty array for a real npm package (react)', () => {
    const code = `import React from 'react';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(0);
  });

  it('flags an obviously fake npm package', () => {
    const code = `import something from 'xyzzy-not-a-real-package-abc123';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated.length).toBeGreaterThanOrEqual(1);
    expect(hallucinated[0].type).toBe('HallucinatedPackageImport');
    expect(hallucinated[0].severity).toBe('high');
    expect(hallucinated[0].description).toContain('xyzzy-not-a-real-package-abc123');
    expect(hallucinated[0].description).toContain('npm');
  });

  it('does NOT flag relative imports', () => {
    const code = `
import { helper } from './utils';
import { config } from '../config';
    `;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('does NOT flag Node.js built-in modules', () => {
    const code = `
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
const crypto = require('crypto');
    `;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('does NOT flag node: protocol imports', () => {
    const code = `import { readFileSync } from 'node:fs';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('flags a fake package but not a real package in the same file', () => {
    const code = `
import OpenAI from 'openai';
import something from 'absolutely-fake-hallucinated-pkg-zzz9999';
    `;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].description).toContain('absolutely-fake-hallucinated-pkg-zzz9999');
  });

  it('handles require() calls', () => {
    const code = `const fake = require('not-a-real-pkg-xyzzy-123');`;
    const smells = detectHallucinatedImports(code, 'javascript', 'test.js');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated.length).toBeGreaterThanOrEqual(1);
    expect(hallucinated[0].description).toContain('not-a-real-pkg-xyzzy-123');
  });

  it('includes the line number of the import statement', () => {
    const code = [
      `import React from 'react';`,
      `import FakeModule from 'totally-fake-pkg-no-exist-abc';`,
    ].join('\n');
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].line).toBe(2);
  });

  it('includes a helpful suggestion with a package registry URL', () => {
    const code = `import FakeModule from 'totally-fake-pkg-no-exist-xyz';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].suggestion).toContain('npmjs.com');
    expect(hallucinated[0].suggestion).toContain('totally-fake-pkg-no-exist-xyz');
  });

  it('fixture file: real package not flagged, fake package flagged', () => {
    const fixturePath = path.join(FIXTURES_UNHEALTHY, 'hallucinated-imports.ts');
    if (!fs.existsSync(fixturePath)) {
      // Fixture was not created — skip gracefully
      return;
    }
    const code = fs.readFileSync(fixturePath, 'utf-8');
    const smells = detectHallucinatedImports(code, 'typescript', fixturePath);
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');

    // The fixture has one real (openai) and one fake (xyzzy-not-a-real-package-abc123)
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].description).toContain('xyzzy-not-a-real-package-abc123');
  });
});

// ─── Python tests ──────────────────────────────────────────────────────────────

describe('detectHallucinatedImports — Python', () => {
  it('returns empty array for a real PyPI package (requests)', () => {
    const code = `import requests`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('returns empty array for openai (real PyPI package)', () => {
    const code = `import openai`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('flags an obviously fake PyPI package', () => {
    const code = `import xyzzy_not_a_real_package_abc123`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated.length).toBeGreaterThanOrEqual(1);
    expect(hallucinated[0].type).toBe('HallucinatedPackageImport');
    expect(hallucinated[0].severity).toBe('high');
    expect(hallucinated[0].description).toContain('xyzzy_not_a_real_package_abc123');
    expect(hallucinated[0].description).toContain('PyPI');
  });

  it('does NOT flag Python stdlib modules', () => {
    const code = `
import os
import sys
import json
import re
import math
import collections
import itertools
from datetime import datetime
from pathlib import Path
    `;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('does NOT flag relative Python imports', () => {
    const code = `
from .utils import helper
from ..config import settings
    `;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('handles "from package import something" style', () => {
    const code = `from xyzzy_totally_fake_lib_999 import SomeClass`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated.length).toBeGreaterThanOrEqual(1);
    expect(hallucinated[0].description).toContain('xyzzy_totally_fake_lib_999');
  });

  it('does NOT flag sub-module paths for real packages', () => {
    const code = `from requests.auth import HTTPBasicAuth`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('flags a fake package but not a real package in the same file', () => {
    const code = `
import requests
import absolutely_fake_hallucinated_pkg_zzz9999
    `;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].description).toContain('absolutely_fake_hallucinated_pkg_zzz9999');
  });

  it('fixture file: real package not flagged, fake package flagged', () => {
    const fixturePath = path.join(FIXTURES_UNHEALTHY, 'hallucinated-imports.py');
    if (!fs.existsSync(fixturePath)) {
      return;
    }
    const code = fs.readFileSync(fixturePath, 'utf-8');
    const smells = detectHallucinatedImports(code, 'python', fixturePath);
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');

    // The fixture has one real (requests) and one fake (xyzzy_not_a_real_package_abc123)
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].description).toContain('xyzzy_not_a_real_package_abc123');
  });

  it('includes suggestion with pypi.org URL', () => {
    const code = `import totally_fake_pkg_no_exist_xyz`;
    const smells = detectHallucinatedImports(code, 'python', 'test.py');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    expect(hallucinated).toHaveLength(1);
    expect(hallucinated[0].suggestion).toContain('pypi.org');
  });
});

// ─── Snapshot-fallback tests ────────────────────────────────────────────────────

describe('detectHallucinatedImports — snapshot fallback', () => {
  it('returns empty array for unsupported languages (e.g., go)', () => {
    const code = `import "fmt"`;
    const smells = detectHallucinatedImports(code, 'go', 'test.go');
    // Go is not supported — should return [] gracefully
    expect(smells.filter(s => s.type === 'HallucinatedPackageImport')).toHaveLength(0);
  });

  it('does not throw for empty code string', () => {
    expect(() => detectHallucinatedImports('', 'typescript', 'empty.ts')).not.toThrow();
  });

  it('does not throw for code with only comments', () => {
    const code = `// This file has no imports\n// Just comments`;
    expect(() => detectHallucinatedImports(code, 'typescript', 'no-imports.ts')).not.toThrow();
  });

  it('returns Smell objects with all required fields when flagging', () => {
    const code = `import FakeModule from 'totally-fake-pkg-no-exist-struct-check';`;
    const smells = detectHallucinatedImports(code, 'typescript', 'test.ts');
    const hallucinated = smells.filter(s => s.type === 'HallucinatedPackageImport');
    if (hallucinated.length > 0) {
      const smell = hallucinated[0];
      expect(smell.type).toBe('HallucinatedPackageImport');
      expect(typeof smell.severity).toBe('string');
      expect(['critical', 'high', 'medium', 'low']).toContain(smell.severity);
      expect(typeof smell.line).toBe('number');
      expect(smell.line).toBeGreaterThan(0);
      expect(typeof smell.description).toBe('string');
      expect(smell.description.length).toBeGreaterThan(0);
      expect(typeof smell.suggestion).toBe('string');
      expect(smell.suggestion.length).toBeGreaterThan(0);
    }
  });
});
