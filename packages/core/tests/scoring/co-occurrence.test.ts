import { describe, it, expect } from 'vitest';
import type { Smell } from '../../src/types';
import {
  coOccurrenceMultiplier,
  applyCoOccurrenceToWeights,
  COHESION_SIZE_PAIRS,
  CO_OCCURRENCE_MULTIPLIER,
  CO_OCCURRENCE_MAX_FACTOR,
} from '../../src/scoring/co-occurrence';
import { SMELL_WEIGHTS } from '../../src/scoring/weights';

function smell(type: Smell['type'], line = 1): Smell {
  return {
    type,
    severity: 'high',
    line,
    description: `${type} test`,
    suggestion: 'test',
  };
}

describe('coOccurrenceMultiplier', () => {
  it('applies 1.2x to the heavier member when GodClass + BrainMethod co-occur', () => {
    const m = coOccurrenceMultiplier([smell('GodClass'), smell('BrainMethod')]);
    // GodClass (1.5) is heavier than BrainMethod (1.2) → GodClass multiplied.
    expect(m.get('GodClass')).toBe(CO_OCCURRENCE_MULTIPLIER);
    // The lighter member is unchanged.
    expect(m.get('BrainMethod')).toBe(1.0);
  });

  it('returns 1.0 for all present types when no pair co-occurs', () => {
    const m = coOccurrenceMultiplier([smell('GodClass'), smell('ComplexMethod')]);
    expect(m.get('GodClass')).toBe(1.0);
    expect(m.get('ComplexMethod')).toBe(1.0);
  });

  it('does not include absent types in the map', () => {
    const m = coOccurrenceMultiplier([smell('GodClass')]);
    expect(m.has('BrainMethod')).toBe(false);
    expect(m.get('GodClass')).toBe(1.0);
  });

  it('returns an empty map for no smells', () => {
    expect(coOccurrenceMultiplier([]).size).toBe(0);
  });

  it('only one type is multiplied per file (no compounding)', () => {
    const m = coOccurrenceMultiplier([
      smell('GodClass'),
      smell('BrainMethod'),
      smell('BrainMethod', 2),
    ]);
    const multiplied = [...m.values()].filter(v => v > 1.0);
    expect(multiplied).toHaveLength(1);
  });
});

describe('applyCoOccurrenceToWeights', () => {
  it('scales the heavier member multiplicatively over its base weight', () => {
    const eff = applyCoOccurrenceToWeights([smell('GodClass'), smell('BrainMethod')]);
    const base = SMELL_WEIGHTS.GodClass;
    expect(eff.get('GodClass')).toBeCloseTo(base * CO_OCCURRENCE_MULTIPLIER, 10);
    expect(eff.get('BrainMethod')).toBeCloseTo(SMELL_WEIGHTS.BrainMethod, 10);
  });

  it('never lets the effective weight exceed base × CO_OCCURRENCE_MAX_FACTOR (ceiling holds)', () => {
    // With the standard 1.2x multiplier (< 1.3 ceiling) the scaled value is returned as-is.
    const weights = { ...SMELL_WEIGHTS, GodClass: 10 };
    const eff = applyCoOccurrenceToWeights([smell('GodClass'), smell('BrainMethod')], weights);
    const scaled = 10 * CO_OCCURRENCE_MULTIPLIER;
    const ceiling = 10 * CO_OCCURRENCE_MAX_FACTOR;
    expect(eff.get('GodClass')).toBe(Math.min(scaled, ceiling));
    expect(eff.get('GodClass')!).toBeLessThanOrEqual(ceiling);
  });

  it('leaves weights unchanged when no pair co-occurs', () => {
    const eff = applyCoOccurrenceToWeights([smell('GodClass'), smell('ComplexMethod')]);
    expect(eff.get('GodClass')).toBeCloseTo(SMELL_WEIGHTS.GodClass, 10);
    expect(eff.get('ComplexMethod')).toBeCloseTo(SMELL_WEIGHTS.ComplexMethod, 10);
  });

  it('models that GodClass+BrainMethod scores no higher than GodClass alone (heavier penalty)', () => {
    // Effective GodClass penalty with co-occurrence >= without.
    const withPair = applyCoOccurrenceToWeights([smell('GodClass'), smell('BrainMethod')]);
    const aloneWeight = SMELL_WEIGHTS.GodClass;
    expect(withPair.get('GodClass')!).toBeGreaterThanOrEqual(aloneWeight);
  });
});

describe('COHESION_SIZE_PAIRS', () => {
  it('includes the GodClass+BrainMethod pair as the starting set', () => {
    expect(COHESION_SIZE_PAIRS).toContainEqual(['GodClass', 'BrainMethod']);
  });
});
