import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  canUseRefactoringMiner,
  refactoringMinerLauncher,
  verifyRefactoringBetweenFileVersions,
} from '../../src/refactor/refactoring-miner-oracle';

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/refactoring-miner');

async function loadFixtures(): Promise<{ before: string; after: string }> {
  const before = await fs.readFile(
    path.join(FIXTURE_DIR, 'Calculator.before.java'),
    'utf8',
  );
  const after = await fs.readFile(
    path.join(FIXTURE_DIR, 'Calculator.after.java'),
    'utf8',
  );
  return { before, after };
}

describe('refactoring-miner-oracle', () => {
  let available = false;

  beforeAll(async () => {
    available = await canUseRefactoringMiner();
    if (!available) {
      // Surface why we are not running the real end-to-end path. The vendored distribution
      // is fetched on demand (see docs/refactoring-miner-oracle.md); when it is absent the
      // tool-availability tests below still run, but the positive verification is skipped.
      // eslint-disable-next-line no-console
      console.warn(
        `[refactoring-miner-oracle] RefactoringMiner not available at ` +
          `"${refactoringMinerLauncher()}" — skipping end-to-end verification. ` +
          `Fetch it per docs/refactoring-miner-oracle.md or set HEALTHY_AI_REFACTORING_MINER.`,
      );
    }
  });

  it('detects the vendored RefactoringMiner launcher in this environment', async () => {
    // The distribution is vendored under tools/refactoringminer/ in this environment.
    expect(available).toBe(true);
  });

  it('reports unavailable gracefully when forced to a non-existent launcher', async () => {
    const prev = process.env.HEALTHY_AI_REFACTORING_MINER;
    process.env.HEALTHY_AI_REFACTORING_MINER = 'definitely-not-a-real-rm-xyz';
    try {
      expect(await canUseRefactoringMiner()).toBe(false);
      const { before, after } = await loadFixtures();
      const result = await verifyRefactoringBetweenFileVersions(
        before,
        after,
        'src/Calculator.java',
        'Extract Method',
      );
      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/unavailable/i);
    } finally {
      if (prev === undefined) delete process.env.HEALTHY_AI_REFACTORING_MINER;
      else process.env.HEALTHY_AI_REFACTORING_MINER = prev;
    }
  });

  it(
    'verifies an Extract Method on a real before/after Java fixture',
    { timeout: 120_000 },
    async () => {
      if (!available) {
        // Documented skip: the real tool is not present in this environment.
        return;
      }
      const { before, after } = await loadFixtures();
      const result = await verifyRefactoringBetweenFileVersions(
        before,
        after,
        'src/Calculator.java',
        'Extract Method',
      );
      expect(result.error).toBeUndefined();
      expect(result.verified).toBe(true);
      // The Extract Method must be present with the extracted helper name in its description.
      const extract = result.detected.find((r) => r.type === 'Extract Method');
      expect(extract).toBeDefined();
      expect(extract?.description).toContain('accumulate');
    },
  );

  it(
    'does NOT verify Extract Method when no refactoring occurred (identical revisions)',
    { timeout: 120_000 },
    async () => {
      if (!available) return;
      const { before } = await loadFixtures();
      // before === after (only a trivial comment change): no Extract Method should appear.
      const after = before.replace(
        'public class Calculator {',
        'public class Calculator { // unchanged behavior',
      );
      const result = await verifyRefactoringBetweenFileVersions(
        before,
        after,
        'src/Calculator.java',
        'Extract Method',
      );
      expect(result.verified).toBe(false);
      expect(result.detected.some((r) => r.type === 'Extract Method')).toBe(false);
    },
  );
});
