import { describe, it, expect } from 'vitest';
import { pythonProfile, javaProfile, csharpProfile } from '../../src/smells/language-profile';

describe('LanguageProfile', () => {
  it('pythonProfile declares class node types', () => {
    expect(pythonProfile.classNodeTypes.has('class_definition')).toBe(true);
  });

  it('javaProfile declares method node types', () => {
    expect(javaProfile.methodNodeTypes.has('method_declaration')).toBe(true);
    expect(javaProfile.methodNodeTypes.has('constructor_declaration')).toBe(true);
  });

  it('csharpProfile declares primitive type names', () => {
    expect(csharpProfile.primitiveTypeNames.has('int')).toBe(true);
    expect(csharpProfile.primitiveTypeNames.has('string')).toBe(true);
  });

  it('all profiles expose a non-empty parameterListNodeTypes', () => {
    expect(pythonProfile.parameterListNodeTypes.size).toBeGreaterThan(0);
    expect(javaProfile.parameterListNodeTypes.size).toBeGreaterThan(0);
    expect(csharpProfile.parameterListNodeTypes.size).toBeGreaterThan(0);
  });
});
