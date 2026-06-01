/**
 * Integration tests for the StructuralCache.
 *
 * Verifies:
 *  1. hasReview / getSmellIndex semantics.
 *  2. LRU eviction at 201 entries.
 *  3. isStale correctly detects mtime changes.
 *  4. invalidate removes a single entry.
 *  5. Two-call code_health_review simulation: second call returns a compact
 *     response whose JSON size is < 30 % of the first call's response.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StructuralCache } from '../../src/tools/structural-cache';
import type { Smell } from '@healthy-ai-code/core';

/** Minimal Smell factory for tests. */
function makeSmell(overrides: Partial<Smell> = {}): Smell {
  return {
    type: 'ComplexMethod',
    severity: 'high',
    line: 10,
    description: 'Cyclomatic complexity exceeds threshold',
    suggestion: 'Extract sub-routines',
    ...overrides,
  };
}

/** A set of realistic smells for token-size comparison tests. */
const REALISTIC_SMELLS: Smell[] = [
  makeSmell({ type: 'ComplexMethod', severity: 'high', line: 12, functionName: 'processOrder', description: 'Cyclomatic complexity 18 exceeds threshold of 10; function handles order validation, inventory check, discount application, tax calculation, and notification dispatch all in one block', suggestion: 'Extract each responsibility into a dedicated function: validateOrderItems, applyDiscountRules, calculateOrderTax, dispatchOrderNotification; target CC < 5 per function' }),
  makeSmell({ type: 'DeepNesting', severity: 'medium', line: 22, functionName: 'validateUser', description: 'Nesting depth 5 at line 22 exceeds the recommended maximum of 4; deeply nested conditionals make the control-flow hard to follow and increase the risk of logic errors in edge cases', suggestion: 'Apply early-return guard clauses at the top of the function to handle null/invalid cases first, then flatten the remaining logic into a linear sequence' }),
  makeSmell({ type: 'GodClass', severity: 'high', line: 1, description: 'Class OrderManager has 42 public methods and spans 820 lines; it mixes persistence, business logic, notification, reporting, and authentication concerns in a single file — a textbook God Class', suggestion: 'Apply the Single Responsibility Principle: extract OrderRepository for persistence, OrderNotifier for emails, OrderReporter for reporting; leave only orchestration in OrderManager' }),
  makeSmell({ type: 'HardcodedCredential', severity: 'critical', line: 87, functionName: 'connectDatabase', description: 'Hardcoded database password "P@ssw0rd123" detected on line 87 inside connectDatabase — this credential will be committed to version control and exposed in source code repositories', suggestion: 'Remove the literal and read the password from process.env.DB_PASSWORD at runtime; add DB_PASSWORD to .env.example without a real value, and load it via dotenv in local development' }),
  makeSmell({ type: 'LongParameterList', severity: 'medium', line: 55, functionName: 'createReport', description: 'Function createReport accepts 9 parameters (userId, startDate, endDate, format, locale, currency, includeVat, includeShipping, groupBy), well above the threshold of 4', suggestion: 'Introduce a ReportOptions interface or plain object literal to group the 9 parameters into a single config argument; this also makes call-sites self-documenting' }),
  makeSmell({ type: 'BrainMethod', severity: 'high', line: 200, functionName: 'handleRequest', description: 'Method handleRequest is 95 lines with cyclomatic complexity 14 — a Brain Method that encodes the entire request-processing pipeline in one place', suggestion: 'Decompose into parseRequest, authorizeRequest, routeRequest, and buildResponse; each step should be independently testable and under 20 lines' }),
];

