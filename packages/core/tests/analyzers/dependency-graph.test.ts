import { describe, it, expect } from 'vitest';
import {
  extractImports,
  buildDependencyGraph,
} from '../../src/analyzers/dependency-graph';
import {
  FIXTURE_A,
  FIXTURE_B,
  FIXTURE_C,
  FIXTURE_CYCLE_X,
  FIXTURE_CYCLE_Y,
} from '../fixtures/architecture-fixtures';

describe('extractImports — TypeScript', () => {
  it('extracts relative imports (./b and ./c) from FIXTURE_A', () => {
    const imports = extractImports(FIXTURE_A, 'typescript', 'src/a.ts');
    expect(imports.some(p => p.endsWith('b.ts'))).toBe(true);
    expect(imports.some(p => p.endsWith('c.ts'))).toBe(true);
  });

  it('ignores node_modules imports (e.g. lodash)', () => {
    const code = `
      import _ from 'lodash';
      import { readFile } from 'fs';
      import { x } from './local';
    `;
    const imports = extractImports(code, 'typescript', 'src/file.ts');
    expect(imports.every(p => !p.includes('lodash') && !p.includes('fs'))).toBe(true);
    expect(imports.some(p => p.endsWith('local.ts'))).toBe(true);
  });

  it('handles type-only imports', () => {
    const code = `import type { Config } from './config';`;
    const imports = extractImports(code, 'typescript', 'src/a.ts');
    expect(imports.some(p => p.endsWith('config.ts'))).toBe(true);
  });

  it('extracts require() imports', () => {
    const code = `const x = require('./utils');`;
    const imports = extractImports(code, 'typescript', 'src/a.ts');
    expect(imports.some(p => p.endsWith('utils.ts'))).toBe(true);
  });
});

describe('buildDependencyGraph', () => {
  it('A has FAN-OUT = 2 (imports B and C)', () => {
    const files: Record<string, { content: string; language: string }> = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const aEdges = graph.edges.get('src/a.ts');
    expect(aEdges).toBeDefined();
    expect(aEdges!.size).toBe(2);
  });

  it('C has FAN-OUT = 0 (stable core, no imports)', () => {
    const files: Record<string, { content: string; language: string }> = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const cEdges = graph.edges.get('src/c.ts');
    expect(cEdges).toBeDefined();
    expect(cEdges!.size).toBe(0);
  });

  it('detects direct cycle X <-> Y in edges', () => {
    const files: Record<string, { content: string; language: string }> = {
      'src/x.ts': { content: FIXTURE_CYCLE_X, language: 'typescript' },
      'src/y.ts': { content: FIXTURE_CYCLE_Y, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    const xEdges = graph.edges.get('src/x.ts');
    const yEdges = graph.edges.get('src/y.ts');
    expect(xEdges?.has('src/y.ts')).toBe(true);
    expect(yEdges?.has('src/x.ts')).toBe(true);
  });

  it('all nodes are present in graph.nodes', () => {
    const files: Record<string, { content: string; language: string }> = {
      'src/a.ts': { content: FIXTURE_A, language: 'typescript' },
      'src/b.ts': { content: FIXTURE_B, language: 'typescript' },
      'src/c.ts': { content: FIXTURE_C, language: 'typescript' },
    };
    const graph = buildDependencyGraph(files);
    for (const key of Object.keys(files)) {
      expect(graph.nodes.has(key)).toBe(true);
    }
  });
});
