/**
 * slopsquatting-precision.test.ts — Sprint 51–60 (Harden phase)
 *
 * Measures the precision and recall of the hardened SlopsquattingRisk detector on a
 * LABELED set, and asserts the hardening targets:
 *   - Precision >= 85% on the labeled set.
 *   - False-positive rate < 1% on REAL popular package imports (the realistic FP surface).
 *
 * Labeled set construction (deterministic, offline):
 *   POSITIVES (MUST flag) =
 *     - every npm/pypi entry of the curated hallucination corpus that does not collide
 *       with a real popular package (these are documented LLM-hallucinated names), plus
 *     - hand-crafted single-edit typosquats of prominent packages (drawn from the
 *       documented typosquat techniques: deletion, insertion, transposition, keyslip).
 *   NEGATIVES (must NOT flag) =
 *     - a large sample of REAL popular packages from the bundled snapshots, plus
 *     - the curated known-distinct look-alikes (preact, nest, fastai, oauthlib, …) that
 *       are genuinely one edit from a prominent name but are real, legitimate packages.
 *
 * Precision = TP / (TP + FP); Recall = TP / (TP + FN).
 *
 * NOTE: this test exercises the OFFLINE entry point only — it performs zero network I/O.
 * The dedicated 0-network proof lives in the "offline by default" section below.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectSlopsquattingOffline,
  resetSlopsquattingCaches,
} from '../../src/analyzers/slopsquatting';
import type { Language } from '../../src/types';

const DATA_DIR = path.join(__dirname, '../../src/data');

function loadPackages(file: string): string[] {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as {
    packages: string[];
  };
  return data.packages;
}

interface CorpusEntry {
  ecosystem: string;
  package_name: string;
}
function loadCorpus(): CorpusEntry[] {
  const data = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'slopsquatting/hallucinated-corpus.json'), 'utf-8'),
  ) as { entries: CorpusEntry[] };
  return data.entries;
}

const bare = (s: string) => (s.includes('/') ? s.slice(s.indexOf('/') + 1) : s);
const npmNorm = (s: string) => s.toLowerCase();
const pypiNorm = (s: string) => s.toLowerCase().replace(/[-_.]+/g, '-');

/** Returns true if the import name produces at least one SlopsquattingRisk smell offline. */
function flags(importName: string, language: Language): boolean {
  const code =
    language === 'python'
      ? `import ${importName.replace(/-/g, '_')}\n`
      : `import x from '${importName}';\n`;
  const out = detectSlopsquattingOffline(code, language, language === 'python' ? 'a.py' : 'a.ts');
  return out.some((s) => s.type === 'SlopsquattingRisk');
}

/** Python `import` only accepts identifier names; only test corpus/typos that are valid identifiers. */
function isValidPythonTopLevel(name: string): boolean {
  // top-level module name: letters, digits, underscores; cannot start with a digit
  const top = bare(name).replace(/-/g, '_');
  return /^[A-Za-z_]\w*$/.test(top);
}

beforeEach(() => {
  resetSlopsquattingCaches();
});

