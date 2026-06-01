/**
 * diagnostics.test.ts
 *
 * Headless unit tests for:
 *   - smellsToDiagnostics()  (smell → DiagnosticLike mapping)
 *   - buildStatusBarLabel()  (score → status-bar text)
 *   - refreshDiagnostics()   (DiagnosticCollection.set / .delete routing)
 *   - makeRange()            (1-indexed → 0-indexed range conversion)
 *
 * These tests run with Vitest in a plain Node environment — no VS Code host.
 * The 'vscode' module is aliased to vscode-mock.ts via vitest.config.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import type { HealthResult, Smell } from '@healthy-ai-code/core';

import {
  smellsToDiagnostics,
  buildStatusBarLabel,
  refreshDiagnostics,
  makeRange,
} from '../diagnostics';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSmell(overrides: Partial<Smell> = {}): Smell {
  return {
    type: 'ComplexMethod',
    severity: 'high',
    line: 10,
    description: 'Cyclomatic complexity is too high',
    suggestion: 'Extract sub-methods',
    ...overrides,
  };
}

function makeResult(smells: Smell[] = []): HealthResult {
  return {
    score: 7.5,
    category: 'yellow',
    language: 'typescript',
    filePath: '/test/foo.ts',
    smells,
    metrics: {
      cyclomaticComplexity: 12,
      cognitiveComplexity: 10,
      maxNestingDepth: 4,
      avgFunctionLength: 30,
      maxFunctionLength: 80,
      avgParameterCount: 3,
      maxParameterCount: 6,
      totalLines: 200,
      duplicationScore: 0,
    },
    functions: [],
    subscores: {
      overall: 7.5,
      complexity: 6.0,
      maintainability: 8.0,
      security: 10.0,
      documentation: 7.0,
      naming: 9.0,
    },
    loopComplete: false,
  };
}

// ── makeRange ─────────────────────────────────────────────────────────────────

describe('makeRange', () => {
  it('converts a 1-indexed line to a 0-indexed range', () => {
    const range = makeRange(1);
    expect(range.start.line).toBe(0);
    expect(range.end.line).toBe(0);
    expect(range.start.character).toBe(0);
    expect(range.end.character).toBe(9999);
  });

  it('handles line 10 correctly', () => {
    const range = makeRange(10);
    expect(range.start.line).toBe(9);
    expect(range.end.line).toBe(9);
  });

  it('clamps line 0 to 0 (defensive)', () => {
    const range = makeRange(0);
    expect(range.start.line).toBe(0);
  });
});

// ── smellsToDiagnostics ────────────────────────────────────────────────────────

describe('smellsToDiagnostics', () => {
  it('returns an empty array when there are no smells', () => {
    const result = makeResult([]);
    expect(smellsToDiagnostics(result)).toEqual([]);
  });

  it('maps a single smell to a single diagnostic', () => {
    const smell = makeSmell({ type: 'DeepNesting', severity: 'medium', line: 5, description: 'Too deeply nested', suggestion: 'Flatten' });
    const diags = smellsToDiagnostics(makeResult([smell]));

    expect(diags).toHaveLength(1);
    const d = diags[0];
    expect(d.code).toBe('DeepNesting');
    expect(d.source).toBe('Healthy AI Code');
    expect(d.message).toContain('DeepNesting');
    expect(d.message).toContain('Too deeply nested');
    expect(d.message).toContain('Flatten');
    expect(d.severity).toBe(1); // Warning
    expect(d.range.start.line).toBe(4); // line 5 → index 4
  });

  it('maps critical severity to DiagnosticSeverity.Error (0)', () => {
    const smell = makeSmell({ severity: 'critical' });
    const diags = smellsToDiagnostics(makeResult([smell]));
    expect(diags[0].severity).toBe(0);
  });

  it('maps high severity to DiagnosticSeverity.Error (0)', () => {
    const smell = makeSmell({ severity: 'high' });
    const diags = smellsToDiagnostics(makeResult([smell]));
    expect(diags[0].severity).toBe(0);
  });

  it('maps medium severity to DiagnosticSeverity.Warning (1)', () => {
    const smell = makeSmell({ severity: 'medium' });
    const diags = smellsToDiagnostics(makeResult([smell]));
    expect(diags[0].severity).toBe(1);
  });

  it('maps low severity to DiagnosticSeverity.Information (2)', () => {
    const smell = makeSmell({ severity: 'low' });
    const diags = smellsToDiagnostics(makeResult([smell]));
    expect(diags[0].severity).toBe(2);
  });

  it('maps multiple smells to the correct count of diagnostics', () => {
    const smells = [
      makeSmell({ type: 'GodClass', severity: 'critical', line: 1 }),
      makeSmell({ type: 'LargeFile', severity: 'medium', line: 100 }),
      makeSmell({ type: 'SATD', severity: 'low', line: 42 }),
    ];
    const diags = smellsToDiagnostics(makeResult(smells));
    expect(diags).toHaveLength(3);
    expect(diags.map((d) => d.code)).toEqual(['GodClass', 'LargeFile', 'SATD']);
  });

  it('preserves smell line numbers as 0-indexed ranges', () => {
    const smell = makeSmell({ line: 20 });
    const diags = smellsToDiagnostics(makeResult([smell]));
    expect(diags[0].range.start.line).toBe(19);
    expect(diags[0].range.end.line).toBe(19);
  });
});

// ── buildStatusBarLabel ────────────────────────────────────────────────────────

describe('buildStatusBarLabel', () => {
  it('uses $(pass) icon for green category', () => {
    expect(buildStatusBarLabel(9.8, 'green')).toBe('$(pass) 9.8 Health');
  });

  it('uses $(warning) icon for yellow category', () => {
    expect(buildStatusBarLabel(7.2, 'yellow')).toBe('$(warning) 7.2 Health');
  });

  it('uses $(error) icon for red category', () => {
    expect(buildStatusBarLabel(3.1, 'red')).toBe('$(error) 3.1 Health');
  });

  it('formats the score to one decimal place', () => {
    expect(buildStatusBarLabel(10.0, 'green')).toBe('$(pass) 10.0 Health');
    expect(buildStatusBarLabel(1.0, 'red')).toBe('$(error) 1.0 Health');
  });
});

// ── refreshDiagnostics ─────────────────────────────────────────────────────────

describe('refreshDiagnostics', () => {
  it('calls collection.set when diagnostics array is non-empty', () => {
    const collection = { set: vi.fn(), delete: vi.fn() };
    const uri = { toString: () => 'file:///test.ts' } as unknown as Parameters<typeof refreshDiagnostics>[1];
    const diagnostics = [{ range: makeRange(1), message: 'x', severity: 0 as const, source: 'S', code: 'C' }];

    refreshDiagnostics(collection, uri, diagnostics as never);

    expect(collection.set).toHaveBeenCalledOnce();
    expect(collection.delete).not.toHaveBeenCalled();
  });

  it('calls collection.delete when diagnostics array is empty', () => {
    const collection = { set: vi.fn(), delete: vi.fn() };
    const uri = { toString: () => 'file:///test.ts' } as unknown as Parameters<typeof refreshDiagnostics>[1];

    refreshDiagnostics(collection, uri, [] as never);

    expect(collection.delete).toHaveBeenCalledOnce();
    expect(collection.set).not.toHaveBeenCalled();
  });
});
