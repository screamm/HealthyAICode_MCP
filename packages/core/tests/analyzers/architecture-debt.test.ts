import { describe, it, expect, vi } from 'vitest';
import type { ModuleDebtProfile, DependencyCycle, ArchitectureDebtResult } from '../../src/types';

// ---------------------------------------------------------------------------
// Type compilation test
// ---------------------------------------------------------------------------

describe('ArchitectureDebt types', () => {
  it('ModuleDebtProfile compiles with all required fields', () => {
    const profile: ModuleDebtProfile = {
      filePath: 'src/auth.ts', fanIn: 3, fanOut: 5, instability: 0.625,
      propagationCost: 0.15, inCycle: false, changeFrequency: 8,
      costOfChange: 0.32, costOfChangeSeverity: 'medium',
    };
    expect(profile.fanIn).toBe(3);
  });

  it('DependencyCycle compiles with all required fields', () => {
    const cycle: DependencyCycle = {
      members: ['src/a.ts', 'src/b.ts'],
      size: 2,
      severity: 'medium',
    };
    expect(cycle.size).toBe(2);
  });

  it('ArchitectureDebtResult has correct shape', () => {
    const result: ArchitectureDebtResult = {
      directory: '/some/project',
      depth: 'file',
      totalModules: 0,
      modules: [],
      cycles: [],
      topCostlyModules: [],
      summary: {
        avgFanIn: 0, avgFanOut: 0, avgPropagationCost: 0, avgCostOfChange: 0,
        cycleCount: 0, modulesInCycles: 0, highSeverityModules: 0,
      },
    };
    expect(result.totalModules).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FAN-IN / FAN-OUT tests
// ---------------------------------------------------------------------------

describe('computeFanInFanOut', () => {
  it('A has fanOut=2, fanIn=0, instability=1.0', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computeFanInFanOut } = await import('../../src/analyzers/architecture-debt');
    const FIXTURE_A = `\nimport { doSomething } from './b';\nimport type { Config } from './c';\nexport function featureA(): void { doSomething(); }\n`;
    const FIXTURE_B = `\nimport { config } from './c';\nexport function doSomething(): void { console.log(config); }\n`;
    const FIXTURE_C = `\nexport const config = { timeout: 3000 };\n`;
    const files = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const metrics = computeFanInFanOut(graph);
    const a = metrics.get('src/a.ts')!;
    expect(a.fanOut).toBe(2);
    expect(a.fanIn).toBe(0);
    expect(a.instability).toBeCloseTo(1.0);
  });

  it('B has fanOut=1, fanIn=1, instability=0.5', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computeFanInFanOut } = await import('../../src/analyzers/architecture-debt');
    const FIXTURE_A = `\nimport { doSomething } from './b';\nimport type { Config } from './c';\nexport function featureA(): void { doSomething(); }\n`;
    const FIXTURE_B = `\nimport { config } from './c';\nexport function doSomething(): void { console.log(config); }\n`;
    const FIXTURE_C = `\nexport const config = { timeout: 3000 };\n`;
    const files = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const metrics = computeFanInFanOut(graph);
    const b = metrics.get('src/b.ts')!;
    expect(b.fanOut).toBe(1);
    expect(b.fanIn).toBe(1);
    expect(b.instability).toBeCloseTo(0.5);
  });

  it('C has fanOut=0, fanIn=2, instability=0.0', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computeFanInFanOut } = await import('../../src/analyzers/architecture-debt');
    const FIXTURE_A = `\nimport { doSomething } from './b';\nimport type { Config } from './c';\nexport function featureA(): void { doSomething(); }\n`;
    const FIXTURE_B = `\nimport { config } from './c';\nexport function doSomething(): void { console.log(config); }\n`;
    const FIXTURE_C = `\nexport const config = { timeout: 3000 };\n`;
    const files = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const metrics = computeFanInFanOut(graph);
    const c = metrics.get('src/c.ts')!;
    expect(c.fanOut).toBe(0);
    expect(c.fanIn).toBe(2);
    expect(c.instability).toBeCloseTo(0.0);
  });

  it('empty graph returns empty Map', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computeFanInFanOut } = await import('../../src/analyzers/architecture-debt');
    const emptyGraph = buildDependencyGraph({});
    const metrics = computeFanInFanOut(emptyGraph);
    expect(metrics.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Propagation Cost tests
// ---------------------------------------------------------------------------

describe('computePropagationCost', () => {
  const FIXTURE_A = `\nimport { doSomething } from './b';\nimport type { Config } from './c';\nexport function featureA(): void { doSomething(); }\n`;
  const FIXTURE_B = `\nimport { config } from './c';\nexport function doSomething(): void { console.log(config); }\n`;
  const FIXTURE_C = `\nexport const config = { timeout: 3000 };\n`;

  it('all propagation cost values are in [0, 1]', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computePropagationCost } = await import('../../src/analyzers/architecture-debt');
    const files = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const costs = computePropagationCost(graph);
    for (const [, v] of costs) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('C has higher propagation cost than A', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computePropagationCost } = await import('../../src/analyzers/architecture-debt');
    const files = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const costs = computePropagationCost(graph);
    const cCost = costs.get('src/c.ts')!;
    const aCost = costs.get('src/a.ts')!;
    expect(cCost).toBeGreaterThan(aCost);
  });

  it('empty graph returns empty Map', async () => {
    const { buildDependencyGraph } = await import('../../src/analyzers/dependency-graph');
    const { computePropagationCost } = await import('../../src/analyzers/architecture-debt');
    const emptyGraph = buildDependencyGraph({});
    const costs = computePropagationCost(emptyGraph);
    expect(costs.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator tests (mock getChangeFrequency via vi.mock)
// ---------------------------------------------------------------------------

vi.mock('../../src/analyzers/change-frequency', () => ({
  getChangeFrequency: vi.fn().mockResolvedValue(5),
}));

describe('analyzeArchitectureDebt — orchestrator', () => {
  const FIXTURE_A = `\nimport { doSomething } from './b';\nimport type { Config } from './c';\nexport function featureA(): void { doSomething(); }\n`;
  const FIXTURE_B = `\nimport { config } from './c';\nexport function doSomething(): void { console.log(config); }\n`;
  const FIXTURE_C = `\nexport const config = { timeout: 3000 };\n`;
  const FIXTURE_CYCLE_X = `\nimport { y } from './y';\nexport function x(): void { y(); }\n`;
  const FIXTURE_CYCLE_Y = `\nimport { x } from './x';\nexport function y(): void { x(); }\n`;

  const allFiles = {
    'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
    'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
    'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    'src/x.ts': { content: FIXTURE_CYCLE_X, language: 'typescript' },
    'src/y.ts': { content: FIXTURE_CYCLE_Y, language: 'typescript' },
  };

  it('totalModules >= 5 (includes all graph nodes)', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    expect(result.totalModules).toBeGreaterThanOrEqual(5);
  });

  it('cycle X <-> Y is detected', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('X and Y have inCycle === true', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    const x = result.modules.find(m => m.filePath === 'src/x.ts');
    const y = result.modules.find(m => m.filePath === 'src/y.ts');
    expect(x?.inCycle).toBe(true);
    expect(y?.inCycle).toBe(true);
  });

  it('modules are sorted by costOfChange descending', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    for (let i = 1; i < result.modules.length; i++) {
      expect(result.modules[i - 1].costOfChange).toBeGreaterThanOrEqual(
        result.modules[i].costOfChange,
      );
    }
  });

  it('topCostlyModules.length <= 10', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    expect(result.topCostlyModules.length).toBeLessThanOrEqual(10);
  });

  it('all costOfChange values are in [0, 1]', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    for (const m of result.modules) {
      expect(m.costOfChange).toBeGreaterThanOrEqual(0);
      expect(m.costOfChange).toBeLessThanOrEqual(1);
    }
  });

  it('summary.cycleCount > 0 when cycles exist', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', allFiles);
    expect(result.summary.cycleCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('analyzeArchitectureDebt — edge cases', () => {
  it('single file without dependencies: totalModules=1, cycles=[], propagationCost=0, fanIn=0, fanOut=0', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', {
      'src/standalone.ts': { content: 'export const x = 1;', language: 'typescript' },
    });
    expect(result.totalModules).toBe(1);
    expect(result.cycles).toHaveLength(0);
    expect(result.modules[0].propagationCost).toBe(0);
    expect(result.modules[0].fanIn).toBe(0);
    expect(result.modules[0].fanOut).toBe(0);
    expect(result.modules[0].inCycle).toBe(false);
    // costOfChange is in [0, 1]
    expect(result.modules[0].costOfChange).toBeGreaterThanOrEqual(0);
    expect(result.modules[0].costOfChange).toBeLessThanOrEqual(1);
  });

  it('empty file map: totalModules=0, cycles=[], modules=[] — never throws', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', {});
    expect(result.totalModules).toBe(0);
    expect(result.cycles).toHaveLength(0);
    expect(result.modules).toHaveLength(0);
  });

  it('self-import: no infinite loop, no crash', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const result = await analyzeArchitectureDebt('/repo', {
      'src/self.ts': { content: `import { x } from './self';`, language: 'typescript' },
    });
    expect(result.modules[0].fanOut).toBe(0);
  });

  it('extreme normalisation: costOfChange always in [0, 1] with large fan-in star topology', async () => {
    const { analyzeArchitectureDebt } = await import('../../src/analyzers/architecture-debt');
    const files: Record<string, { content: string; language: string }> = {
      'src/core.ts': { content: 'export const x = 1;', language: 'typescript' },
    };
    for (let i = 0; i < 50; i++) {
      files[`src/dep${i}.ts`] = {
        content: `import { x } from './core';`,
        language: 'typescript',
      };
    }
    const result = await analyzeArchitectureDebt('/repo', files);
    for (const m of result.modules) {
      expect(m.costOfChange).toBeGreaterThanOrEqual(0);
      expect(m.costOfChange).toBeLessThanOrEqual(1);
    }
  });
});
