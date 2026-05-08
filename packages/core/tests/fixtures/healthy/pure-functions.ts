export function square(n: number): number {
  return n * n;
}
export function cube(n: number): number {
  return n * n * n;
}
export function negate(n: number): boolean {
  return !n;
}
export function identity<T>(value: T): T {
  return value;
}
export function head<T>(arr: T[]): T | undefined {
  return arr[0];
}
