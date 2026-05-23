// packages/core/tests/ai-audit/model-benchmarker.test.ts
import { describe, it, expect } from 'vitest';
import { compareToBaseline, aggregateModelStats } from '../../src/ai-audit/benchmarker';
import { loadHistory, appendEntry } from '../../src/ai-audit/benchmark-store';
import { mean, stddev, topN, isOutlier, computeBaseline, flagOutliers } from '../../src/ai-audit/statistics';
import type { BenchmarkEntry } from '../../src/ai-audit/types';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Shared mock analysis function for tests
const mockAnalysis = (code: string, _: string) => ({
  score: code.includes('badCode') ? 6.0 : 8.0,
  smells: code.includes('badCode') ? ['ComplexMethod', 'MagicNumber'] : ['MagicNumber'],
});

// ─── compareToBaseline ────────────────────────────────────────────────────────

describe('compareToBaseline', () => {
  it('calculates negative delta for lower-quality AI code', () => {
    const entry = compareToBaseline(
      'gpt-4.1', 'const x = badCode()', 'const x = goodCode()',
      'src/test.ts', 'typescript', mockAnalysis,
    );
    expect(entry.delta).toBe(6.0 - 8.0);
    expect(entry.delta).toBeLessThan(0);
  });

  it('correctly identifies smells_introduced', () => {
    const entry = compareToBaseline(
      'gpt-4.1', 'const x = badCode()', 'const x = goodCode()',
      'src/test.ts', 'typescript', mockAnalysis,
    );
    expect(entry.smells_introduced).toContain('ComplexMethod');
    expect(entry.smells_introduced).not.toContain('MagicNumber');
  });

  it('correctly identifies smells_fixed when baseline has more smells', () => {
    const mockHighBaseline = (code: string, _: string) => ({
      score: code.includes('ai') ? 7.0 : 6.0,
      smells: code.includes('ai') ? ['MagicNumber'] : ['MagicNumber', 'DeepNesting'],
    });
    const entry = compareToBaseline(
      'claude-sonnet-4-6', 'ai code', 'baseline code',
      'src/test.ts', 'typescript', mockHighBaseline,
    );
    expect(entry.smells_fixed).toContain('DeepNesting');
  });

  it('includes all required fields in returned entry', () => {
    const entry = compareToBaseline(
      'test-model', 'const x = 1;', 'const x = 2;',
      'src/foo.ts', 'typescript', mockAnalysis,
    );
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('model_name', 'test-model');
    expect(entry).toHaveProperty('file_path', 'src/foo.ts');
    expect(entry).toHaveProperty('language', 'typescript');
    expect(entry).toHaveProperty('health_score_ai');
    expect(entry).toHaveProperty('health_score_baseline');
    expect(entry).toHaveProperty('delta');
    expect(entry).toHaveProperty('smells_introduced');
    expect(entry).toHaveProperty('smells_fixed');
  });

  it('timestamp is a valid ISO 8601 string', () => {
    const entry = compareToBaseline('m', 'c', 'c', 'f.ts', 'typescript', mockAnalysis);
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });
});

// ─── aggregateModelStats ──────────────────────────────────────────────────────

describe('aggregateModelStats', () => {
  const sampleEntries: BenchmarkEntry[] = [
    {
      model_name: 'claude-sonnet-4-6', delta: -1.0, health_score_ai: 7.0,
      health_score_baseline: 8.0, timestamp: '', file_path: '', language: '',
      smells_introduced: ['ComplexMethod'], smells_fixed: [],
      ai_specific_smells: [], confidence_ai_generated: 0.8,
    },
    {
      model_name: 'claude-sonnet-4-6', delta: -0.5, health_score_ai: 7.5,
      health_score_baseline: 8.0, timestamp: '', file_path: '', language: '',
      smells_introduced: ['ComplexMethod', 'MagicNumber'], smells_fixed: [],
      ai_specific_smells: [], confidence_ai_generated: 0.7,
    },
  ];

  it('computes correct avg_delta', () => {
    const stats = aggregateModelStats(sampleEntries, 'claude-sonnet-4-6');
    expect(stats.avg_delta).toBeCloseTo(-0.75, 4);
  });

  it('reports correct total_scans', () => {
    const stats = aggregateModelStats(sampleEntries, 'claude-sonnet-4-6');
    expect(stats.total_scans).toBe(2);
  });

  it('returns empty stats for unknown model', () => {
    const stats = aggregateModelStats(sampleEntries, 'unknown-model');
    expect(stats.total_scans).toBe(0);
    expect(stats.avg_delta).toBe(0);
  });

  it('identifies most common smells', () => {
    const stats = aggregateModelStats(sampleEntries, 'claude-sonnet-4-6');
    expect(stats.most_common_smells[0].smell).toBe('ComplexMethod');
    expect(stats.most_common_smells[0].count).toBe(2);
  });
});

// ─── benchmark-store ──────────────────────────────────────────────────────────

describe('loadHistory + appendEntry', () => {
  it('loadHistory returns empty structure for non-existent file', async () => {
    const history = await loadHistory('/non-existent/path/history.json');
    expect(history.schema_version).toBe('1.0');
    expect(history.entries).toHaveLength(0);
  });

  it('appendEntry writes and loadHistory reads back correctly', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bench-test-'));
    const histPath = path.join(tmpDir, 'history.json');

    const entry: BenchmarkEntry = {
      timestamp: new Date().toISOString(),
      model_name: 'test-model',
      file_path: 'src/test.ts',
      language: 'typescript',
      health_score_ai: 7.0,
      health_score_baseline: 8.0,
      delta: -1.0,
      smells_introduced: ['MagicNumber'],
      smells_fixed: [],
      ai_specific_smells: [],
      confidence_ai_generated: 0.75,
    };

    await appendEntry(entry, histPath);
    const history = await loadHistory(histPath);

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].model_name).toBe('test-model');
    expect(history.entries[0].delta).toBe(-1.0);

    await fsp.rm(tmpDir, { recursive: true, force: true });
  });
});
