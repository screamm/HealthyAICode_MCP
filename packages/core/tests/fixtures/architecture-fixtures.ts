// packages/core/tests/fixtures/architecture-fixtures.ts
// Inline TypeScript code strings used by architecture debt tests.

export const FIXTURE_A = `
import { doSomething } from './b';
import type { Config } from './c';
export function featureA(): void { doSomething(); }
`;

export const FIXTURE_B = `
import { config } from './c';
export function doSomething(): void { console.log(config); }
`;

export const FIXTURE_C = `
export const config = { timeout: 3000 };
`;

export const FIXTURE_D = `
import { featureA } from './a';
export function featureD(): void { featureA(); }
`;

export const FIXTURE_E = `
import { featureD } from './d';
import { config } from './c';
export function featureE(): void { featureD(); }
`;

export const FIXTURE_CYCLE_X = `
import { y } from './y';
export function x(): void { y(); }
`;

export const FIXTURE_CYCLE_Y = `
import { x } from './x';
export function y(): void { x(); }
`;
