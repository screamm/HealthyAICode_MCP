import { describe, it, expect } from 'vitest';
import { detectSATDFromText, detectMagicNumbersFromText } from '../../src/smells/text-detectors';

describe('detectSATDFromText', () => {
  it('returns empty for clean code with no debt comments', () => {
    const code = 'def calculate(x):\n    return x * 2';
    expect(detectSATDFromText(code)).toHaveLength(0);
  });

  it('detects TODO comment', () => {
    const code = 'def process():\n    # TODO: implement error handling\n    pass';
    const results = detectSATDFromText(code);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('SATD');
    expect(results[0].description).toContain('TODO');
  });

  it('detects FIXME comment', () => {
    const code = 'function foo() {\n    // FIXME: broken in edge cases\n    return null;\n}';
    const results = detectSATDFromText(code);
    expect(results).toHaveLength(1);
    expect(results[0].description).toContain('FIXME');
  });

  it('detects HACK comment', () => {
    const code = 'public void Render() {\n    // HACK: platform workaround\n    DoSomething();\n}';
    const results = detectSATDFromText(code);
    expect(results).toHaveLength(1);
    expect(results[0].description).toContain('HACK');
  });

  it('detects multiple SATD comments', () => {
    const code = '// TODO: refactor this\ndoThing();\n// FIXME: null pointer risk\ndoOtherThing();';
    expect(detectSATDFromText(code)).toHaveLength(2);
  });

  it('includes correct line number', () => {
    const code = 'line 1\nline 2\n// TODO: fix this\nline 4';
    const results = detectSATDFromText(code);
    expect(results[0].line).toBe(3);
  });

  it('severity is low', () => {
    const code = '// TODO: add tests';
    const results = detectSATDFromText(code);
    expect(results[0].severity).toBe('low');
  });

  it('does not flag block comment opening /* ... */', () => {
    const code = '/* TODO: this should not match as inline debt */';
    expect(detectSATDFromText(code)).toHaveLength(0);
  });

  it('detects Javadoc-style * TODO line (space before asterisk)', () => {
    const code = ' * TODO: fix before release';
    const results = detectSATDFromText(code);
    expect(results).toHaveLength(1);
  });
});

describe('detectMagicNumbersFromText', () => {
  it('returns empty for code with no numeric literals', () => {
    const code = 'name = "hello"\nactive = True';
    expect(detectMagicNumbersFromText(code, 'test.py')).toHaveLength(0);
  });

  it('does not flag 0 or 1', () => {
    const code = 'x = 0\ny = 1\nz = -1';
    expect(detectMagicNumbersFromText(code, 'test.py')).toHaveLength(0);
  });

  it('does not flag ALL_CAPS constant assignments', () => {
    const code = 'MAX_SIZE = 100\nTIMEOUT_MS = 5000';
    expect(detectMagicNumbersFromText(code, 'test.py')).toHaveLength(0);
  });

  it('flags inline magic numbers in conditions', () => {
    const code = 'if (timeout > 3000) { retry(); }';
    const results = detectMagicNumbersFromText(code, 'test.js');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe('MagicNumber');
  });

  it('includes correct line number', () => {
    const code = '\n\nif (x > 42) {}';
    const results = detectMagicNumbersFromText(code, 'test.py');
    expect(results[0].line).toBe(3);
  });

  it('severity is low', () => {
    const code = 'sleep(500);';
    const results = detectMagicNumbersFromText(code, 'test.java');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].severity).toBe('low');
  });

  it('does not flag float literal like 2.5', () => {
    const code = 'x = 2.5\ny = 3.14';
    expect(detectMagicNumbersFromText(code, 'test.py')).toHaveLength(0);
  });
});
