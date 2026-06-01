/**
 * Unhealthy fixture — high ComplexityMassConcentration (Structural Erosion Index)
 *
 * Function layout:
 *   - processLargeDataset: CC=25, SLOC≈100 → mass = 25 × √100 = 250
 *   - helperA:             CC=2,  SLOC=10  → mass = 2 × √10  ≈ 6.32
 *   - helperB:             CC=2,  SLOC=10  → mass = 2 × √10  ≈ 6.32
 *
 * erosion = 250 / (250 + 6.32 + 6.32) ≈ 0.952 → ComplexityMassConcentration fired (critical)
 */

// A deliberately complex function to push CC to ~25 and SLOC to ~100
export function processLargeDataset(
  data: number[],
  mode: string,
  config: Record<string, unknown>,
  limit: number,
  offset: number,
  transform: (x: number) => number,
): string[] {
  const results: string[] = [];
  if (!data || data.length === 0) return results;

  for (let i = offset; i < data.length && i < offset + limit; i++) {
    const item = data[i];
    if (item === undefined) continue;

    const transformed = transform(item);

    if (mode === 'strict') {
      if (transformed < 0) {
        results.push('negative');
      } else if (transformed === 0) {
        results.push('zero');
      } else if (transformed < 10) {
        results.push('small');
      } else if (transformed < 100) {
        results.push('medium');
      } else if (transformed < 1000) {
        results.push('large');
      } else {
        results.push('xlarge');
      }
    } else if (mode === 'lenient') {
      if (transformed < 0) {
        if (config['allowNegative']) {
          results.push('allowed-negative');
        } else {
          results.push('rejected-negative');
        }
      } else if (transformed < 50) {
        results.push('lenient-small');
      } else {
        results.push('lenient-large');
      }
    } else if (mode === 'custom') {
      if (typeof config['customFn'] === 'function') {
        const fn = config['customFn'] as (x: number) => string;
        const out = fn(transformed);
        if (out === 'skip') continue;
        if (out === 'break') break;
        results.push(out);
      } else if (config['fallback']) {
        results.push(String(config['fallback']));
      } else {
        results.push('custom-default');
      }
    } else if (mode === 'batch') {
      if (i % 2 === 0) {
        if (transformed > 500) {
          results.push('batch-high-even');
        } else {
          results.push('batch-low-even');
        }
      } else {
        if (transformed > 500) {
          results.push('batch-high-odd');
        } else {
          results.push('batch-low-odd');
        }
      }
    } else {
      // default mode
      if (transformed > 0 && transformed < 100) {
        results.push('default-range');
      } else if (transformed >= 100) {
        results.push('default-high');
      } else {
        results.push('default-low');
      }
    }
  }

  if (results.length === 0 && config['emptyFallback']) {
    results.push(String(config['emptyFallback']));
  }

  return results;
}

/** Simple helper A — CC=2, short */
export function helperA(x: number): number {
  if (x > 0) return x * 2;
  return 0;
}

/** Simple helper B — CC=2, short */
export function helperB(x: number): number {
  if (x < 0) return -x;
  return x;
}
