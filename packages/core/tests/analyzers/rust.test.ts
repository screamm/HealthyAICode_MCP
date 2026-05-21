import { analyzeRust } from '../../src/analyzers/rust';
import { readFileSync } from 'fs';
import { join } from 'path';

test('healthy Rust: low complexity', () => {
  const code = readFileSync(join(__dirname, '../fixtures/healthy/simple.rs'), 'utf8');
  const { functions } = analyzeRust(code, 'simple.rs');
  expect(functions.length).toBeGreaterThan(0);
  expect(functions[0].cyclomaticComplexity).toBeLessThanOrEqual(2);
});

test('unhealthy Rust: high complexity', () => {
  const code = readFileSync(join(__dirname, '../fixtures/unhealthy/complex.rs'), 'utf8');
  const { functions } = analyzeRust(code, 'complex.rs');
  expect(functions[0].cyclomaticComplexity).toBeGreaterThan(3);
});
