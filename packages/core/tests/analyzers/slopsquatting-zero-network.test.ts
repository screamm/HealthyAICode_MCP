/**
 * slopsquatting-zero-network.test.ts — Sprint 51–60 (Harden phase)
 *
 * PROOF that the SlopsquattingRisk detector performs ZERO network I/O on its offline /
 * opt-out path. The proof has three independent, non-vacuous parts:
 *
 *   1. STRUCTURAL — the analyzer source imports NO network module (http/https/net/tls/
 *      dns/dgram/undici/node-fetch/axios/got/request) and contains no `fetch(` /
 *      `XMLHttpRequest` call. The only network surface the detector can ever use is the
 *      caller-injected `fetchPackageMeta`. This is asserted by reading the source file.
 *
 *   2. BEHAVIOURAL — the caller-injected `fetchPackageMeta` (the sole network surface) is
 *      NEVER invoked on the offline entry point or with `liveCheck` opt-out, and IS
 *      invoked on the explicit opt-in path. A `global.fetch` tripwire (which is reliably
 *      replaceable under the test runtime, unlike the frozen node: module namespaces)
 *      guards against any accidental direct fetch and is self-checked to be live.
 *
 *   3. The detector still produces its offline signals while touching no network — proving
 *      the analysis genuinely ran rather than short-circuiting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectSlopsquatting,
  detectSlopsquattingOffline,
  resetSlopsquattingCaches,
  type PackageMeta,
} from '../../src/analyzers/slopsquatting';

const ANALYZER_SOURCE = path.join(__dirname, '../../src/analyzers/slopsquatting.ts');

const NETWORKY_CODE = `
import e from 'express';
import t from 'expres';
import h from 'react-codeshift';
import z from 'zzqwxv-neutral-name-9001';
`;

// ─── Part 1: structural proof ──────────────────────────────────────────────────

describe('SlopsquattingRisk — structural zero-network proof', () => {
  it('the analyzer source imports no network module and makes no direct fetch', () => {
    const src = fs.readFileSync(ANALYZER_SOURCE, 'utf-8');
    // Strip line comments and block comments so doc references to fetch/registry do not
    // produce false matches; we only care about actual code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');

    const forbiddenImports = [
      /from\s+['"](?:node:)?https?['"]/,
      /from\s+['"](?:node:)?net['"]/,
      /from\s+['"](?:node:)?tls['"]/,
      /from\s+['"](?:node:)?dns['"]/,
      /from\s+['"](?:node:)?dgram['"]/,
      /from\s+['"](?:node:)?http2['"]/,
      /from\s+['"]undici['"]/,
      /from\s+['"]node-fetch['"]/,
      /from\s+['"]axios['"]/,
      /from\s+['"]got['"]/,
      /from\s+['"]request['"]/,
      /require\(\s*['"](?:node:)?https?['"]\s*\)/,
      /require\(\s*['"]undici['"]\s*\)/,
    ];
    for (const re of forbiddenImports) {
      expect(code, `analyzer must not import a network module (matched ${re})`).not.toMatch(re);
    }

    // No direct fetch / XHR / websocket in code.
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/\bXMLHttpRequest\b/);
    expect(code).not.toMatch(/\bWebSocket\b/);

    // Sanity: the source DOES contain the injectable fetcher hook (proves we scanned the
    // right file and that the only network surface is caller-supplied).
    expect(src).toMatch(/fetchPackageMeta/);
    // The only Node module the analyzer imports for I/O is fs (local disk, not network).
    expect(code).toMatch(/from\s+['"]fs['"]/);
  });
});

// ─── Part 2 & 3: behavioural proof with a live global.fetch tripwire ────────────

let fetchTripwireHits = 0;
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  resetSlopsquattingCaches();
  fetchTripwireHits = 0;
  originalFetch = globalThis.fetch;
  // global.fetch is reliably replaceable (unlike frozen node: module namespaces).
  globalThis.fetch = (() => {
    fetchTripwireHits++;
    throw new Error('NETWORK CALL DETECTED via global fetch — detector must be offline');
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

describe('SlopsquattingRisk — behavioural zero-network proof', () => {
  it('SELF-CHECK: the global.fetch tripwire is live (a real fetch is caught)', () => {
    expect(() => globalThis.fetch('https://registry.npmjs.org/express')).toThrow(
      /NETWORK CALL DETECTED/,
    );
    expect(fetchTripwireHits).toBe(1);
  });

  it('detectSlopsquattingOffline triggers no fetch and still produces offline signals', () => {
    const out = detectSlopsquattingOffline(NETWORKY_CODE, 'typescript', 'a.ts');
    expect(fetchTripwireHits).toBe(0);
    expect(out.filter((s) => s.type === 'SlopsquattingRisk').length).toBeGreaterThanOrEqual(2);
  });

  it('detectSlopsquatting with liveCheck omitted never calls the injected fetcher or fetch', async () => {
    let fetcherCalls = 0;
    const fetchPackageMeta = async (): Promise<PackageMeta> => {
      fetcherCalls++;
      return { notFound: true };
    };
    const out = await detectSlopsquatting(NETWORKY_CODE, 'typescript', 'a.ts', {
      fetchPackageMeta, // supplied but liveCheck NOT set
    });
    expect(fetcherCalls).toBe(0);
    expect(fetchTripwireHits).toBe(0);
    expect(out.filter((s) => s.type === 'SlopsquattingRisk').length).toBeGreaterThanOrEqual(2);
  });

  it('detectSlopsquatting with liveCheck:false never calls the injected fetcher or fetch', async () => {
    let fetcherCalls = 0;
    const fetchPackageMeta = async (): Promise<PackageMeta> => {
      fetcherCalls++;
      return { notFound: true };
    };
    await detectSlopsquatting(NETWORKY_CODE, 'python', 'a.py', {
      liveCheck: false,
      fetchPackageMeta,
    });
    expect(fetcherCalls).toBe(0);
    expect(fetchTripwireHits).toBe(0);
  });

  it('the opt-in live path reaches the registry ONLY through the injected fetcher', async () => {
    // With liveCheck enabled the analyzer must use the caller-supplied fetcher and never
    // call global.fetch itself. The injected fetcher here is fully in-memory.
    let fetcherCalls = 0;
    const fetchPackageMeta = async (): Promise<PackageMeta> => {
      fetcherCalls++;
      return { notFound: true };
    };
    const out = await detectSlopsquatting(
      `import z from 'zzqwxv-neutral-name-9001';`,
      'typescript',
      'a.ts',
      { liveCheck: true, fetchPackageMeta },
    );
    expect(fetchTripwireHits).toBe(0); // analyzer opened no network of its own
    expect(fetcherCalls).toBe(1); // it used the injected fetcher
    expect(out.some((s) => s.description.includes('404'))).toBe(true);
  });
});
