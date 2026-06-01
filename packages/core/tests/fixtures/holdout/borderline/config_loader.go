package config

import (
	"fmt"
	"strings"
)

// Config holds application configuration values.
type Config struct {
	Host     string
	Port     int
	Debug    bool
	LogLevel string
	Tags     []string
}

// Validate checks that a Config has required fields and valid values.
// Returns a descriptive error message or nil when the config is valid.
func (c *Config) Validate() error {
	if c.Host == "" {
		return fmt.Errorf("host is required")
	}
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("port %d is out of valid range [1, 65535]", c.Port)
	}
	level := strings.ToUpper(c.LogLevel)
	validLevels := map[string]bool{"DEBUG": true, "INFO": true, "WARNING": true, "ERROR": true}
	if c.LogLevel != "" && !validLevels[level] {
		return fmt.Errorf("invalid log level %q; valid values: DEBUG, INFO, WARNING, ERROR", c.LogLevel)
	}
	return nil
}

// Merge returns a new Config where non-zero fields from override replace those in base.
func Merge(base, override Config) Config {
	result := base
	if override.Host != "" {
		result.Host = override.Host
	}
	if override.Port != 0 {
		result.Port = override.Port
	}
	if override.Debug {
		result.Debug = override.Debug
	}
	if override.LogLevel != "" {
		result.LogLevel = override.LogLevel
	}
	if len(override.Tags) > 0 {
		result.Tags = append(result.Tags, override.Tags...)
	}
	return result
}
