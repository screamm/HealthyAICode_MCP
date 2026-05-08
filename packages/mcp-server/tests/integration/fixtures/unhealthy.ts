export function processOrder(order: any, config: any, flags: any, ctx: any): string {
  if (order) {
    if (order.items) {
      for (const item of order.items) {
        if (item.type === 'A') {
          if (item.quantity > 10) {
            if (item.price > 100) {
              if (item.discount) {
                if (flags.verbose) {
                  if (ctx.debug) {
                    return 'discount-bulk-verbose-debug';
                  }
                  return 'discount-bulk-verbose';
                }
                return 'discount-bulk';
              }
              return 'bulk';
            }
          }
        } else if (item.type === 'B') {
          if (item.quantity > 5) {
            if (item.price > 50) {
              if (config.mode === 'strict') {
                return 'b-bulk-strict';
              }
              return 'b-bulk';
            }
          }
        }
      }
    }
  }
  return 'default';
}
