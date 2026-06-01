import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeByLanguage } from '../../src/analyzers/index';
import { detectSplitResidue, detectFragmentedCode } from '../../src/scoring/split-residue';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(__dirname, '../fixtures', rel);
const read = (rel: string) => readFileSync(fixture(rel), 'utf-8');

function functionsOf(code: string) {
  return analyzeByLanguage(code, 'typescript', '<inline>').functions;
}

describe('detectSplitResidue', () => {
  it('flags a file with >3 private single-caller CC>2 methods (extract-to-evade)', () => {
    const code = read('unhealthy/split-residue-fixture.ts');
    const fns = functionsOf(code);
    const smells = detectSplitResidue(fns, code);

    expect(smells).toHaveLength(1);
    expect(smells[0].type).toBe('SplitResidue');
    expect(smells[0].description).toContain('SplitResidue');
    // metricValue carries the count of qualifying helpers (4 in the fixture).
    expect(smells[0].metricValue).toBeGreaterThanOrEqual(4);
  });

  it('does not flag healthy pure functions', () => {
    const code = read('healthy/pure-functions.ts');
    const fns = functionsOf(code);
    expect(detectSplitResidue(fns, code)).toHaveLength(0);
  });

  it('does not flag the fragmented-code fixture as SplitResidue (CC=1 helpers are trivial)', () => {
    const code = read('unhealthy/fragmented-code-fixture.ts');
    const fns = functionsOf(code);
    expect(detectSplitResidue(fns, code)).toHaveLength(0);
  });

  it('does not flag a single private helper called from multiple callers (legitimate extraction)', () => {
    const code = `
export class S {
  a(x: number): number { return this._h(x); }
  b(x: number): number { return this._h(x); }
  c(x: number): number { return this._h(x); }
  d(x: number): number { return this._h(x); }
  e(x: number): number { return this._h(x); }
  private _h(x: number): number { if (x > 0) { x += 1; } if (x < 9) { x -= 1; } return x; }
}
`;
    const fns = functionsOf(code);
    // _h has 5 callers → not single-caller → excluded; no other qualifying helpers.
    expect(detectSplitResidue(fns, code)).toHaveLength(0);
  });

  it('does not flag a file with only 3 qualifying helpers (below the >3 threshold)', () => {
    const code = `
export class Three {
  run(x: number): number { return this._a(x) + this._b(x) + this._c(x); }
  private _a(x: number): number { if (x > 0) { x += 1; } if (x < 9) { x -= 1; } return x; }
  private _b(x: number): number { if (x > 0) { x += 1; } if (x < 9) { x -= 1; } return x; }
  private _c(x: number): number { if (x > 0) { x += 1; } if (x < 9) { x -= 1; } return x; }
}
`;
    const fns = functionsOf(code);
    expect(detectSplitResidue(fns, code)).toHaveLength(0);
  });
});

describe('detectFragmentedCode', () => {
  it('flags a file with ≥8 trivial CC=1 single-caller methods', () => {
    const code = read('unhealthy/fragmented-code-fixture.ts');
    const fns = functionsOf(code);
    const smells = detectFragmentedCode(fns, code);

    expect(smells).toHaveLength(1);
    expect(smells[0].type).toBe('FragmentedCode');
    expect(smells[0].description).toContain('FragmentedCode');
    expect(smells[0].metricValue).toBeGreaterThanOrEqual(8);
  });

  it('does not flag healthy pure functions', () => {
    const code = read('healthy/pure-functions.ts');
    const fns = functionsOf(code);
    expect(detectFragmentedCode(fns, code)).toHaveLength(0);
  });

  it('does not flag the split-residue fixture as FragmentedCode (CC=3 helpers are non-trivial)', () => {
    const code = read('unhealthy/split-residue-fixture.ts');
    const fns = functionsOf(code);
    expect(detectFragmentedCode(fns, code)).toHaveLength(0);
  });

  it('does not flag fewer than 8 trivial methods', () => {
    const code = `
export class Few {
  run(v: number): number { return this._s1(this._s2(this._s3(v))); }
  private _s1(v: number): number { return v + 1; }
  private _s2(v: number): number { return v + 2; }
  private _s3(v: number): number { return v + 3; }
}
`;
    const fns = functionsOf(code);
    expect(detectFragmentedCode(fns, code)).toHaveLength(0);
  });
});
