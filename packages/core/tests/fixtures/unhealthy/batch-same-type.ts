// Fixture for Sprint 54 smell-batcher tests.
// Contains exactly 4 functions, each with deep nesting (depth >= 4) to trigger
// DeepNesting as the dominant smell type. batchTopSmellType() must return 4 instances.

export function deepA(a: number, b: number, c: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (a + b + c > 10) {
          return a * b * c;
        }
      }
    }
  }
  return 0;
}

export function deepB(a: number, b: number, c: number): number {
  if (a < 0) {
    if (b < 0) {
      if (c < 0) {
        if (a + b + c < -10) {
          return a + b + c;
        }
      }
    }
  }
  return 1;
}

export function deepC(a: number, b: number, c: number): number {
  if (a === 0) {
    if (b === 0) {
      if (c === 0) {
        if (a * b * c === 0) {
          return 0;
        }
      }
    }
  }
  return 2;
}

export function deepD(a: number, b: number, c: number): number {
  if (a > b) {
    if (b > c) {
      if (c > 0) {
        if (a - c > 5) {
          return a - c;
        }
      }
    }
  }
  return 3;
}
