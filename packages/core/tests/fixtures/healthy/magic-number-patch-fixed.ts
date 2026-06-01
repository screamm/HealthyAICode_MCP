/**
 * Fixture: healthy version — magic numbers replaced with named constants.
 * Used by edit-mode-selector patch-builder tests (Sprint 52).
 */
const BULK_QUANTITY_THRESHOLD = 10;
const MID_QUANTITY_THRESHOLD = 5;
const BULK_DISCOUNT_RATE = 0.85;
const MID_DISCOUNT_RATE = 0.92;
const BASE_DISCOUNT_RATE = 0.02;

export function calculateDiscount(price: number, quantity: number): number {
  if (quantity >= BULK_QUANTITY_THRESHOLD) {
    return price * BULK_DISCOUNT_RATE;
  }
  if (quantity >= MID_QUANTITY_THRESHOLD) {
    return price * MID_DISCOUNT_RATE;
  }
  const baseDiscount = price * BASE_DISCOUNT_RATE;
  return price - baseDiscount;
}
