import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/language-detect';

describe('detectLanguage', () => {
  // TypeScript
  it('detects .ts as typescript', () => {
    expect(detectLanguage('src/auth/login.ts')).toBe('typescript');
  });

  it('detects .tsx as typescript', () => {
    expect(detectLanguage('components/Button.tsx')).toBe('typescript');
  });

  it('detects uppercase .TS as typescript (case-insensitive)', () => {
    expect(detectLanguage('src/FILE.TS')).toBe('typescript');
  });

  // JavaScript
  it('detects .js as javascript', () => {
    expect(detectLanguage('src/utils.js')).toBe('javascript');
  });

  it('detects .jsx as javascript', () => {
    expect(detectLanguage('components/App.jsx')).toBe('javascript');
  });

  it('detects .mjs as javascript', () => {
    expect(detectLanguage('lib/module.mjs')).toBe('javascript');
  });

  it('detects .cjs as javascript', () => {
    expect(detectLanguage('lib/require.cjs')).toBe('javascript');
  });

  // Python
  it('detects .py as python', () => {
    expect(detectLanguage('scripts/analyze.py')).toBe('python');
  });

  // Java / Kotlin
  it('detects .java as java', () => {
    expect(detectLanguage('src/main/java/App.java')).toBe('java');
  });

  it('detects .kt as kotlin', () => {
    expect(detectLanguage('app/src/main/Main.kt')).toBe('kotlin');
  });

  it('detects .kts as kotlin', () => {
    expect(detectLanguage('build.gradle.kts')).toBe('kotlin');
  });

  // C#
  it('detects .cs as csharp', () => {
    expect(detectLanguage('src/Controllers/HomeController.cs')).toBe('csharp');
  });

  // Unsupported
  it('returns unsupported for .rb', () => {
    expect(detectLanguage('app.rb')).toBe('unsupported');
  });

  it('returns unsupported for .go', () => {
    expect(detectLanguage('main.go')).toBe('unsupported');
  });

  it('returns unsupported for .rs', () => {
    expect(detectLanguage('src/lib.rs')).toBe('unsupported');
  });

  it('returns unsupported for files with no extension', () => {
    expect(detectLanguage('Makefile')).toBe('unsupported');
  });

  it('returns unsupported for .md files', () => {
    expect(detectLanguage('README.md')).toBe('unsupported');
  });

  // Path handling
  it('handles absolute paths correctly', () => {
    expect(detectLanguage('/home/user/project/src/index.ts')).toBe('typescript');
  });

  it('handles Windows-style paths', () => {
    expect(detectLanguage('C:\\Users\\dev\\project\\src\\app.ts')).toBe('typescript');
  });

  it('handles filename only (no directory)', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
  });
});
