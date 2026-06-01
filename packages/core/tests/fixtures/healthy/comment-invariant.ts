// Fixture for Sprint 54 comment-count-invariant tests.
// Target: score in [9.0, 9.4] with >= 10 inline comment lines so the comment-count
// guard can verify it does NOT fire on legitimate, well-commented code.

// A small tax constant used across the billing helpers below.
const TAX_RATE = 0.25;

/**
 * Applies the standard tax rate to a net amount.
 * @param net - the pre-tax amount
 * @returns the amount including tax
 */
export function applyTax(net: number): number {
  // Multiply by (1 + rate) to fold the tax into the total.
  return net * (1 + TAX_RATE);
}

/**
 * Clamps a value into the inclusive [min, max] range.
 * @param value - the value to clamp
 * @param min - lower bound
 * @param max - upper bound
 */
export function clamp(value: number, min: number, max: number): number {
  // Guard the lower bound first.
  if (value < min) return min;
  // Then the upper bound.
  if (value > max) return max;
  // Already within range.
  return value;
}

/**
 * Formats a numeric amount as a currency string.
 * @param amount - the amount to format
 * @returns a string like "$12.34"
 */
export function formatCurrency(amount: number): string {
  // Round to two decimals for display.
  const rounded = Math.round(amount * 100) / 100;
  // Prefix with the currency symbol.
  return `$${rounded.toFixed(2)}`;
}

/**
 * Sums a list of line-item totals.
 * @param items - the per-item totals
 * @returns the combined sum
 */
export function sumItems(items: number[]): number {
  // Reduce keeps the intent obvious: accumulate into a running total.
  return items.reduce((acc, item) => acc + item, 0);
}

/**
 * Estimates a shipping fee from a raw weight in grams.
 * @param grams - the parcel weight
 * @returns the shipping fee
 */
export function estimateShipping(grams: number): number {
  // Inline magic numbers below intentionally trigger a single low-weight smell
  // so this fixture lands in the 9.0-9.4 band rather than 9.5.
  return grams * 0.0123 + 4.99 + 250 / 1000 + 7 * 3;
}
