import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

describe('AGENTS.md i projektrooten', () => {
  it('filen existerar i projektrooten', () => {
    const rootPath = path.resolve(__dirname, '../../../AGENTS.md');
    expect(fs.existsSync(rootPath)).toBe(true);
  });

  it('innehåller obligatoriska sektioner', () => {
    const rootPath = path.resolve(__dirname, '../../../AGENTS.md');
    const content = fs.readFileSync(rootPath, 'utf-8');

    expect(content).toContain('code_health_review');
    expect(content).toContain('pre_commit_code_health_safeguard');
    expect(content).toContain('analyze_change_set');
    expect(content).toContain('loopComplete');
    expect(content).toContain('nextAction');
    expect(content).toContain('7.0');
    expect(content).toContain('9.5');
  });

  it('innehåller verktygsöversikt-tabell', () => {
    const rootPath = path.resolve(__dirname, '../../../AGENTS.md');
    const content = fs.readFileSync(rootPath, 'utf-8');

    expect(content).toContain('code_health_score');
    expect(content).toContain('code_health_refactoring_business_case');
    expect(content).toContain('explain_code_health');
  });
});