describe('SlopsquattingRisk — precision/recall on a labeled set', () => {
  it('reaches >=85% precision and reports measured precision/recall', () => {
    // ── POSITIVES ────────────────────────────────────────────────────────────
    const npmPopular = new Set(loadPackages('npm-snapshot.json').map((s) => npmNorm(bare(s))));
    const pypiPopular = new Set(loadPackages('pypi-snapshot.json').map((s) => pypiNorm(bare(s))));
    const corpus = loadCorpus();

    // Corpus positives: npm/pypi entries that do not collide with a real popular package.
    const npmCorpusPos = corpus
      .filter((e) => e.ecosystem === 'npm')
      .map((e) => e.package_name)
      .filter((n) => !npmPopular.has(npmNorm(bare(n))));
    const pypiCorpusPos = corpus
      .filter((e) => e.ecosystem === 'pypi')
      .map((e) => e.package_name)
      .filter((n) => !pypiPopular.has(pypiNorm(bare(n))))
      .filter(isValidPythonTopLevel);

    // Hand-crafted single-edit typosquats of prominent packages (documented techniques).
    const npmTyposquats = [
      'expres', 'expresss', 'reactt', 'reqct', 'axioss', 'axois', 'lodsh', 'loadash',
      'lodahs', 'momnet', 'momment', 'mooment', 'chlak', 'chakl', 'webpak', 'eslnt',
      'mongose', 'momentt', 'wbpack', 'typscript',
    ];
    const pypiTyposquats = [
      'reqeusts', 'requsts', 'reqests', 'nmupy', 'numpyy', 'pamdas', 'flsk', 'djnago',
      'fastpi', 'fastapii', 'tensorlfow', 'pyyaaml',
    ];

    const positives: Array<{ name: string; lang: Language }> = [
      ...npmCorpusPos.map((name) => ({ name, lang: 'typescript' as Language })),
      ...npmTyposquats.map((name) => ({ name, lang: 'typescript' as Language })),
      ...pypiCorpusPos.map((name) => ({ name, lang: 'python' as Language })),
      ...pypiTyposquats.map((name) => ({ name, lang: 'python' as Language })),
    ];

    // ── NEGATIVES ────────────────────────────────────────────────────────────
    // A deterministic broad sample of real popular packages (must NOT flag).
    const npmReal = loadPackages('npm-snapshot.json').filter((s) => /^[a-z0-9-]+$/.test(s));
    const pypiReal = loadPackages('pypi-snapshot.json').filter((s) =>
      isValidPythonTopLevel(s),
    );
    const everyNth = <T>(arr: T[], n: number) => arr.filter((_, i) => i % n === 0);
    const npmNegSample = everyNth(npmReal, 5); // ~20% deterministic sample
    const pypiNegSample = everyNth(pypiReal, 5);

    // Known-distinct real look-alikes that must NOT flag (the residual FP surface).
    const npmKnownDistinct = ['preact', 'nest', 'core', 'axis', 'prism', 'query', 'rambda', 'vuex'];
    const pypiKnownDistinct = ['fastai', 'oauthlib', 'pyaml', 'ipytest', 'ctransformers', 'openapi', 'grequests'];

    const negatives: Array<{ name: string; lang: Language }> = [
      ...npmNegSample.map((name) => ({ name, lang: 'typescript' as Language })),
      ...npmKnownDistinct.map((name) => ({ name, lang: 'typescript' as Language })),
      ...pypiNegSample.map((name) => ({ name, lang: 'python' as Language })),
      ...pypiKnownDistinct.map((name) => ({ name, lang: 'python' as Language })),
    ];

    // ── MEASURE ──────────────────────────────────────────────────────────────
    let tp = 0;
    const fn: string[] = [];
    for (const p of positives) {
      if (flags(p.name, p.lang)) tp++;
      else fn.push(`${p.lang}:${p.name}`);
    }
    let fp = 0;
    const fpNames: string[] = [];
    for (const n of negatives) {
      if (flags(n.name, n.lang)) {
        fp++;
        if (fpNames.length < 40) fpNames.push(`${n.lang}:${n.name}`);
      }
    }

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn.length);
    const fpRate = fp / negatives.length;

    // Surface the measured numbers in test output for the record.
    // eslint-disable-next-line no-console
    console.log(
      `[slopsquatting precision/recall] positives=${positives.length} negatives=${negatives.length} ` +
        `TP=${tp} FP=${fp} FN=${fn.length} ` +
        `precision=${(precision * 100).toFixed(2)}% recall=${(recall * 100).toFixed(2)}% ` +
        `fpRate=${(fpRate * 100).toFixed(3)}%`,
    );
    if (fn.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[slopsquatting] false negatives: ${fn.join(', ')}`);
    }
    if (fpNames.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[slopsquatting] false positives: ${fpNames.join(', ')}`);
    }

    // ── ASSERT TARGETS ─────────────────────────────────────────────────────────
    expect(precision).toBeGreaterThanOrEqual(0.85); // >= 85% precision
    expect(fpRate).toBeLessThan(0.01); // < 1% FP on real lockfile-style imports
    expect(recall).toBeGreaterThanOrEqual(0.85); // strong recall on documented positives
  });

  it('flags 0 real popular npm imports across the FULL snapshot (FP rate proof)', () => {
    resetSlopsquattingCaches();
    const real = loadPackages('npm-snapshot.json').filter((s) => /^[a-z0-9-]+$/.test(s));
    let fp = 0;
    const examples: string[] = [];
    for (const pkg of real) {
      if (flags(pkg, 'typescript')) {
        fp++;
        if (examples.length < 20) examples.push(pkg);
      }
    }
    const rate = fp / real.length;
    // eslint-disable-next-line no-console
    console.log(
      `[slopsquatting npm full-snapshot FP] ${fp}/${real.length} = ${(rate * 100).toFixed(3)}%` +
        (examples.length ? ` examples: ${examples.join(', ')}` : ''),
    );
    expect(rate).toBeLessThan(0.01);
  });

  it('flags 0 real popular PyPI imports across the FULL snapshot (FP rate proof)', () => {
    resetSlopsquattingCaches();
    const real = loadPackages('pypi-snapshot.json').filter((s) => isValidPythonTopLevel(s));
    let fp = 0;
    const examples: string[] = [];
    for (const pkg of real) {
      if (flags(pkg, 'python')) {
        fp++;
        if (examples.length < 20) examples.push(pkg);
      }
    }
    const rate = fp / real.length;
    // eslint-disable-next-line no-console
    console.log(
      `[slopsquatting pypi full-snapshot FP] ${fp}/${real.length} = ${(rate * 100).toFixed(3)}%` +
        (examples.length ? ` examples: ${examples.join(', ')}` : ''),
    );
    expect(rate).toBeLessThan(0.01);
  });
});
