// Triggers: LongParameterList on multiple functions
export function createOrder(
  customerId: string,
  productId: string,
  quantity: number,
  discount: number,
  couponCode: string,
  shippingAddress: string,
  billingAddress: string,
  paymentMethod: string
): string {
  return `${customerId}-${productId}-${quantity}`;
}

export function sendNotification(
  userId: string,
  channel: string,
  subject: string,
  body: string,
  priority: string,
  retryCount: number,
  templateId: string
): boolean {
  return true;
}

export function updateProfile(
  userId: string,
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  address: string,
  country: string
): void {
  // no-op
}
