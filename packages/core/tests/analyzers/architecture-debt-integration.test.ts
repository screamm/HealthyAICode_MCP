import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readProjectFiles } from '../../src/analyzers/project-file-reader';
import { buildDependencyGraph } from '../../src/analyzers/dependency-graph';
import { computeFanInFanOut, computePropagationCost } from '../../src/analyzers/architecture-debt';
import { findStronglyConnectedComponents } from '../../src/analyzers/scc';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arch-integ-'));
  const src = path.join(tmpDir, 'src');
  await fsp.mkdir(src, { recursive: true });

  await fsp.writeFile(
    path.join(src, 'config.ts'),
    'export const config = { timeout: 3000 };',
    'utf-8',
  );
  await fsp.writeFile(
    path.join(src, 'utils.ts'),
    "import { config } from './config';\nexport function getTimeout() { return config.timeout; }",
    'utf-8',
  );
  await fsp.writeFile(
    path.join(src, 'feature.ts'),
    "import { getTimeout } from './utils';\nimport { config } from './config';\nexport function run() { return getTimeout(); }",
    'utf-8',
  );
  await fsp.writeFile(
    path.join(src, 'cycle-a.ts'),
    "import { b } from './cycle-b';\nexport function a() { return b(); }",
    'utf-8',
  );
  await fsp.writeFile(
    path.join(src, 'cycle-b.ts'),
    "import { a } from './cycle-a';\nexport function b() { return a(); }",
    'utf-8',
  );
});

afterAll(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('Architecture debt — integration pipeline', () => {
  it('config.ts has the highest propagation cost', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    const graph = buildDependencyGraph(fileMap);
    const propCosts = computePropagationCost(graph);

    const configKey = [...propCosts.keys()].find(k => k.endsWith('config.ts'));
    const utilsKey = [...propCosts.keys()].find(k => k.endsWith('utils.ts'));
    const featureKey = [...propCosts.keys()].find(k => k.endsWith('feature.ts'));

    expect(configKey).toBeDefined();
    const configCost = propCosts.get(configKey!)!;
    const utilsCost = utilsKey ? propCosts.get(utilsKey!) ?? 0 : 0;
    const featureCost = featureKey ? propCosts.get(featureKey!) ?? 0 : 0;

    expect(configCost).toBeGreaterThanOrEqual(utilsCost);
    expect(configCost).toBeGreaterThanOrEqual(featureCost);
  });

  it('cycle cycle-a <-> cycle-b is detected', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    const graph = buildDependencyGraph(fileMap);
    const allSccs = findStronglyConnectedComponents(graph.edges);
    const cycles = allSccs.filter(scc => scc.length > 1);
    expect(cycles.length).toBeGreaterThan(0);
    const cycleMembers = cycles.flat();
    const hasCycleA = cycleMembers.some(m => m.includes('cycle-a'));
    const hasCycleB = cycleMembers.some(m => m.includes('cycle-b'));
    expect(hasCycleA).toBe(true);
    expect(hasCycleB).toBe(true);
  });

  it('cycle-a.ts and cycle-b.ts are in a cycle (inCycle nodes)', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    const graph = buildDependencyGraph(fileMap);
    const allSccs = findStronglyConnectedComponents(graph.edges);
    const inCycleNodes = new Set(allSccs.filter(s => s.length > 1).flat());
    const cycleAKey = [...graph.nodes].find(k => k.includes('cycle-a'));
    const cycleBKey = [...graph.nodes].find(k => k.includes('cycle-b'));
    expect(cycleAKey).toBeDefined();
    expect(cycleBKey).toBeDefined();
    expect(inCycleNodes.has(cycleAKey!)).toBe(true);
    expect(inCycleNodes.has(cycleBKey!)).toBe(true);
  });

  it('config.ts has fanIn >= 2 (imported by utils and feature)', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    const graph = buildDependencyGraph(fileMap);
    const fanMetrics = computeFanInFanOut(graph);
    const configKey = [...fanMetrics.keys()].find(k => k.endsWith('config.ts'));
    expect(configKey).toBeDefined();
    expect(fanMetrics.get(configKey!)!.fanIn).toBeGreaterThanOrEqual(2);
  });

  it('feature.ts has fanOut === 2 (imports utils and config)', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    const graph = buildDependencyGraph(fileMap);
    const fanMetrics = computeFanInFanOut(graph);
    const featureKey = [...fanMetrics.keys()].find(k => k.endsWith('feature.ts'));
    expect(featureKey).toBeDefined();
    expect(fanMetrics.get(featureKey!)!.fanOut).toBe(2);
  });

  it('totalModules covers all 5 source files', async () => {
    const fileMap = await readProjectFiles(tmpDir);
    expect(Object.keys(fileMap)).toHaveLength(5);
  });
});
