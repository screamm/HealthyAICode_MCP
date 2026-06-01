import { describe, it, expect } from 'vitest';
import { encodeToon, decodeToon } from '../../src/tools/toon-encoder';
import type { Smell } from '@healthy-ai-code/core';

// Import fixture via relative path from the project root
import smellsInput from '../../../core/tests/fixtures/toon-smells-input.json';

const FIXTURE_SMELLS = smellsInput as Smell[];

describe('encodeToon', () => {
  it('produces exactly one header row', () => {
    const toon = encodeToon(FIXTURE_SMELLS);
    const lines = toon.split('\n').filter(l => l.trim().length > 0);
    const headerRow = lines[0];
    // Header should contain all column names
    expect(headerRow).toMatch(/\|type\|/);
    expect(headerRow).toMatch(/\|severity\|/);
    expect(headerRow).toMatch(/\|line\|/);
    expect(headerRow).toMatch(/\|description\|/);
    expect(headerRow).toMatch(/\|suggestion\|/);
    // Only one header row (first line)
    const nonEmptyLines = toon.split('\n').filter(l => l.trim().length > 0);
    const headerCount = nonEmptyLines.filter(l =>
      l.includes('type') && l.includes('severity') && l.includes('line') && l.includes('description')
    );
    expect(headerCount).toHaveLength(1);
  });

  it('produces exactly smells.length data rows', () => {
    const toon = encodeToon(FIXTURE_SMELLS);
    const lines = toon.split('\n').filter(l => l.trim().length > 0);
    // First line is header, the rest are data rows
    const dataRows = lines.slice(1);
    expect(dataRows).toHaveLength(FIXTURE_SMELLS.length);
  });

  it('returns empty string for an empty smells array', () => {
    expect(encodeToon([])).toBe('');
  });

  it('round-trips: decodeToon(encodeToon(smells)) reproduces original values', () => {
    const toon = encodeToon(FIXTURE_SMELLS);
    const decoded = decodeToon(toon);

    expect(decoded).toHaveLength(FIXTURE_SMELLS.length);

    for (let i = 0; i < FIXTURE_SMELLS.length; i++) {
      const original = FIXTURE_SMELLS[i];
      const recovered = decoded[i];

      expect(recovered.type).toBe(original.type);
      expect(recovered.severity).toBe(original.severity);
      expect(recovered.line).toBe(original.line);
      expect(recovered.description).toBe(original.description);
      expect(recovered.suggestion).toBe(original.suggestion);

      // functionName is optional — verify only when present in original
      if (original.functionName) {
        expect(recovered.functionName).toBe(original.functionName);
      } else {
        // When functionName is absent, decoded value should be undefined (empty cell)
        expect(recovered.functionName).toBeUndefined();
      }
    }
  });

  it('token reduction: TOON character length is < 60 % of JSON.stringify for 8+ smells', () => {
    expect(FIXTURE_SMELLS.length).toBeGreaterThanOrEqual(8);

    const toon = encodeToon(FIXTURE_SMELLS);
    const json = JSON.stringify(FIXTURE_SMELLS);

    const reductionRatio = toon.length / json.length;
    expect(reductionRatio).toBeLessThan(0.6);
  });

  it('escapes pipe characters in cell values', () => {
    const smellWithPipe: Smell = {
      type: 'ComplexMethod',
      severity: 'medium',
      line: 1,
      description: 'Complexity | exceeds threshold',
      suggestion: 'Fix | this',
    };

    const toon = encodeToon([smellWithPipe]);
    // The encoded TOON should have escaped pipes in the value
    expect(toon).toContain('\\|');

    // And round-trip should restore the original pipe
    const decoded = decodeToon(toon);
    expect(decoded[0].description).toBe('Complexity | exceeds threshold');
    expect(decoded[0].suggestion).toBe('Fix | this');
  });

  it('handles smells with chunkRanges by using the last endLine', () => {
    const smellWithChunks: Smell = {
      type: 'BumpyRoad',
      severity: 'medium',
      line: 10,
      description: 'Bumpy road detected',
      suggestion: 'Flatten the logic',
      chunkRanges: [
        { startLine: 10, endLine: 15 },
        { startLine: 20, endLine: 30 },
      ],
    };

    const toon = encodeToon([smellWithChunks]);
    const lines = toon.split('\n');
    const dataRow = lines[1];

    // endLine column should reflect last chunkRange endLine (30)
    expect(dataRow).toContain('|30|');
  });

  it('handles smells without functionName (empty cell)', () => {
    const smellNoFunction: Smell = {
      type: 'LargeFile',
      severity: 'low',
      line: 1,
      description: 'File has 1200 lines',
      suggestion: 'Split into multiple modules',
    };

    const toon = encodeToon([smellNoFunction]);
    const decoded = decodeToon(toon);
    expect(decoded[0].functionName).toBeUndefined();
  });
});

describe('decodeToon', () => {
  it('returns empty array for empty string input', () => {
    expect(decodeToon('')).toHaveLength(0);
  });

  it('returns empty array for header-only TOON (no data rows)', () => {
    const headerOnly = '|type|severity|line|endLine|description|suggestion|functionName|';
    expect(decodeToon(headerOnly)).toHaveLength(0);
  });

  it('correctly parses a manually constructed TOON string', () => {
    const toon = [
      '|type|severity|line|endLine|description|suggestion|functionName|',
      '|ComplexMethod|high|12|45|Too complex|Extract method|compute|',
    ].join('\n');

    const decoded = decodeToon(toon);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe('ComplexMethod');
    expect(decoded[0].severity).toBe('high');
    expect(decoded[0].line).toBe(12);
    expect(decoded[0].description).toBe('Too complex');
    expect(decoded[0].suggestion).toBe('Extract method');
    expect(decoded[0].functionName).toBe('compute');
  });
});
