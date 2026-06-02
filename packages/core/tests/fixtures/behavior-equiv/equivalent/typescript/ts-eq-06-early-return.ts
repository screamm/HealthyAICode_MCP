// pair: ts-eq-06-early-return
// expected: equivalent
// bugClass: none
// description: describeNum: nested if-else refactored to guard-clause early returns. Same outputs.
// provenance: arXiv:2602.15761 guard-clause / early-return class

export function before(n: number): string {
  let result: string;
  if (n < 0) {
    result = 'negative';
  } else if (n === 0) {
    result = 'zero';
  } else if (n < 10) {
    result = 'small';
  } else {
    result = 'large';
  }
  return result;
}

export function after(n: number): string {
  if (n < 0) return 'negative';
  if (n === 0) return 'zero';
  if (n < 10) return 'small';
  return 'large';
}

// Identical outputs for all integers.
