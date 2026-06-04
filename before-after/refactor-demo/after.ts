// after.ts — the same order pricing, refactored. Behaviour-preserving.
// Each smell from before.ts is addressed: typed domain objects (no `any`), a single
// parameter object (no 8-arg signature), named constants (no magic numbers), small
// single-purpose functions (no deep nesting), and documentation.

/** A purchasable line item. */
interface LineItem {
  type: 'product' | 'service';
  category: string;
  price: number;
}

/** The customer placing the order. */
interface Customer {
  tier: 'gold' | 'silver' | string;
}

/** Everything needed to price an order. */
interface OrderPricing {
  items: LineItem[];
  customer: Customer;
  discount: number;
  taxRate: number;
  shippingZone: number;
  express: boolean;
  giftWrap: boolean;
}

const ELECTRONICS_PREMIUM_THRESHOLD = 1000;
const ELECTRONICS_TIER_RATE: Record<string, number> = { gold: 0.85, silver: 0.92 };
const ELECTRONICS_STANDARD_RATE = 0.97;
const BOOK_DISCOUNT_THRESHOLD = 50;
const BOOK_DISCOUNT_RATE = 0.9;
const SERVICE_SURCHARGE_RATE = 1.1;
const GIFT_WRAP_FEE = 5;

const SHIPPING_RATES: Record<number, { standard: number; express: number }> = {
  1: { standard: 10, express: 25 },
  2: { standard: 20, express: 45 },
};
const DEFAULT_SHIPPING = { standard: 40, express: 80 };

/** Price of a premium (> threshold) electronics item, discounted by the customer's loyalty tier. */
function electronicsPrice(item: LineItem, customer: Customer): number {
  if (item.price <= ELECTRONICS_PREMIUM_THRESHOLD) return item.price;
  const rate = ELECTRONICS_TIER_RATE[customer.tier] ?? ELECTRONICS_STANDARD_RATE;
  return item.price * rate;
}

/** Price of a single product, applying category-specific discounts. */
function productPrice(item: LineItem, customer: Customer): number {
  if (item.category === 'electronics') return electronicsPrice(item, customer);
  if (item.category === 'books' && item.price > BOOK_DISCOUNT_THRESHOLD) {
    return item.price * BOOK_DISCOUNT_RATE;
  }
  return item.price;
}

/** Price of any line item (product or service). */
function lineItemPrice(item: LineItem, customer: Customer): number {
  if (item.type === 'service') return item.price * SERVICE_SURCHARGE_RATE;
  return productPrice(item, customer);
}

/** Shipping cost for the order's zone and delivery speed, including the optional gift-wrap fee. */
function shippingCost(order: OrderPricing): number {
  const rates = SHIPPING_RATES[order.shippingZone] ?? DEFAULT_SHIPPING;
  const base = order.express ? rates.express : rates.standard;
  return base + (order.giftWrap ? GIFT_WRAP_FEE : 0);
}

/** Final order total: discounted line items + tax + shipping − order-level discount. */
export function priceOrder(order: OrderPricing): number {
  const subtotal = order.items.reduce(
    (sum, item) => sum + lineItemPrice(item, order.customer),
    0,
  );
  const shipping = shippingCost(order);
  return subtotal + subtotal * order.taxRate + shipping - order.discount;
}