describe('StructuralCache: hasReview and getSmellIndex', () => {
  let cache: StructuralCache;

  beforeEach(() => {
    cache = new StructuralCache();
  });

  it('hasReview returns false for an unseen file', () => {
    expect(cache.hasReview('/some/file.ts')).toBe(false);
  });

  it('hasReview returns true after recordFirstReview', () => {
    cache.recordFirstReview('/app/foo.ts', [makeSmell()], 7.5, 1000);
    expect(cache.hasReview('/app/foo.ts')).toBe(true);
  });

  it('getSmellIndex returns undefined for an unseen file', () => {
    expect(cache.getSmellIndex('/none.ts')).toBeUndefined();
  });

  it('getSmellIndex returns correct entries after recording', () => {
    const smells: Smell[] = [
      makeSmell({ type: 'ComplexMethod', severity: 'high', line: 10, functionName: 'compute' }),
      makeSmell({ type: 'DeepNesting', severity: 'medium', line: 25 }),
    ];
    cache.recordFirstReview('/app/service.ts', smells, 6.2, 2000);

    const index = cache.getSmellIndex('/app/service.ts');
    expect(index).toBeDefined();
    expect(index!).toHaveLength(2);

    expect(index![0].smellType).toBe('ComplexMethod');
    expect(index![0].severity).toBe('high');
    expect(index![0].startLine).toBe(10);
    expect(index![0].functionName).toBe('compute');

    expect(index![1].smellType).toBe('DeepNesting');
    expect(index![1].severity).toBe('medium');
    expect(index![1].startLine).toBe(25);
  });

  it('derives endLine from chunkRanges when present', () => {
    const smellWithChunks: Smell = {
      type: 'BumpyRoad',
      severity: 'medium',
      line: 10,
      description: 'Bumpy road',
      suggestion: 'Flatten',
      chunkRanges: [
        { startLine: 10, endLine: 15 },
        { startLine: 20, endLine: 30 },
      ],
    };
    cache.recordFirstReview('/app/bumpy.ts', [smellWithChunks], 8.0, 3000);
    const index = cache.getSmellIndex('/app/bumpy.ts')!;
    expect(index[0].endLine).toBe(30);
  });

  it('falls back to startLine when no chunkRanges present', () => {
    cache.recordFirstReview('/app/simple.ts', [makeSmell({ line: 42 })], 9.0, 4000);
    const index = cache.getSmellIndex('/app/simple.ts')!;
    expect(index[0].startLine).toBe(42);
    expect(index[0].endLine).toBe(42);
  });

  it('getCachedScore returns the recorded score', () => {
    cache.recordFirstReview('/app/scored.ts', [makeSmell()], 7.8, 5000);
    expect(cache.getCachedScore('/app/scored.ts')).toBe(7.8);
  });
});

describe('StructuralCache: LRU eviction', () => {
  it('evicts the oldest entry when capacity (200) is exceeded', () => {
    const cache = new StructuralCache(200);

    // Fill to capacity
    for (let i = 0; i < 200; i++) {
      cache.recordFirstReview(`/file/${i}.ts`, [makeSmell()], 8.0, i);
    }
    expect(cache.size).toBe(200);
    expect(cache.hasReview('/file/0.ts')).toBe(true);

    // Add the 201st entry — oldest (file/0.ts) should be evicted
    cache.recordFirstReview('/file/200.ts', [makeSmell()], 8.0, 200);
    expect(cache.size).toBe(200);
    expect(cache.hasReview('/file/0.ts')).toBe(false);
    expect(cache.hasReview('/file/1.ts')).toBe(true);
    expect(cache.hasReview('/file/200.ts')).toBe(true);
  });

  it('refreshing an existing entry promotes it (prevents premature eviction)', () => {
    const cache = new StructuralCache(3);

    cache.recordFirstReview('/a.ts', [makeSmell()], 8.0, 1);
    cache.recordFirstReview('/b.ts', [makeSmell()], 8.0, 2);
    cache.recordFirstReview('/c.ts', [makeSmell()], 8.0, 3);

    // Refresh /a.ts — it moves to "most recent"
    cache.recordFirstReview('/a.ts', [makeSmell()], 9.0, 4);

    // Add a new entry — /b.ts should be evicted (oldest now)
    cache.recordFirstReview('/d.ts', [makeSmell()], 8.0, 5);

    expect(cache.hasReview('/b.ts')).toBe(false);
    expect(cache.hasReview('/a.ts')).toBe(true);
    expect(cache.hasReview('/c.ts')).toBe(true);
    expect(cache.hasReview('/d.ts')).toBe(true);
  });
});

