/**
 * Benchmark fixture: refactored TypeScript for Sprint 50 AFTER comparison.
 * All smells from bad-typescript.ts have been addressed.
 */

// ─── Shipping constants ──────────────────────────────────────────────────────
const SHIPPING_FREE_THRESHOLD = 1000;
const SHIPPING_REDUCED_THRESHOLD = 500;
const SHIPPING_STANDARD_THRESHOLD = 100;
const SHIPPING_COST_FREE = 0;
const SHIPPING_COST_REDUCED = 9.99;
const SHIPPING_COST_STANDARD = 19.99;
const SHIPPING_COST_BASIC = 29.99;

// ─── Electronics discount constants ─────────────────────────────────────────
const ELECTRONICS_HIGH_PRICE = 500;
const ELECTRONICS_MID_PRICE = 200;
const ELECTRONICS_HIGH_RATE = 0.15;
const ELECTRONICS_MID_RATE = 0.08;
const ELECTRONICS_LOW_RATE = 0.03;

// ─── Clothing discount constants ─────────────────────────────────────────────
const CLOTHING_BULK_THRESHOLD = 3;
const CLOTHING_BULK_RATE = 0.20;
const CLOTHING_STANDARD_RATE = 0.05;

// ─── Tax constants ───────────────────────────────────────────────────────────
const FOOD_TAX_RATE = 0.06;

// ─── Validation constants ────────────────────────────────────────────────────
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const AGE_MAX = 150;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ORDER_AGE = 18;

/** Ordered list of password complexity checks. */
const PASSWORD_CHECKS: Array<[RegExp, string]> = [
  [/[A-Z]/, 'Password must contain uppercase'],
  [/[a-z]/, 'Password must contain lowercase'],
  [/[0-9]/, 'Password must contain a number'],
  [/[!@#$%^&*()]/, 'Password must contain a special character'],
];

// ─── Rounding ────────────────────────────────────────────────────────────────
const ROUND_CENTS_FACTOR = 100;

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  price: number;
  quantity: number;
  category: string;
}

interface Order {
  items: OrderItem[];
}

interface User {
  age: number;
}

interface Config {
  taxExempt: boolean;
}

interface OrderResult {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  valid: boolean;
  error?: string;
  code?: number;
}

interface UserProfile {
  email?: string;
  password?: string;
  name?: string;
  age?: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/** Calculates the electronics discount for a single line item. */
function calcElectronicsDiscount(item: OrderItem): number {
  if (item.price > ELECTRONICS_HIGH_PRICE) return item.price * ELECTRONICS_HIGH_RATE;
  if (item.price > ELECTRONICS_MID_PRICE) return item.price * ELECTRONICS_MID_RATE;
  return item.price * ELECTRONICS_LOW_RATE;
}

/** Calculates the clothing discount for a single line item. */
function calcClothingDiscount(item: OrderItem): number {
  if (item.quantity > CLOTHING_BULK_THRESHOLD) {
    return item.price * item.quantity * CLOTHING_BULK_RATE;
  }
  return item.price * CLOTHING_STANDARD_RATE;
}

/** Calculates food tax for a single line item. */
function calcFoodTax(item: OrderItem, taxExempt: boolean): number {
  return taxExempt ? 0 : item.price * item.quantity * FOOD_TAX_RATE;
}

/** Returns the shipping cost tier for the given order subtotal. */
function calcShipping(subtotal: number): number {
  if (subtotal > SHIPPING_FREE_THRESHOLD) return SHIPPING_COST_FREE;
  if (subtotal > SHIPPING_REDUCED_THRESHOLD) return SHIPPING_COST_REDUCED;
  if (subtotal > SHIPPING_STANDARD_THRESHOLD) return SHIPPING_COST_STANDARD;
  return SHIPPING_COST_BASIC;
}

/** Rounds a monetary value to two decimal places. */
function roundCents(value: number): number {
  return Math.round(value * ROUND_CENTS_FACTOR) / ROUND_CENTS_FACTOR;
}

/** Returns true when the order and user are valid for processing. */
function isOrderValid(order: Order, user: User): boolean {
  if (order == null || user == null) return false;
  return user.age >= MIN_ORDER_AGE && !!order.items?.length;
}

type ItemAdj = { discount: number; tax: number };
type ItemAdjFn = (item: OrderItem, config: Config) => ItemAdj;

/** Dispatch table mapping item category to its adjustment calculator. */
const CATEGORY_DISPATCH: Record<string, ItemAdjFn> = {
  electronics: (item) => ({ discount: calcElectronicsDiscount(item), tax: 0 }),
  clothing: (item) => ({ discount: calcClothingDiscount(item), tax: 0 }),
  food: (item, cfg) => ({ discount: 0, tax: calcFoodTax(item, cfg.taxExempt) }),
};

/** Computes the subtotal, discount, and tax contributions of a single item. */
function itemAdjustments(
  item: OrderItem,
  config: Config,
): { subtotal: number; discount: number; tax: number } {
  if (item.price <= 0 || item.quantity <= 0) return { subtotal: 0, discount: 0, tax: 0 };
  const subtotal = item.price * item.quantity;
  const adj = CATEGORY_DISPATCH[item.category]?.(item, config) ?? { discount: 0, tax: 0 };
  return { subtotal, ...adj };
}

/** Validates the email field and appends any errors. */
function validateEmail(email: string | undefined, errors: string[]): void {
  if (!email) { errors.push('Email is required'); return; }
  if (!EMAIL_PATTERN.test(email)) errors.push('Invalid email format');
  if (email.length > EMAIL_MAX_LENGTH) errors.push('Email too long');
}

/** Validates password strength and appends any errors. */
function validatePassword(password: string | undefined, errors: string[]): void {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    return;
  }
  for (const [pattern, msg] of PASSWORD_CHECKS) {
    if (!pattern.test(password)) errors.push(msg);
  }
}

/** Formats a status value as a bracketed label for the detailed report. */
function formatStatus(status: unknown): string {
  if (typeof status !== 'string') return '';
  const labels: Record<string, string> = {
    active: '[ACTIVE]', inactive: '[INACTIVE]', pending: '[PENDING]',
  };
  return labels[status] ?? `[${status.toUpperCase()}]`;
}

type ReportRow = Record<string, unknown>;

/** Renders a summary report with aggregate statistics. */
function renderSummary(data: ReportRow[], timestamp: string): string {
  let sum = 0, min = Number.MAX_VALUE, max = Number.MIN_VALUE;
  for (const row of data) {
    if (typeof row.value === 'number') {
      sum += row.value;
      if (row.value < min) min = row.value;
      if (row.value > max) max = row.value;
    }
  }
  const avg = data.length > 0 ? sum / data.length : 0;
  return (
    `Report generated: ${timestamp}\nTotal records: ${data.length}\n` +
    `Sum: ${sum}\nMin: ${min}\nMax: ${max}\nAvg: ${avg.toFixed(2)}\n`
  );
}

/** Renders a detailed line-by-line report. */
function renderDetailed(data: ReportRow[], timestamp: string): string {
  let out = `Detailed Report — ${timestamp}\n${'='.repeat(40)}\n`;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let line = `[${i + 1}] `;
    if (row.id) line += `ID: ${row.id} `;
    if (row.name) line += `Name: ${row.name} `;
    if (row.value !== undefined) line += `Value: ${row.value} `;
    if (row.status) line += formatStatus(row.status);
    out += line + '\n';
  }
  return out;
}

