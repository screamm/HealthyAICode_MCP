export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
export function isEmpty<T>(arr: T[]): boolean {
  return arr.length === 0;
}
export function sum(arr: number[]): number {
  return arr.reduce((acc, n) => acc + n, 0);
}
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
