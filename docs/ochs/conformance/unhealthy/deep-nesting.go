// Fixture: a deeply nested, high-complexity Go function.
//
// Used by go-gopls-transformer.test.ts to exercise a real gopls
// refactor.extract.function transformation, and by the health analyzer to
// verify it scores below 7.5 with a ComplexMethod smell.
package fixture

type Item struct {
	Price    int
	Quantity int
	Refund   int
	Backorder bool
}

type Order struct {
	Status   string
	Items    []Item
	Estimate int
}

func ProcessOrders(orders []Order, applyDiscount bool, countPending bool) int {
	total := 0
	for _, order := range orders {
		if order.Status == "active" {
			for _, item := range order.Items {
				if item.Price > 0 {
					if item.Quantity > 0 {
						if applyDiscount {
							if item.Price > 100 {
								discount := item.Price / 10
								total += (item.Price - discount) * item.Quantity
							} else {
								total += item.Price * item.Quantity
							}
						} else {
							total += item.Price * item.Quantity
						}
					} else if item.Backorder {
						total += 1
					}
				} else if item.Refund > 0 {
					total -= item.Refund
				}
			}
		} else if order.Status == "pending" {
			if countPending {
				total += order.Estimate
			}
		}
	}
	return total
}
