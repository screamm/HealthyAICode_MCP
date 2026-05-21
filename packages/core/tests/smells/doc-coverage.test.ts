import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectLowDocCoverage } from '../../src/smells/doc-coverage';
import { typescriptProfile } from '../../src/smells/language-profile';

const parser = new Parser();
parser.setLanguage((TypeScript as any).typescript);
const parse = (src: string) => parser.parse(src).rootNode;

describe('detectLowDocCoverage', () => {
  it('exempts files with fewer than 2 exports', () => {
    const src = 'export function f() {}';
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('flags medium when 0% documented (2 exports, 0 JSDoc)', () => {
    const src = 'export function a() {}\nexport function b() {}';
    const smells = detectLowDocCoverage(parse(src), src, typescriptProfile);
    expect(smells.length).toBe(1);
    expect(smells[0].severity).toBe('medium');
    expect(smells[0].type).toBe('LowDocCoverage');
  });

  it('flags low when 50–79% documented', () => {
    const src = `/** Docs for a. */\nexport function a() {}\nexport function b() {}\nexport function c() {}`;
    // 1/3 = 33% → medium... but let me verify with 2/3 = 66%
    const src2 = `/** Docs a. */\nexport function a() {}\n/** Docs b. */\nexport function b() {}\nexport function c() {}`;
    const smells = detectLowDocCoverage(parse(src2), src2, typescriptProfile);
    expect(smells.length).toBe(1);
    expect(smells[0].severity).toBe('low');
  });

  it('returns no smell when ≥80% documented', () => {
    const src = `
/** Docs a. */
export function a() {}
/** Docs b. */
export function b() {}
/** Docs c. */
export function c() {}
/** Docs d. */
export function d() {}
export function e() {}
`.trim();
    // 4/5 = 80% → no smell
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('returns no smell when 100% documented', () => {
    const src = `/** Docs a. */\nexport function a() {}\n/** Docs b. */\nexport function b() {}`;
    expect(detectLowDocCoverage(parse(src), src, typescriptProfile)).toHaveLength(0);
  });

  it('reports smell at line 1', () => {
    const src = 'export function a() {}\nexport function b() {}';
    const smells = detectLowDocCoverage(parse(src), src, typescriptProfile);
    expect(smells[0].line).toBe(1);
  });
});
