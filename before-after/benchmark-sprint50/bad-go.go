// Benchmark file: intentionally bad Go code
// Expected smells: ComplexMethod, DeepNesting, MagicNumber, LargeMethod, LowDocCoverage

package benchmark

import (
	"fmt"
	"math"
	"strings"
	"time"
)

func ProcessPayment(amount float64, currency string, method string, customer map[string]interface{}) (map[string]interface{}, error) {
	result := make(map[string]interface{})

	if amount > 0 {
		if currency != "" {
			if method != "" {
				if customer != nil {
					if active, ok := customer["active"].(bool); ok && active {
						var fee float64
						var exchangeRate float64

						if currency == "USD" {
							exchangeRate = 1.0
						} else if currency == "EUR" {
							exchangeRate = 1.08
						} else if currency == "GBP" {
							exchangeRate = 1.27
						} else if currency == "JPY" {
							exchangeRate = 0.0067
						} else {
							return nil, fmt.Errorf("unsupported currency: %s", currency)
						}

						amountUSD := amount * exchangeRate

						if method == "credit_card" {
							if amountUSD < 1.0 {
								return nil, fmt.Errorf("minimum charge is $1.00")
							}
							fee = amountUSD * 0.029 + 0.30
							if amountUSD > 1000 {
								fee = amountUSD * 0.025 + 0.30
							}
						} else if method == "debit_card" {
							fee = amountUSD * 0.015 + 0.25
						} else if method == "paypal" {
							fee = amountUSD * 0.034 + 0.30
							if tier, ok := customer["tier"].(string); ok {
								if tier == "premium" {
									fee = amountUSD * 0.024 + 0.30
								}
							}
						} else if method == "bank_transfer" {
							if amountUSD < 10.0 {
								fee = 0.50
							} else if amountUSD < 1000 {
								fee = 2.50
							} else {
								fee = amountUSD * 0.001
								if fee > 25.0 {
									fee = 25.0
								}
							}
						} else {
							return nil, fmt.Errorf("unsupported payment method: %s", method)
						}

						result["amount_usd"] = amountUSD
						result["fee"] = math.Round(fee*100) / 100
						result["total"] = math.Round((amountUSD+fee)*100) / 100
						result["currency"] = currency
						result["method"] = method
						result["timestamp"] = time.Now().Unix()
						result["status"] = "approved"
					} else {
						result["status"] = "rejected"
						result["reason"] = "inactive customer"
					}
				}
			}
		}
	}

	return result, nil
}

func ValidateAndNormalizeAddress(address map[string]string, country string, strict bool) (map[string]string, []string) {
	errors := []string{}
	normalized := make(map[string]string)

	street := strings.TrimSpace(address["street"])
	city := strings.TrimSpace(address["city"])
	state := strings.TrimSpace(address["state"])
	zip := strings.TrimSpace(address["zip"])

	if street == "" {
		errors = append(errors, "street is required")
	} else {
		if len(street) < 5 {
			errors = append(errors, "street address too short")
		} else if len(street) > 200 {
			errors = append(errors, "street address too long")
		} else {
			normalized["street"] = street
		}
	}

	if city == "" {
		errors = append(errors, "city is required")
	} else {
		if len(city) < 2 {
			errors = append(errors, "city name too short")
		} else {
			words := strings.Fields(city)
			for i, w := range words {
				if len(w) > 0 {
					words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
				}
			}
			normalized["city"] = strings.Join(words, " ")
		}
	}

	if country == "US" {
		if state == "" {
			errors = append(errors, "state is required for US addresses")
		} else {
			validStates := map[string]bool{
				"AL": true, "AK": true, "AZ": true, "AR": true, "CA": true,
				"CO": true, "CT": true, "DE": true, "FL": true, "GA": true,
				"HI": true, "ID": true, "IL": true, "IN": true, "IA": true,
				"KS": true, "KY": true, "LA": true, "ME": true, "MD": true,
				"MA": true, "MI": true, "MN": true, "MS": true, "MO": true,
				"MT": true, "NE": true, "NV": true, "NH": true, "NJ": true,
				"NM": true, "NY": true, "NC": true, "ND": true, "OH": true,
				"OK": true, "OR": true, "PA": true, "RI": true, "SC": true,
				"SD": true, "TN": true, "TX": true, "UT": true, "VT": true,
				"VA": true, "WA": true, "WV": true, "WI": true, "WY": true,
			}
			upperState := strings.ToUpper(state)
			if !validStates[upperState] {
				if strict {
					errors = append(errors, fmt.Sprintf("invalid US state: %s", state))
				}
			} else {
				normalized["state"] = upperState
			}
		}
		if zip == "" {
			errors = append(errors, "ZIP code is required for US addresses")
		} else {
			cleanZip := strings.ReplaceAll(zip, "-", "")
			cleanZip = strings.ReplaceAll(cleanZip, " ", "")
			if len(cleanZip) != 5 && len(cleanZip) != 9 {
				errors = append(errors, "invalid ZIP code format")
			} else {
				allDigits := true
				for _, c := range cleanZip {
					if c < '0' || c > '9' {
						allDigits = false
						break
					}
				}
				if !allDigits {
					errors = append(errors, "ZIP code must contain only digits")
				} else {
					if len(cleanZip) == 9 {
						normalized["zip"] = cleanZip[:5] + "-" + cleanZip[5:]
					} else {
						normalized["zip"] = cleanZip
					}
				}
			}
		}
	} else if country == "CA" {
		if zip == "" {
			errors = append(errors, "postal code is required for Canadian addresses")
		} else {
			cleanPostal := strings.ToUpper(strings.ReplaceAll(zip, " ", ""))
			if len(cleanPostal) != 6 {
				errors = append(errors, "Canadian postal code must be 6 characters")
			} else {
				normalized["zip"] = cleanPostal[:3] + " " + cleanPostal[3:]
			}
		}
	}

	normalized["country"] = country

	return normalized, errors
}

