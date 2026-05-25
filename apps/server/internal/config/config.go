// Package config loads runtime configuration from environment variables.
//
// All knobs go through this package. The rest of the codebase consumes a
// Config struct rather than calling os.Getenv directly.
package config

import "os"

// Config holds runtime configuration loaded from the environment.
type Config struct {
	// Env is the deployment environment: "development", "staging", "production".
	// It controls logging format and may toggle dev-only behaviour.
	Env string

	// Port is the TCP port the HTTP server listens on.
	Port string
}

// Load reads configuration from environment variables, applying sensible
// defaults for local development.
func Load() Config {
	return Config{
		Env:  getEnv("CALCO_ENV", "development"),
		Port: getEnv("CALCO_PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
