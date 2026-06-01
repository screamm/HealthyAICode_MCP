import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyRopeExtractMethod,
  canUseRope,
} from '../../src/refactor/python-rope-transformer';

const FIXTURE = path.resolve(
  __dirname,
  '../fixtures/unhealthy/deep-nesting.py',
);

/**
 * Computes the byte offsets [start, end) of a self-contained region of the fixture.
 * We extract the whole `for order in orders:` loop up to (but not including) the
 * terminating `return total` — a region rope can safely lift into a helper.
 */
async function regionOffsets(): Promise<{
  source: string;
  start: number;
  end: number;
}> {
  const source = await fs.readFile(FIXTURE, 'utf8');
  const start = source.indexOf('    for order in orders:');
  const end = source.indexOf('    return total');
  if (start < 0 || end < 0) {
    throw new Error('fixture markers not found — fixture changed?');
  }
  return { source, start, end };
}

describe('python-rope-transformer', () => {
  it('canUseRope() detects the rope-enabled interpreter in this environment', async () => {
    const available = await canUseRope();
    // rope 1.14.0 is installed; assert the real positive path.
    expect(available).toBe(true);
  });

  it('canUseRope() reports false when forced to a non-existent interpreter', async () => {
    const prev = process.env.HEALTHY_AI_PYTHON;
    process.env.HEALTHY_AI_PYTHON = 'definitely-not-a-real-python-xyz';
    try {
      expect(await canUseRope()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.HEALTHY_AI_PYTHON;
      else process.env.HEALTHY_AI_PYTHON = prev;
    }
  });

  it('produces a non-empty unified diff from a real ExtractMethod', async () => {
    const { start, end } = await regionOffsets();
    const result = await applyRopeExtractMethod(FIXTURE, start, end, 'process_each_order');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.diff.length).toBeGreaterThan(0);
    // rope's get_description() is a unified diff that introduces the new method name.
    expect(result.diff).toContain('process_each_order');
    expect(result.diff).toMatch(/^---/m);
    expect(result.diff).toMatch(/^\+\+\+/m);
  });

  it('reports tool-unavailable gracefully when no rope interpreter exists', async () => {
    const { start, end } = await regionOffsets();
    const prev = process.env.HEALTHY_AI_PYTHON;
    process.env.HEALTHY_AI_PYTHON = 'definitely-not-a-real-python-xyz';
    try {
      const result = await applyRopeExtractMethod(FIXTURE, start, end);
      expect(result.success).toBe(false);
      expect(result.diff).toBe('');
      expect(result.error).toMatch(/rope unavailable/i);
    } finally {
      if (prev === undefined) delete process.env.HEALTHY_AI_PYTHON;
      else process.env.HEALTHY_AI_PYTHON = prev;
    }
  });

  it('rejects invalid offset arguments without spawning a process', async () => {
    const bad = await applyRopeExtractMethod(FIXTURE, 100, 100);
    expect(bad.success).toBe(false);
    expect(bad.error).toMatch(/endOffset/i);

    const negative = await applyRopeExtractMethod(FIXTURE, -1, 10);
    expect(negative.success).toBe(false);
    expect(negative.error).toMatch(/invalid offset/i);
  });

  it('returns success:false on a rope error (offsets pointing at a syntax-broken file)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rope-test-'));
    try {
      const broken = path.join(tmpDir, 'broken.py');
      await fs.writeFile(broken, 'def f(:\n    pass\n', 'utf8');
      const result = await applyRopeExtractMethod(broken, 0, 10);
      expect(result.success).toBe(false);
      expect(result.diff).toBe('');
      expect(result.error).toBeDefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
