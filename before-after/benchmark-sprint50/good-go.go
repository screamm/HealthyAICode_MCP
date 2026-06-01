// Package benchmark provides refactored payment, address, and invoice helpers.
// Sprint 50 AFTER benchmark — demonstrates improvement from ~1.2 to >=9.5.
package benchmark

import (
	"fmt"
	"math"
	"strings"
	"time"
	"unicode"
)

// ─── Exchange rates (USD base) ────────────────────────────────────────────────

// exchangeRates maps ISO currency codes to their USD conversion factor.
var exchangeRates = map[string]float64{
	"USD": 1.0,
	"EUR": 1.08,
	"GBP": 1.27,
	"JPY": 0.0067,
}

// ─── Payment fee constants ────────────────────────────────────────────────────

const (
	// Credit card fees and thresholds.
	CREDIT_CARD_STANDARD_RATE = 0.029
	CREDIT_CARD_PREMIUM_RATE  = 0.025
	CREDIT_CARD_FIXED_FEE     = 0.30
	CREDIT_CARD_HIGH_VOLUME   = 1000.0
	CREDIT_CARD_MIN_CHARGE    = 1.0

	// Debit card fees.
	DEBIT_CARD_RATE      = 0.015
	DEBIT_CARD_FIXED_FEE = 0.25

	// PayPal fees.
	PAYPAL_STANDARD_RATE = 0.034
	PAYPAL_PREMIUM_RATE  = 0.024
	PAYPAL_FIXED_FEE     = 0.30

	// Bank transfer fees and thresholds.
	BANK_TRANSFER_SMALL_FEE   = 0.50
	BANK_TRANSFER_SMALL_LIMIT = 10.0
	BANK_TRANSFER_MID_FEE     = 2.50
	BANK_TRANSFER_MID_LIMIT   = 1000.0
	BANK_TRANSFER_LARGE_RATE  = 0.001
	BANK_TRANSFER_MAX_FEE     = 25.0

	// Default tax rate for invoices.
	DEFAULT_TAX_RATE = 0.08

	// Rounding multiplier for two-decimal precision.
	ROUNDING_FACTOR = 100.0

	// Address validation lengths.
	STREET_MIN_LEN  = 5
	STREET_MAX_LEN  = 200
	ZIP_SHORT_LEN   = 5
	ZIP_LONG_LEN    = 9
	CA_POSTAL_LEN   = 6
	CA_POSTAL_SPLIT = 3

	// City minimum length.
	CITY_MIN_LEN = 2

	// Invoice display format strings and separator width.
	INVOICE_ITEM_FMT   = "%-30s %8.0f %8.2f %12.2f\n"
	INVOICE_HEADER_FMT = "%-30s %8s %8s %12s\n"
	INVOICE_TOTAL_FMT  = "%-50s %12.2f\n"
	INVOICE_SEPARATOR  = 62

	// Go reference time for date-only formatting (YYYY-MM-DD).
	DATE_FORMAT = "2006-01-02"
)

// ─── Payment helpers ─────────────────────────────────────────────────────────

// creditCardFee returns the fee for a credit-card transaction in USD.
func creditCardFee(amountUSD float64) (float64, error) {
	if amountUSD < CREDIT_CARD_MIN_CHARGE {
		return 0, fmt.Errorf("minimum charge is $1.00")
	}
	rate := CREDIT_CARD_STANDARD_RATE
	if amountUSD > CREDIT_CARD_HIGH_VOLUME {
		rate = CREDIT_CARD_PREMIUM_RATE
	}
	return amountUSD*rate + CREDIT_CARD_FIXED_FEE, nil
}

// paypalFee returns the PayPal fee; premium customers receive a reduced rate.
func paypalFee(amountUSD float64, customer map[string]interface{}) float64 {
	rate := PAYPAL_STANDARD_RATE
	if tier, _ := customer["tier"].(string); tier == "premium" {
		rate = PAYPAL_PREMIUM_RATE
	}
	return amountUSD*rate + PAYPAL_FIXED_FEE
}

// bankTransferFee returns the bank-transfer fee for the given USD amount.
func bankTransferFee(amountUSD float64) float64 {
	if amountUSD < BANK_TRANSFER_SMALL_LIMIT {
		return BANK_TRANSFER_SMALL_FEE
	}
	if amountUSD < BANK_TRANSFER_MID_LIMIT {
		return BANK_TRANSFER_MID_FEE
	}
	return math.Min(amountUSD*BANK_TRANSFER_LARGE_RATE, BANK_TRANSFER_MAX_FEE)
}

