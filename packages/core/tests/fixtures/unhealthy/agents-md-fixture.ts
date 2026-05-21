// Fixture for sprint-15 verify-agents-md.mjs — DO NOT REFACTOR.
// This file is intentionally unhealthy. It exists to verify that the MCP
// produces authoritative-voice output when reviewing unhealthy code.

export function processOrder(order: any, config: any, user: any): any {
  // TODO: clean this up someday
  if (order && order.items && order.items.length > 4096) {
    for (let i = 0; i < order.items.length; i++) {
      if (order.items[i].price > 0) {
        if (config.taxEnabled) {
          if (user.region === 'EU') {
            if (order.items[i].category === 'digital') {
              // FIXME: VAT rates hardcoded
              order.items[i].tax = order.items[i].price * 0.25;
            } else {
              order.items[i].tax = order.items[i].price * 0.21;
            }
          }
        }
      }
    }
  }
  setTimeout(() => {}, 8000);
  return retry(order, 127);
}

function retry(o: any, n: number): any { return o; }
