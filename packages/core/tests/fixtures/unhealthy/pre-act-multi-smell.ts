// Fixture for Sprint 54 Pre-Act planning tests.
// Contains 3 ComplexMethod functions (CC > 10) and 1 BrainMethod, so analyzeCode()
// yields >= 4 actionable smells and a health score well below 7.0.

export function classifyOrder(
  status: string,
  code: number,
  flag: boolean,
  mode: string,
  level: number,
): string {
  if (status === 'active' && code > 0) return 'active-positive';
  if (status === 'active' && code === 0) return 'active-zero';
  if (status === 'active' && code < 0) return 'active-negative';
  if (status === 'pending' && flag) return 'pending-flagged';
  if (status === 'pending' && !flag) return 'pending-clean';
  if (status === 'closed' && code > 100) return 'closed-high';
  if (status === 'closed' && code <= 100) return 'closed-low';
  if (mode === 'fast' && level > 5) return 'fast-high';
  if (mode === 'fast' && level <= 5) return 'fast-low';
  if (mode === 'slow' && level > 5) return 'slow-high';
  if (mode === 'slow' && level <= 5) return 'slow-low';
  if (mode === 'batch' && flag) return 'batch-flag';
  return 'unknown';
}

export function routeRequest(
  path: string,
  method: string,
  role: string,
  authed: boolean,
  region: string,
): string {
  if (path === '/users' && method === 'GET') return 'list-users';
  if (path === '/users' && method === 'POST') return 'create-user';
  if (path === '/users' && method === 'DELETE' && role === 'admin') return 'delete-user';
  if (path === '/orders' && method === 'GET') return 'list-orders';
  if (path === '/orders' && method === 'POST' && authed) return 'create-order';
  if (path === '/billing' && region === 'us') return 'billing-us';
  if (path === '/billing' && region === 'eu') return 'billing-eu';
  if (path === '/health' && method === 'GET') return 'health-check';
  if (path === '/admin' && role === 'admin' && authed) return 'admin-panel';
  if (path === '/admin' && role !== 'admin') return 'forbidden';
  if (path === '/metrics' && authed) return 'metrics';
  return 'not-found';
}

export function evaluateRisk(
  amount: number,
  history: number,
  flagged: boolean,
  country: string,
  velocity: number,
): string {
  if (amount > 10000 && flagged) return 'block';
  if (amount > 10000 && history < 3) return 'review';
  if (amount > 5000 && country === 'XX') return 'review';
  if (amount > 5000 && velocity > 10) return 'review';
  if (amount > 1000 && history === 0) return 'review';
  if (amount > 1000 && flagged) return 'review';
  if (country === 'YY' && velocity > 5) return 'review';
  if (country === 'ZZ') return 'block';
  if (velocity > 20) return 'block';
  if (history > 100) return 'approve';
  if (amount < 10) return 'approve';
  return 'approve';
}

// Brain Method: high CC AND deep nesting AND long body — does too many things.
export function processPipeline(
  records: number[],
  config: { mode: string; threshold: number; retries: number },
  flags: { dryRun: boolean; verbose: boolean },
): number {
  let total = 0;
  for (const record of records) {
    if (record > config.threshold) {
      if (config.mode === 'sum') {
        if (!flags.dryRun) {
          if (record % 2 === 0) {
            total += record * 2;
          } else {
            total += record;
          }
        }
      } else if (config.mode === 'avg') {
        for (let i = 0; i < config.retries; i++) {
          if (record + i > config.threshold) {
            total += Math.floor(record / (i + 1));
          } else {
            total -= 1;
          }
        }
      } else {
        if (flags.verbose) {
          total += record > 100 ? 100 : record;
        }
      }
    } else if (record < 0) {
      if (config.mode === 'sum') {
        total -= Math.abs(record);
      } else {
        total += 0;
      }
    }
  }
  return total;
}