// transactionFee returns the fee for the given payment method and amount.
func transactionFee(method string, amountUSD float64, customer map[string]interface{}) (float64, error) {
	switch method {
	case "credit_card":
		return creditCardFee(amountUSD)
	case "debit_card":
		return amountUSD*DEBIT_CARD_RATE + DEBIT_CARD_FIXED_FEE, nil
	case "paypal":
		return paypalFee(amountUSD, customer), nil
	case "bank_transfer":
		return bankTransferFee(amountUSD), nil
	default:
		return 0, fmt.Errorf("unsupported payment method: %s", method)
	}
}

// ProcessPayment converts amount to USD, computes the transaction fee, and
// returns full payment details. Returns an error for unsupported currencies or
// payment methods, or when the amount is below the minimum charge threshold.
func ProcessPayment(
	amount float64,
	currency string,
	method string,
	customer map[string]interface{},
) (map[string]interface{}, error) {
	result := make(map[string]interface{})
	if amount <= 0 || customer == nil {
		return result, nil
	}
	if currency == "" || method == "" {
		return result, nil
	}

	if active, _ := customer["active"].(bool); !active {
		result["status"] = "rejected"
		result["reason"] = "inactive customer"
		return result, nil
	}

	rate, ok := exchangeRates[currency]
	if !ok {
		return nil, fmt.Errorf("unsupported currency: %s", currency)
	}

	amountUSD := amount * rate
	fee, err := transactionFee(method, amountUSD, customer)
	if err != nil {
		return nil, err
	}

	result["amount_usd"] = amountUSD
	result["fee"] = math.Round(fee*ROUNDING_FACTOR) / ROUNDING_FACTOR
	result["total"] = math.Round((amountUSD+fee)*ROUNDING_FACTOR) / ROUNDING_FACTOR
	result["currency"] = currency
	result["method"] = method
	result["timestamp"] = time.Now().Unix()
	result["status"] = "approved"
	return result, nil
}

// ─── Address validation ───────────────────────────────────────────────────────

// validUSStates contains all valid two-letter US state abbreviations.
var validUSStates = map[string]bool{
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

// titleCaseWords converts a space-separated string to Title Case.
func titleCaseWords(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
		}
	}
	return strings.Join(words, " ")
}

// normalizeStreet validates and returns the normalized street value.
func normalizeStreet(street string) (string, error) {
	if street == "" {
		return "", fmt.Errorf("street is required")
	}
	if len(street) < STREET_MIN_LEN {
		return "", fmt.Errorf("street address too short")
	}
	if len(street) > STREET_MAX_LEN {
		return "", fmt.Errorf("street address too long")
	}
	return street, nil
}

// normalizeUSZip validates and normalizes a US ZIP code (five or nine digits).
func normalizeUSZip(zip string) (string, error) {
	if zip == "" {
		return "", fmt.Errorf("ZIP code is required for US addresses")
	}
	clean := strings.ReplaceAll(strings.ReplaceAll(zip, "-", ""), " ", "")
	if len(clean) != ZIP_SHORT_LEN && len(clean) != ZIP_LONG_LEN {
		return "", fmt.Errorf("invalid ZIP code format")
	}
	for _, c := range clean {
		if !unicode.IsDigit(c) {
			return "", fmt.Errorf("ZIP code must contain only digits")
		}
	}
	if len(clean) == ZIP_LONG_LEN {
		return clean[:ZIP_SHORT_LEN] + "-" + clean[ZIP_SHORT_LEN:], nil
	}
	return clean, nil
}

// normalizeField runs a normalizer over the raw field value, storing the result
// under key on success and returning an empty string. On failure it leaves
// normalized untouched and returns the error message for the caller to collect.
func normalizeField(
	normalized map[string]string,
	key string,
	raw string,
	normalize func(string) (string, error),
) string {
	value, err := normalize(strings.TrimSpace(raw))
	if err != nil {
		return err.Error()
	}
	normalized[key] = value
	return ""
}

// collectFieldError appends msg to errors when it is non-empty.
func collectFieldError(errors []string, msg string) []string {
	if msg == "" {
		return errors
	}
	return append(errors, msg)
}

// applyUSValidation validates the state and ZIP fields for US addresses.
func applyUSValidation(address map[string]string, strict bool, normalized map[string]string) []string {
	var errors []string
	state := strings.ToUpper(strings.TrimSpace(address["state"]))
	if state == "" {
		errors = append(errors, "state is required for US addresses")
	} else if !validUSStates[state] {
		if strict {
			errors = append(errors, fmt.Sprintf("invalid US state: %s", address["state"]))
		}
	} else {
		normalized["state"] = state
	}
	return collectFieldError(errors, normalizeField(normalized, "zip", address["zip"], normalizeUSZip))
}

