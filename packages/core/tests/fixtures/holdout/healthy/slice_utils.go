package utils

// Contains reports whether target is present in items.
func Contains(items []int, target int) bool {
	for _, v := range items {
		if v == target {
			return true
		}
	}
	return false
}

// Sum returns the sum of all integers in items.
func Sum(items []int) int {
	total := 0
	for _, v := range items {
		total += v
	}
	return total
}

// Filter returns a new slice containing only elements for which predicate is true.
func Filter(items []int, predicate func(int) bool) []int {
	result := make([]int, 0)
	for _, v := range items {
		if predicate(v) {
			result = append(result, v)
		}
	}
	return result
}

// Map applies transform to each element and returns the resulting slice.
func Map(items []int, transform func(int) int) []int {
	result := make([]int, len(items))
	for i, v := range items {
		result[i] = transform(v)
	}
	return result
}

// Unique returns a new slice with duplicate values removed (preserving order).
func Unique(items []int) []int {
	seen := make(map[int]bool)
	result := make([]int, 0)
	for _, v := range items {
		if !seen[v] {
			seen[v] = true
			result = append(result, v)
		}
	}
	return result
}