func GenerateInvoice(items []map[string]interface{}, customer map[string]interface{}, options map[string]interface{}) string {
	var sb strings.Builder
	timestamp := time.Now().Format("2006-01-02")

	sb.WriteString("INVOICE\n")
	sb.WriteString("=======\n")
	sb.WriteString(fmt.Sprintf("Date: %s\n", timestamp))

	if name, ok := customer["name"].(string); ok {
		sb.WriteString(fmt.Sprintf("Customer: %s\n", name))
	}
	if email, ok := customer["email"].(string); ok {
		sb.WriteString(fmt.Sprintf("Email: %s\n", email))
	}

	sb.WriteString("\nItems:\n")
	sb.WriteString(fmt.Sprintf("%-30s %8s %8s %12s\n", "Description", "Qty", "Price", "Total"))
	sb.WriteString(strings.Repeat("-", 62) + "\n")

	subtotal := 0.0
	for _, item := range items {
		desc, _ := item["description"].(string)
		qty, _ := item["quantity"].(float64)
		price, _ := item["price"].(float64)
		lineTotal := qty * price
		subtotal += lineTotal
		sb.WriteString(fmt.Sprintf("%-30s %8.0f %8.2f %12.2f\n", desc, qty, price, lineTotal))
	}

	sb.WriteString(strings.Repeat("-", 62) + "\n")

	taxRate := 0.0
	if taxRateVal, ok := options["tax_rate"].(float64); ok {
		taxRate = taxRateVal
	} else {
		taxRate = 0.08
	}

	tax := subtotal * taxRate
	total := subtotal + tax

	discountPct := 0.0
	if discountVal, ok := options["discount"].(float64); ok {
		discountPct = discountVal
	}
	discount := 0.0
	if discountPct > 0 {
		discount = subtotal * discountPct
		total = subtotal - discount + tax
	}

	sb.WriteString(fmt.Sprintf("%-50s %12.2f\n", "Subtotal:", subtotal))
	if discount > 0 {
		sb.WriteString(fmt.Sprintf("%-50s %12.2f\n", fmt.Sprintf("Discount (%.0f%%):", discountPct*100), -discount))
	}
	sb.WriteString(fmt.Sprintf("%-50s %12.2f\n", fmt.Sprintf("Tax (%.0f%%):", taxRate*100), tax))
	sb.WriteString(fmt.Sprintf("%-50s %12.2f\n", "TOTAL:", total))

	if footer, ok := options["footer"].(string); ok && footer != "" {
		sb.WriteString(fmt.Sprintf("\n%s\n", footer))
	} else {
		sb.WriteString("\nThank you for your business!\n")
	}

	return sb.String()
}
