// Package observability wires logging, metrics, and tracing.
//
// MVP includes structured logging via log/slog. Metrics (Prometheus) and
// traces (OpenTelemetry) join here when needed.
package observability

import (
	"log/slog"
	"os"
)

// NewLogger returns a slog.Logger configured for the given environment.
//   - "production": JSON handler at INFO level.
//   - anything else: text handler at DEBUG level for readable local output.
//
// The returned logger is also installed as slog.Default so packages that
// log without a handle still produce structured output.
func NewLogger(env string) *slog.Logger {
	var handler slog.Handler
	switch env {
	case "production":
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		})
	default:
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		})
	}
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}
