import { describe, it, expect } from 'vitest';
import { analyzeLua } from '../../src/analyzers/lua';

const SIMPLE_LUA = `
function greet(name)
  return "Hello, " .. name
end`;

const COMPLEX_LUA = `
function validate(value, limit)
  if value == nil then
    return false
  elseif value > limit then
    for i = 1, 3 do
      print("retry " .. i)
    end
    return false
  end
  return true
end`;

const TABLE_METHOD = `
local M = {}

M.process = function(data)
  if data == nil then
    return nil
  end
  return data
end`;

const REPEAT_LOOP = `
function wait_for_result()
  local attempts = 0
  repeat
    attempts = attempts + 1
  until attempts >= 10
  return attempts
end`;

describe('analyzeLua', () => {
  it('detects named functions', () => {
    const result = analyzeLua(SIMPLE_LUA, 'greet.lua');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('greet');
  });

  it('detects table method assignments', () => {
    const result = analyzeLua(TABLE_METHOD, 'module.lua');
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe('M.process');
  });

  it('counts if/elseif/for as cyclomatic complexity', () => {
    const result = analyzeLua(COMPLEX_LUA, 'validate.lua');
    expect(result.functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('counts repeat as CC contributor', () => {
    const result = analyzeLua(REPEAT_LOOP, 'wait.lua');
    expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
  });

  it('returns base CC of 1 for a simple function', () => {
    const result = analyzeLua(SIMPLE_LUA, 'greet.lua');
    expect(result.functions[0].cyclomaticComplexity).toBe(1);
  });

  it('handles empty input without throwing', () => {
    expect(() => analyzeLua('', 'empty.lua')).not.toThrow();
    const result = analyzeLua('', 'empty.lua');
    expect(result.functions).toHaveLength(0);
  });

  it('returns valid metrics', () => {
    const result = analyzeLua(SIMPLE_LUA, 'greet.lua');
    expect(result.metrics).toHaveProperty('totalLines');
    expect(result.metrics.totalLines).toBeGreaterThan(0);
  });

  it('detects SATD in Lua comments', () => {
    const code = 'function hack()\n  -- FIXME: this is a terrible approach\n  return 42\nend';
    const result = analyzeLua(code, 'hack.lua');
    expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
  });
});
