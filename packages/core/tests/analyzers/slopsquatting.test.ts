/**
 * slopsquatting.test.ts — Sprint 51–60
 *
 * Tests for detectSlopsquatting() in packages/core/src/analyzers/slopsquatting.ts.
 *
 * Coverage:
 *   - Real popular package → NOT flagged.
 *   - Typosquat (edit-distance 1 from a popular name) → flagged.
 *   - Hallucination-corpus hit → flagged.
 *   - Lockfile-present package → NOT flagged (deliberate dependency).
 *   - 0-network-when-opt-out: the live fetcher is NEVER called unless liveCheck === true.
 *   - Opt-in live path (404 / <90 days) using an injected deterministic fetcher.
 *   - Fixtures: one legit (not flagged), one typosquat (flagged), one corpus (flagged).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectSlopsquatting,
  resetSlopsquattingCaches,
  type PackageMeta,
} from '../../src/analyzers/slopsquatting';

const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');
const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');

beforeEach(() => {
  resetSlopsquattingCaches();
});

const slops = (s: Awaited<ReturnType<typeof detectSlopsquatting>>) =>
  s.filter((x) => x.type === 'SlopsquattingRisk');

// ─── Negative: real popular packages ─────────────────────────────────────────

describe('detectSlopsquatting — legitimate packages are not flagged', () => {
  it('does not flag a real npm package (express)', async () => {
    const out = await detectSlopsquatting(`import e from 'express';`, 'typescript', 'a.ts');
    expect(slops(out)).toHaveLength(0);
  });

  it('does not flag a real npm package (react)', async () => {
    const out = await detectSlopsquatting(`import React from 'react';`, 'typescript', 'a.ts');
    expect(slops(out)).toHaveLength(0);
  });

  it('does not flag a real PyPI package (requests)', async () => {
    const out = await detectSlopsquatting(`import requests`, 'python', 'a.py');
    expect(slops(out)).toHaveLength(0);
  });

  it('does not flag relative / builtin imports', async () => {
    const code = `
import { x } from './local';
import * as fs from 'fs';
import { y } from 'node:path';
`;
    const out = await detectSlopsquatting(code, 'typescript', 'a.ts');
    expect(slops(out)).toHaveLength(0);
  });

  it('does not analyse unsupported languages', async () => {
    const out = await detectSlopsquatting(`import "fmt"`, 'go', 'a.go');
    expect(out).toHaveLength(0);
  });
});

// ─── Positive: typosquat ─────────────────────────────────────────────────────

describe('detectSlopsquatting — typosquat detection', () => {
  it('flags "expres" as a typosquat of "express"', async () => {
    const out = await detectSlopsquatting(`import e from 'expres';`, 'typescript', 'a.ts');
    const found = slops(out);
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('high');
    expect(found[0].description).toContain('expres');
    expect(found[0].description).toContain('express');
  });

  it('flags a keyboard-slip typosquat ("reqct" for "react")', async () => {
    const out = await detectSlopsquatting(`import x from 'reqct';`, 'typescript', 'a.ts');
    expect(slops(out).length).toBeGreaterThanOrEqual(1);
  });

  it('reports the correct line number', async () => {
    const code = `import React from 'react';\nimport e from 'expres';`;
    const out = await detectSlopsquatting(code, 'typescript', 'a.ts');
    const found = slops(out);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it('does not flag very short package names (noise control)', async () => {
    // "ms" / "fs"-style 2-char names must not be edit-distance-flagged.
    const out = await detectSlopsquatting(`import x from 'ms';`, 'typescript', 'a.ts');
    expect(slops(out)).toHaveLength(0);
  });
});

// ─── Positive: hallucination corpus ──────────────────────────────────────────

describe('detectSlopsquatting — hallucination corpus', () => {
  it('flags a corpus hit on PyPI (huggingface_cli)', async () => {
    const out = await detectSlopsquatting(`import huggingface_cli`, 'python', 'a.py');
    const found = slops(out);
    expect(found).toHaveLength(1);
    expect(found[0].description.toLowerCase()).toContain('hallucination');
  });

  it('flags a corpus hit on npm (openai-node-sdk)', async () => {
    const out = await detectSlopsquatting(`import x from 'openai-node-sdk';`, 'typescript', 'a.ts');
    expect(slops(out)).toHaveLength(1);
  });
});

// ─── Lockfile suppression ────────────────────────────────────────────────────

describe('detectSlopsquatting — lockfile awareness', () => {
  it('does NOT flag a typosquat-looking name that is in the lockfile', async () => {
    const out = await detectSlopsquatting(
      `import e from 'expres';`,
      'typescript',
      'a.ts',
      { lockfilePackages: ['expres'] },
    );
    expect(slops(out)).toHaveLength(0);
  });

  it('PEP-503-normalises lockfile names for PyPI', async () => {
    // Lockfile lists "Huggingface.CLI"; normalised should match "huggingface-cli".
    const out = await detectSlopsquatting(
      `import huggingface_cli`,
      'python',
      'a.py',
      { lockfilePackages: ['Huggingface.CLI'] },
    );
    expect(slops(out)).toHaveLength(0);
  });
});

// ─── 0-network-when-opt-out proof ────────────────────────────────────────────

describe('detectSlopsquatting — offline by default', () => {
  it('NEVER calls the live fetcher when liveCheck is omitted', async () => {
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => ({ notFound: true }),
    );
    // A name that is neither popular, corpus, nor a typosquat → would only be reachable
    // by the live path. With opt-out, the fetcher must still be untouched.
    const out = await detectSlopsquatting(
      `import x from 'zzqwxv-neutral-name-9001';`,
      'typescript',
      'a.ts',
      { fetchPackageMeta }, // supplied but liveCheck not set
    );
    expect(fetchPackageMeta).not.toHaveBeenCalled();
    expect(slops(out)).toHaveLength(0);
  });

  it('does not call the fetcher for packages resolved offline (popular/typosquat/corpus)', async () => {
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => ({ notFound: false, firstPublished: new Date().toISOString() }),
    );
    const code = `
import e from 'express';
import t from 'expres';
import h from 'openai-node-sdk';
`;
    await detectSlopsquatting(code, 'typescript', 'a.ts', {
      liveCheck: true,
      fetchPackageMeta,
    });
    // express = popular (skip), expres = typosquat (offline hit), openai-node-sdk = corpus.
    // None should reach the live fetcher.
    expect(fetchPackageMeta).not.toHaveBeenCalled();
  });
});

// ─── Opt-in live path ────────────────────────────────────────────────────────

describe('detectSlopsquatting — opt-in live registry checks', () => {
  it('flags a 404 package only when liveCheck is enabled', async () => {
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => ({ notFound: true }),
    );
    const out = await detectSlopsquatting(
      `import x from 'zzqwxv-neutral-name-9001';`,
      'typescript',
      'a.ts',
      { liveCheck: true, fetchPackageMeta },
    );
    expect(fetchPackageMeta).toHaveBeenCalledTimes(1);
    const found = slops(out);
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain('404');
  });

  it('flags a <90-day-old package as low-trust', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => ({ notFound: false, firstPublished: tenDaysAgo }),
    );
    const out = await detectSlopsquatting(
      `import x from 'zzqwxv-neutral-name-9002';`,
      'typescript',
      'a.ts',
      { liveCheck: true, fetchPackageMeta },
    );
    expect(slops(out)).toHaveLength(1);
    expect(slops(out)[0].description.toLowerCase()).toContain('90 days');
  });

  it('does NOT flag an old, established package via the live path', async () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => ({ notFound: false, firstPublished: twoYearsAgo }),
    );
    const out = await detectSlopsquatting(
      `import x from 'zzqwxv-neutral-name-9003';`,
      'typescript',
      'a.ts',
      { liveCheck: true, fetchPackageMeta },
    );
    expect(slops(out)).toHaveLength(0);
  });

  it('survives a throwing fetcher (offline signals still apply)', async () => {
    const fetchPackageMeta = vi.fn<[string, 'npm' | 'pypi'], Promise<PackageMeta>>(
      async () => { throw new Error('network down'); },
    );
    const out = await detectSlopsquatting(
      `import e from 'expres';\nimport x from 'zzqwxv-neutral-name-9004';`,
      'typescript',
      'a.ts',
      { liveCheck: true, fetchPackageMeta },
    );
    // The typosquat is still caught even though the live fetcher throws for the neutral name.
    expect(slops(out).length).toBeGreaterThanOrEqual(1);
    expect(slops(out).some((s) => s.description.includes('expres'))).toBe(true);
  });
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

describe('detectSlopsquatting — fixtures', () => {
  it('legit fixture: not flagged', async () => {
    const p = path.join(FIXTURES_HEALTHY, 'slopsquatting-legit.ts');
    const code = fs.readFileSync(p, 'utf-8');
    const out = await detectSlopsquatting(code, 'typescript', p);
    expect(slops(out)).toHaveLength(0);
  });

  it('typosquat fixture: exactly one SlopsquattingRisk', async () => {
    const p = path.join(FIXTURES_UNHEALTHY, 'slopsquatting-typosquat.ts');
    const code = fs.readFileSync(p, 'utf-8');
    const out = await detectSlopsquatting(code, 'typescript', p);
    const found = slops(out);
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain('express');
  });

  it('corpus fixture: exactly one SlopsquattingRisk', async () => {
    const p = path.join(FIXTURES_UNHEALTHY, 'slopsquatting-corpus.py');
    const code = fs.readFileSync(p, 'utf-8');
    const out = await detectSlopsquatting(code, 'python', p);
    expect(slops(out)).toHaveLength(1);
  });
});

// ─── Robustness ──────────────────────────────────────────────────────────────

describe('detectSlopsquatting — robustness', () => {
  it('does not throw on empty input', async () => {
    await expect(detectSlopsquatting('', 'typescript', 'a.ts')).resolves.toBeDefined();
  });

  it('emitted smells have all required fields', async () => {
    const out = await detectSlopsquatting(`import e from 'expres';`, 'typescript', 'a.ts');
    for (const s of slops(out)) {
      expect(s.type).toBe('SlopsquattingRisk');
      expect(['critical', 'high', 'medium', 'low']).toContain(s.severity);
      expect(s.line).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.suggestion.length).toBeGreaterThan(0);
    }
  });
});