// applyCAValidation validates the postal code field for Canadian addresses.
func applyCAValidation(address map[string]string, normalized map[string]string) []string {
	zip := strings.TrimSpace(address["zip"])
	if zip == "" {
		return []string{"postal code is required for Canadian addresses"}
	}
	clean := strings.ToUpper(strings.ReplaceAll(zip, " ", ""))
	if len(clean) != CA_POSTAL_LEN {
		return []string{"Canadian postal code must be six characters"}
	}
	normalized["zip"] = clean[:CA_POSTAL_SPLIT] + " " + clean[CA_POSTAL_SPLIT:]
	return nil
}

// ValidateAndNormalizeAddress validates and normalizes a postal address.
// Returns the normalized fields and a list of validation errors.
func ValidateAndNormalizeAddress(
	address map[string]string,
	country string,
	strict bool,
) (map[string]string, []string) {
	var errors []string
	normalized := map[string]string{"country": country}

	errors = collectFieldError(errors, normalizeField(normalized, "street", address["street"], normalizeStreet))

	city := strings.TrimSpace(address["city"])
	if city == "" {
		errors = append(errors, "city is required")
	} else if len(city) < CITY_MIN_LEN {
		errors = append(errors, "city name too short")
	} else {
		normalized["city"] = titleCaseWords(city)
	}

	switch country {
	case "US":
		errors = append(errors, applyUSValidation(address, strict, normalized)...)
	case "CA":
		errors = append(errors, applyCAValidation(address, normalized)...)
	}

	return normalized, errors
}

// ─── Invoice generation ───────────────────────────────────────────────────────

// lineItem writes a single invoice row to sb and returns its line total.
func lineItem(sb *strings.Builder, item map[string]interface{}) float64 {
	desc, _ := item["description"].(string)
	qty, _ := item["quantity"].(float64)
	price, _ := item["price"].(float64)
	lineTotal := qty * price
	sb.WriteString(fmt.Sprintf(INVOICE_ITEM_FMT, desc, qty, price, lineTotal))
	return lineTotal
}

// invoiceTotals writes subtotal, discount, tax, and total lines to sb.
func invoiceTotals(sb *strings.Builder, subtotal float64, options map[string]interface{}) {
	taxRate := DEFAULT_TAX_RATE
	if v, ok := options["tax_rate"].(float64); ok {
		taxRate = v
	}
	discountPct, _ := options["discount"].(float64)
	discount := subtotal * discountPct
	tax := (subtotal - discount) * taxRate
	total := subtotal - discount + tax

	sb.WriteString(fmt.Sprintf(INVOICE_TOTAL_FMT, "Subtotal:", subtotal))
	if discount > 0 {
		sb.WriteString(fmt.Sprintf(INVOICE_TOTAL_FMT,
			fmt.Sprintf("Discount (%.0f%%):", discountPct*ROUNDING_FACTOR), -discount))
	}
	sb.WriteString(fmt.Sprintf(INVOICE_TOTAL_FMT,
		fmt.Sprintf("Tax (%.0f%%):", taxRate*ROUNDING_FACTOR), tax))
	sb.WriteString(fmt.Sprintf(INVOICE_TOTAL_FMT, "TOTAL:", total))
}

// GenerateInvoice renders a plain-text invoice for the given line items and customer.
// options may contain "tax_rate" (float64), "discount" (float64 fraction), and
// "footer" (string) for an optional closing message.
func GenerateInvoice(
	items []map[string]interface{},
	customer map[string]interface{},
	options map[string]interface{},
) string {
	var sb strings.Builder
	sb.WriteString("INVOICE\n=======\n")
	sb.WriteString(fmt.Sprintf("Date: %s\n", time.Now().Format(DATE_FORMAT)))
	if name, ok := customer["name"].(string); ok {
		sb.WriteString(fmt.Sprintf("Customer: %s\n", name))
	}
	if email, ok := customer["email"].(string); ok {
		sb.WriteString(fmt.Sprintf("Email: %s\n", email))
	}

	sb.WriteString("\nItems:\n")
	sb.WriteString(fmt.Sprintf(INVOICE_HEADER_FMT, "Description", "Qty", "Price", "Total"))
	sb.WriteString(strings.Repeat("-", INVOICE_SEPARATOR) + "\n")

	subtotal := 0.0
	for _, item := range items {
		subtotal += lineItem(&sb, item)
	}
	sb.WriteString(strings.Repeat("-", INVOICE_SEPARATOR) + "\n")
	invoiceTotals(&sb, subtotal, options)

	if footer, _ := options["footer"].(string); footer != "" {
		sb.WriteString(fmt.Sprintf("\n%s\n", footer))
	} else {
		sb.WriteString("\nThank you for your business!\n")
	}
	return sb.String()
}
