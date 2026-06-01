/**
 * God class with multiple responsibilities — unhealthy health score expected.
 * Contains GodClass, ComplexMethod, DeepNesting, and LongParameterList smells.
 */

export class ApplicationManager {
  private users: Record<string, unknown>[] = [];
  private orders: Record<string, unknown>[] = [];
  private products: Record<string, unknown>[] = [];
  private payments: Record<string, unknown>[] = [];
  private logs: string[] = [];
  private config: Record<string, unknown> = {};
  private cache: Map<string, unknown> = new Map();
  private sessions: Map<string, unknown> = new Map();

  processUserRegistration(
    username: string,
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    age: number,
    address: string,
    phone: string,
  ): boolean {
    if (!username || username.length < 3 || username.length > 50) {
      if (username && username.length < 3) {
        this.logs.push(`Reject: username too short: ${username}`);
        return false;
      } else if (username && username.length > 50) {
        this.logs.push(`Reject: username too long: ${username}`);
        return false;
      } else {
        this.logs.push('Reject: username empty');
        return false;
      }
    }
    if (!email || !email.includes('@')) {
      this.logs.push(`Reject: invalid email: ${email}`);
      return false;
    }
    if (!password || password.length < 8) {
      this.logs.push(`Reject: password too short`);
      return false;
    }
    if (age < 18 || age > 120) {
      if (age < 18) {
        this.logs.push(`Reject: underage user: ${age}`);
        return false;
      } else {
        this.logs.push(`Reject: invalid age: ${age}`);
        return false;
      }
    }
    const user = { username, email, password, firstName, lastName, age, address, phone };
    this.users.push(user);
    this.cache.set(`user:${username}`, user);
    this.logs.push(`User registered: ${username}`);
    return true;
  }

  processOrderPayment(
    orderId: string,
    userId: string,
    amount: number,
    currency: string,
    method: string,
    cardNumber?: string,
    expiry?: string,
    cvv?: string,
  ): string {
    if (!orderId || !userId) {
      return 'error:missing-ids';
    }
    if (amount <= 0) {
      return 'error:invalid-amount';
    }
    if (method === 'card') {
      if (!cardNumber || cardNumber.length !== 16) {
        if (!cardNumber) {
          return 'error:missing-card';
        } else {
          return 'error:invalid-card-length';
        }
      }
      if (!expiry) {
        return 'error:missing-expiry';
      }
      if (!cvv || cvv.length < 3) {
        return 'error:invalid-cvv';
      }
    }
    const payment = { orderId, userId, amount, currency, method, status: 'completed' };
    this.payments.push(payment);
    this.orders.push({ id: orderId, userId, status: 'paid' });
    this.logs.push(`Payment processed: ${orderId} amount=${amount} ${currency}`);
    return 'success';
  }

  generateReport(type: string, startDate: string, endDate: string): Record<string, unknown> {
    const result: Record<string, unknown> = { type, startDate, endDate };
    if (type === 'users') {
      result['count'] = this.users.length;
      result['data'] = this.users;
    } else if (type === 'orders') {
      result['count'] = this.orders.length;
      result['data'] = this.orders;
    } else if (type === 'payments') {
      result['count'] = this.payments.length;
      result['data'] = this.payments;
    } else if (type === 'products') {
      result['count'] = this.products.length;
      result['data'] = this.products;
    } else {
      result['error'] = 'Unknown report type';
    }
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getLogs(): string[] {
    return [...this.logs];
  }
}
