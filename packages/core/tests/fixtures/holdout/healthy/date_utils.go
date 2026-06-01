package utils

import "time"

// DaysBetween returns the number of days between start and end.
func DaysBetween(start, end time.Time) int {
	diff := end.Sub(start)
	return int(diff.Hours() / 24)
}

// AddDays returns a new time.Time that is days after t.
func AddDays(t time.Time, days int) time.Time {
	return t.AddDate(0, 0, days)
}

// IsWeekend reports whether t falls on a Saturday or Sunday.
func IsWeekend(t time.Time) bool {
	wd := t.Weekday()
	return wd == time.Saturday || wd == time.Sunday
}

// FormatISO returns an ISO-8601 date string (YYYY-MM-DD) for t.
func FormatISO(t time.Time) string {
	return t.Format("2006-01-02")
}

// IsLeapYear reports whether the year of t is a leap year.
func IsLeapYear(t time.Time) bool {
	y := t.Year()
	return (y%4 == 0 && y%100 != 0) || y%400 == 0
}
