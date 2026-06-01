package utils

import (
	"regexp"
	"strings"
)

var emailPattern = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// IsValidEmail reports whether addr matches a basic e-mail pattern.
func IsValidEmail(addr string) bool {
	return emailPattern.MatchString(addr)
}

// IsNonEmpty reports whether s is a non-empty, non-whitespace-only string.
func IsNonEmpty(s string) bool {
	return strings.TrimSpace(s) != ""
}

// IsPositive reports whether v is strictly greater than zero.
func IsPositive(v float64) bool {
	return v > 0
}

// InRange reports whether v is within the inclusive range [lo, hi].
func InRange(v, lo, hi float64) bool {
	return v >= lo && v <= hi
}

// IsNilOrEmpty reports whether the pointer is nil or points to an empty string.
func IsNilOrEmpty(s *string) bool {
	return s == nil || *s == ""
}
