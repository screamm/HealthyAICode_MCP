/**
 * OCHS determinism regression — packages/core/tests/ochs-determinism.test.ts
 *
 * Verifies that scoring the OCHS conformance corpus twice in the same process
 * produces identical results (score, category, smell count, smell types).
 *
 * This test is the "hash-pinned determinism" check described in the plan:
 *   "Identical score for (repo-hash + version) in 100% of runs"
 *
 * The corpus lives at docs/ochs/conformance/corpus.json and the fixture files
 * at docs/ochs/conformance/{healthy,unhealthy}/.  Tests import via relative
 * paths (no dist required — the test runner compiles src on the fly via vitest).
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { analyzeFile } from '../src/index';

// ── Corpus loading ────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..', '..', '..');
const CORPUS_PATH = path.join(ROOT, 'docs', 'ochs', 'conformance', 'corpus.json');

interface CorpusFixture {
  id: string;
  path: string;
  language: string;
  description: string;
  expectedScore: number;
  expectedCategory: string;
  expectedSmellCount: number;
  tolerance: number;
}

interface Corpus {
  ochsVersion: string;
  fixtures: CorpusFixture[];
}

const corpus: Corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

// Serialise a result to a comparable fingerprint (score + category + sorted smell types).
function fingerprint(result: Awaited<ReturnType<typeof analyzeFile>>): string {
  const smellTypes = result.smells.map((s) => s.type).sort();
  return JSON.stringify({
    score: result.score,
    category: result.category,
    language: result.language,
    smellTypes,
  });
}

// ── Determinism suite ─────────────────────────────────────────────────────────

describe('OCHS determinism regression', () => {
  for (const fixture of corpus.fixtures) {
    const absPath = path.join(ROOT, 'docs', 'ochs', 'conformance', fixture.path);

    it(`produces identical results across two runs: ${fixture.id}`, async () => {
      const run1 = await analyzeFile(absPath);
      const run2 = await analyzeFile(absPath);

      // Primary assertion: fingerprints must be byte-identical.
      const fp1 = fingerprint(run1);
      const fp2 = fingerprint(run2);
      expect(fp1).toBe(fp2);

      // Secondary assertions: structural sanity (non-NaN, bounded score).
      expect(Number.isFinite(run1.score)).toBe(true);
      expect(run1.score).toBeGreaterThanOrEqual(1.0);
      expect(run1.score).toBeLessThanOrEqual(10.0);
    });
  }
});

// ── Expected-score conformance suite ─────────────────────────────────────────
//
// This is a separate concern from determinism (determinism = run1 === run2;
// conformance = actual === expected).  Both live in the same file to keep the
// corpus as the single source of truth.

describe('OCHS conformance (expected scores)', () => {
  for (const fixture of corpus.fixtures) {
    const absPath = path.join(ROOT, 'docs', 'ochs', 'conformance', fixture.path);

    it(`${fixture.id}: score=${fixture.expectedScore} category=${fixture.expectedCategory} smells=${fixture.expectedSmellCount}`, async () => {
      const result = await analyzeFile(absPath);

      // Score within tolerance (corpus sets tolerance=0 for all current fixtures).
      expect(Math.abs(result.score - fixture.expectedScore)).toBeLessThanOrEqual(
        fixture.tolerance,
      );

      // Category.
      expect(result.category).toBe(fixture.expectedCategory);

      // Smell count.
      expect(result.smells.length).toBe(fixture.expectedSmellCount);
    });
  }
});
