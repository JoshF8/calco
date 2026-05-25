// Package config loads runtime configuration from environment variables.
//
// All knobs go through this package. The rest of the codebase consumes a
// Config struct rather than calling os.Getenv directly.
package config

import (
	"os"
	"strings"
)

// Config holds runtime configuration loaded from the environment.
type Config struct {
	// Env is the deployment environment: "development", "staging", "production".
	// It controls logging format and may toggle dev-only behaviour.
	Env string

	// Port is the TCP port the HTTP server listens on.
	Port string

	// CORSOrigins is the list of origins allowed by the CORS middleware.
	// Defaults to the local Vite dev server. In production, set
	// CALCO_CORS_ORIGINS to a comma-separated list of allowed URLs.
	CORSOrigins []string
}

// Load reads configuration from environment variables, applying sensible
// defaults for local development.
func Load() Config {
	return Config{
		Env:         getEnv("CALCO_ENV", "development"),
		Port:        getEnv("CALCO_PORT", "8080"),
		CORSOrigins: parseList(getEnv("CALCO_CORS_ORIGINS", "http://localhost:5173")),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseList(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