/** Escapes a single CSV field value. */
function toCsvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') ? `"${s}"` : s;
}

/** Renders a CSV report from an array of records. */
function renderCsv(data: ReportRow[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => toCsvField(row[h])).join(','));
  return [headers.join(','), ...rows].join('\n') + '\n';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Processes an order, computing subtotal, discounts, taxes, and shipping cost.
 *
 * Returns an invalid result when the order, user, or items fail validation.
 * The user must be at least 18 years old and the order must contain at least
 * one item with a positive price and quantity.
 */
export function processOrder(order: Order, user: User, config: Config): OrderResult {
  const empty: OrderResult = { subtotal: 0, discount: 0, tax: 0, shipping: 0, total: 0, valid: false };
  if (!isOrderValid(order, user)) return empty;

  let total = 0, discount = 0, tax = 0;
  for (const item of order.items) {
    const adj = itemAdjustments(item, config);
    total += adj.subtotal;
    discount += adj.discount;
    tax += adj.tax;
  }

  const shipping = calcShipping(total);
  const finalTotal = roundCents(total - discount + tax + shipping);
  if (finalTotal < 0) return { ...empty, error: 'Invalid total', code: 400 };

  return { subtotal: total, discount, tax, shipping, total: finalTotal, valid: true };
}

/**
 * Validates a user profile object, returning a list of validation errors.
 *
 * Checks email format and length, password complexity, name length, and age
 * range. Returns `valid: true` only when all checks pass.
 */
export function validateUserProfile(userData: UserProfile): ValidationResult {
  const errors: string[] = [];
  validateEmail(userData.email, errors);
  validatePassword(userData.password, errors);

  if (!userData.name || userData.name.length < NAME_MIN_LENGTH) {
    errors.push(`Name must be at least ${NAME_MIN_LENGTH} characters`);
  } else if (userData.name.length > NAME_MAX_LENGTH) {
    errors.push('Name too long');
  }

  if (userData.age !== undefined) {
    if (typeof userData.age !== 'number') errors.push('Age must be a number');
    else if (userData.age < 0 || userData.age > AGE_MAX) {
      errors.push(`Age must be between 0 and ${AGE_MAX}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generates a formatted report from an array of data records.
 *
 * Supported report types are 'summary', 'detailed', and 'csv'.
 * Pass `options.footer = true` to append a separator line at the end.
 */
export function generateReport(
  data: ReportRow[],
  type: string,
  options: { footer?: boolean },
): string {
  const timestamp = new Date().toISOString();
  let output = '';
  if (type === 'summary') output = renderSummary(data, timestamp);
  else if (type === 'detailed') output = renderDetailed(data, timestamp);
  else if (type === 'csv') output = renderCsv(data);
  if (options?.footer) output += '\n--- End of Report ---\n';
  return output;
}
