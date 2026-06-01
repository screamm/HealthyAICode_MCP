import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyGoplsExtractFunction,
  canUseGopls,
} from '../../src/refactor/go-gopls-transformer';

const FIXTURE = path.resolve(
  __dirname,
  '../fixtures/unhealthy/deep-nesting.go',
);

/**
 * Computes the byte offsets [start, end) of the inner `for _, item := range order.Items`
 * loop in the fixture — a self-contained block gopls can lift into a new function.
 */
async function regionOffsets(file: string): Promise<{ start: number; end: number }> {
  const source = await fs.readFile(file, 'utf8');
  const startMarker = '\t\t\tfor _, item := range order.Items {';
  const endMarker = '\t\t\t}\n\t\t} else if order.Status';
  const start = source.indexOf(startMarker);
  const endAnchor = source.indexOf(endMarker);
  if (start < 0 || endAnchor < 0) {
    throw new Error('fixture markers not found — fixture changed?');
  }
  // Include the closing brace of the inner for-loop (4 chars: \t\t\t}).
  const end = endAnchor + '\t\t\t}'.length + 1;
  return { start, end };
}

describe('go-gopls-transformer', () => {
  it('canUseGopls() detects the gopls binary at its documented path', async () => {
    // gopls 0.22.0 is installed at C:\\Users\\david\\go\\bin\\gopls.exe.
    expect(await canUseGopls()).toBe(true);
  });

  it('canUseGopls() reports false when forced to a non-existent binary', async () => {
    const prev = process.env.HEALTHY_AI_GOPLS;
    process.env.HEALTHY_AI_GOPLS = 'definitely-not-a-real-gopls-xyz';
    try {
      expect(await canUseGopls()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.HEALTHY_AI_GOPLS;
      else process.env.HEALTHY_AI_GOPLS = prev;
    }
  });

  it('produces a non-empty unified diff from a real ExtractFunction', async () => {
    const { start, end } = await regionOffsets(FIXTURE);
    const result = await applyGoplsExtractFunction(FIXTURE, start, end);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.diff).toMatch(/^---/m);
    expect(result.diff).toMatch(/^\+\+\+/m);
    // gopls introduces a new helper invocation; the original function header must still
    // appear and a new function definition is added.
    expect(result.diff).toContain('ProcessOrders');
  }, 60_000);

  it('normalizes diff paths back to the original file (no-module input)', async () => {
    // The fixture lives outside any go.mod, so the transformer copies it into a temp
    // module. The returned diff must reference the original fixture basename, not the
    // temp copy path.
    const { start, end } = await regionOffsets(FIXTURE);
    const result = await applyGoplsExtractFunction(FIXTURE, start, end);
    expect(result.success).toBe(true);
    expect(result.diff).toContain(path.basename(FIXTURE));
    expect(result.diff.toLowerCase()).not.toContain('healthy-ai-gopls-');
  }, 60_000);

  it('reports tool-unavailable gracefully when gopls binary is missing', async () => {
    const { start, end } = await regionOffsets(FIXTURE);
    const prev = process.env.HEALTHY_AI_GOPLS;
    process.env.HEALTHY_AI_GOPLS = 'definitely-not-a-real-gopls-xyz';
    try {
      const result = await applyGoplsExtractFunction(FIXTURE, start, end);
      expect(result.success).toBe(false);
      expect(result.diff).toBe('');
      expect(result.error).toMatch(/gopls unavailable/i);
    } finally {
      if (prev === undefined) delete process.env.HEALTHY_AI_GOPLS;
      else process.env.HEALTHY_AI_GOPLS = prev;
    }
  });

  it('rejects invalid offset arguments without invoking gopls', async () => {
    const equal = await applyGoplsExtractFunction(FIXTURE, 50, 50);
    expect(equal.success).toBe(false);
    expect(equal.error).toMatch(/endOffset/i);

    const negative = await applyGoplsExtractFunction(FIXTURE, -5, 10);
    expect(negative.success).toBe(false);
    expect(negative.error).toMatch(/invalid offset/i);
  });

  it('returns success:false when gopls cannot extract the given region', async () => {
    // A region spanning a package-level comment is not a valid statement range for
    // ExtractFunction; gopls returns no applicable code action / empty diff.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopls-test-'));
    try {
      const goFile = path.join(tmpDir, 'main.go');
      await fs.writeFile(goFile, 'package main\n\nfunc main() {}\n', 'utf8');
      await fs.writeFile(
        path.join(tmpDir, 'go.mod'),
        'module t\n\ngo 1.21\n',
        'utf8',
      );
      // Offsets over the `package main` header — no extractable statements.
      const result = await applyGoplsExtractFunction(goFile, 0, 12);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);
});