describe('StructuralCache: isStale and invalidate', () => {
  let cache: StructuralCache;

  beforeEach(() => {
    cache = new StructuralCache();
  });

  it('isStale returns true for an unknown file', () => {
    expect(cache.isStale('/unknown.ts', 9999)).toBe(true);
  });

  it('isStale returns false when mtime matches', () => {
    cache.recordFirstReview('/app/stable.ts', [makeSmell()], 8.0, 12345);
    expect(cache.isStale('/app/stable.ts', 12345)).toBe(false);
  });

  it('isStale returns true when mtime differs', () => {
    cache.recordFirstReview('/app/changed.ts', [makeSmell()], 8.0, 12345);
    expect(cache.isStale('/app/changed.ts', 99999)).toBe(true);
  });

  it('invalidate removes the entry', () => {
    cache.recordFirstReview('/app/temp.ts', [makeSmell()], 7.0, 1000);
    expect(cache.hasReview('/app/temp.ts')).toBe(true);

    cache.invalidate('/app/temp.ts');
    expect(cache.hasReview('/app/temp.ts')).toBe(false);
    expect(cache.getSmellIndex('/app/temp.ts')).toBeUndefined();
  });

  it('invalidate on unknown file is a no-op', () => {
    expect(() => cache.invalidate('/does/not/exist.ts')).not.toThrow();
  });
});

describe('StructuralCache: compact re-review response token-size comparison', () => {
  /**
   * Simulates what code-health-review.ts will eventually do:
   *   - First call: returns the full response object (score + full smells + summary text)
   *   - Second call: returns the compact index-only object (score + SmellIndexEntry[])
   *
   * The compact response MUST be < 30 % of the full response in JSON character length.
   */
  it('compact (re-review) response is < 30 % of full (first-review) response length', () => {
    const filePath = '/app/complex-service.ts';
    const score = 5.8;
    const mtime = Date.now();

    const cache = new StructuralCache();
    cache.recordFirstReview(filePath, REALISTIC_SMELLS, score, mtime);

    // Simulate first-call full response
    const fullSummaryText =
      `Fil: ${filePath}\n` +
      `Hälsopoäng: ${score}/10.0  (Röd — Allvarlig teknisk skuld)\n\n` +
      'Identifierade problem:\n' +
      REALISTIC_SMELLS.map(s =>
        `  [HÖG]     ${s.type}: ${s.description}\n             → ${s.suggestion}`
      ).join('\n');

    const firstResponse = {
      score,
      category: 'red',
      loopComplete: false,
      issues: REALISTIC_SMELLS,
      summary: fullSummaryText,
      nextAction: {
        action: 'refactor',
        instruction: 'Fix the top smell first, then re-review.',
        priority: REALISTIC_SMELLS[0],
        toolToCallAfter: 'code_health_review',
      },
    };

    // Simulate second-call compact response (cache hit)
    const smellIndex = cache.getSmellIndex(filePath)!;
    const secondResponse = {
      score,
      category: 'red',
      loopComplete: false,
      smellIndex,
      cacheHit: true,
      note: 'Re-review: returnerar byteRange-index, inte full text.',
    };

    const firstSize = JSON.stringify(firstResponse).length;
    const secondSize = JSON.stringify(secondResponse).length;

    console.log(`First response size:  ${firstSize} chars`);
    console.log(`Second response size: ${secondSize} chars`);
    console.log(`Ratio: ${(secondSize / firstSize * 100).toFixed(1)}%`);

    expect(secondSize).toBeLessThan(firstSize * 0.3);
  });
});
