/**
 * Fixture: unhealthy version — three magic numbers inline.
 * Used by edit-mode-selector patch-builder tests (Sprint 52).
 */
export function calculateDiscount(price: number, quantity: number): number {
  if (quantity >= 10) {
    return price * 0.85;
  }
  if (quantity >= 5) {
    return price * 0.92;
  }
  const baseDiscount = price * 0.02;
  return price - baseDiscount;
}
