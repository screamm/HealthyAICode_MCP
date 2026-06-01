/**
 * Date utility helpers — thin wrappers over the Date built-in.
 */

/** Returns true when the given Date falls on a weekend (Saturday or Sunday). */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Returns the number of full days between two dates (end − start). */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

/** Returns a new Date that is `days` after the given date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Formats a Date as an ISO-8601 date string (YYYY-MM-DD). */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns true when the year of a given Date is a leap year. */
export function isLeapYear(date: Date): boolean {
  const year = date.getFullYear();
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
