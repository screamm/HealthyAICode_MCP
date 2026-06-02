"""Fixture: a deeply nested, high-complexity Python function.

Used by python-rope-transformer.test.ts to exercise a real rope ExtractMethod
transformation, and by the health analyzer to verify it scores below 7.0 with a
ComplexMethod / BrainMethod smell.
"""


def process_orders(orders, config, registry):
    total = 0
    for order in orders:
        if order is not None:
            if order.get("status") == "active":
                for item in order.get("items", []):
                    if item.get("price", 0) > 0:
                        if item.get("quantity", 0) > 0:
                            if config.get("apply_discount"):
                                if item["price"] > 100:
                                    discount = item["price"] * 0.1
                                    total += (item["price"] - discount) * item["quantity"]
                                else:
                                    total += item["price"] * item["quantity"]
                            else:
                                total += item["price"] * item["quantity"]
                        elif item.get("backorder"):
                            registry.append(item)
                    elif item.get("refund"):
                        total -= item.get("refund_amount", 0)
            elif order.get("status") == "pending":
                if config.get("count_pending"):
                    total += order.get("estimate", 0)
                else:
                    registry.append(order)
            else:
                registry.append(order)
    return total
