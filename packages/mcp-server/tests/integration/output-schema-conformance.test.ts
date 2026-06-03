import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import path from 'node:path';
import { handleCodeHealthReview } from '../../src/tools/code-health-review';
import {
  reviewOutputZodShape,
  smellZodSchema,
} from '../../src/schemas/code-health-review-output.schema';

const FIXTURES_DIR = path.resolve(__dirname, '../../../core/tests/fixtures');

/**
 * Regression guard for the live MCP -32602 "Output validation error" class:
 * the registerTool outputSchema is enforced by the MCP runtime, but unit tests
 * call handlers directly and bypass that layer — so a schema-vs-actual-output
 * drift (e.g. a 'low'-severity smell rejected by a 3-value enum) shipped green.
 * These tests validate the ACTUAL structuredContent against the DECLARED schema.
 */
describe('output schema conformance (regression: -32602 on real output)', () => {
  it('smellZodSchema accepts every Smell.severity value, including low', () => {
    for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
      const r = smellZodSchema.safeParse({
        type: 'ComplexMethod',
        severity,
        description: 'd',
        suggestion: 's',
      });
      expect(r.success, `severity "${severity}" must be accepted by the output schema`).toBe(true);
    }
  });

  it('handleCodeHealthReview structuredContent validates against its declared outputSchema', async () => {
    // Files known to produce low-severity smells (the case that triggered -32602 live).
    for (const rel of ['unhealthy/Complex.cs', 'unhealthy/complex.py', 'unhealthy/complex.ts']) {
      const res: any = await handleCodeHealthReview(path.join(FIXTURES_DIR, rel));
      expect(res.isError, `${rel} should analyze without error`).toBeFalsy();
      const parsed = z.object(reviewOutputZodShape).safeParse(res.structuredContent);
      if (!parsed.success) {
        // Surface the exact mismatch the MCP runtime would reject with -32602.
        throw new Error(`${rel} structuredContent violates outputSchema: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
      }
      expect(parsed.success).toBe(true);
    }
  });
});
