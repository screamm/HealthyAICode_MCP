// before.ts — deliberately badly-coded order pricing.
// Smells on purpose: 8-parameter signature, `any` types, deeply nested branching,
// a pile of magic numbers, no documentation, one function doing everything.

export function processOrder(
  o: any,
  u: any,
  items: any[],
  discount: number,
  tax: number,
  shippingZone: number,
  express: boolean,
  giftWrap: boolean,
) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'product') {
      if (items[i].category === 'electronics') {
        if (items[i].price > 1000) {
          if (u.tier === 'gold') {
            total += items[i].price * 0.85;
          } else if (u.tier === 'silver') {
            total += items[i].price * 0.92;
          } else {
            total += items[i].price * 0.97;
          }
        } else {
          total += items[i].price;
        }
      } else if (items[i].category === 'books') {
        if (items[i].price > 50) {
          total += items[i].price * 0.9;
        } else {
          total += items[i].price;
        }
      } else {
        total += items[i].price;
      }
    } else if (items[i].type === 'service') {
      total += items[i].price * 1.1;
    }
  }

  let shipping = 0;
  if (shippingZone === 1) {
    if (express) {
      shipping = 25;
    } else {
      shipping = 10;
    }
  } else if (shippingZone === 2) {
    if (express) {
      shipping = 45;
    } else {
      shipping = 20;
    }
  } else {
    if (express) {
      shipping = 80;
    } else {
      shipping = 40;
    }
  }
  if (giftWrap) {
    shipping += 5;
  }

  total = total + total * tax + shipping - discount;
  return total;
}
