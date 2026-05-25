// Package main is the entry point for the calco server binary.
//
// All dependency injection happens in run(): use cases are constructed
// from their port dependencies and passed into HTTP adapters. There is no
// DI framework; everything is explicit struct construction.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	httpdocs "github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/docs"
	httphealth "github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/health"
	httphello "github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/hello"
	apphello "github.com/JoshF8/calco/apps/server/internal/application/hello"
	"github.com/JoshF8/calco/apps/server/internal/config"
	"github.com/JoshF8/calco/apps/server/internal/observability"
)

const (
	appName    = "calco"
	appVersion = "0.0.1"
)

func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	logger := observability.NewLogger(cfg.Env)
	logger.Info("starting", "name", appName, "version", appVersion, "env", cfg.Env)

	// ─── Use cases (manual DI) ─────────────────────────────────────────────
	greetUser := apphello.NewGreetUser()

	// ─── HTTP server ───────────────────────────────────────────────────────
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(30 * time.Second))
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	humaCfg := huma.DefaultConfig(appName, appVersion)
	humaCfg.Info.Description = "Visual designer for AWS infrastructure that translates between canvas and Terraform."
	humaCfg.OpenAPI.Servers = []*huma.Server{
		{URL: "http://localhost:" + cfg.Port, Description: "Local development"},
	}
	// Disable Huma's default Stoplight Elements docs; we serve Scalar instead.
	humaCfg.DocsPath = ""

	api := humachi.New(router, humaCfg)
	httphealth.Register(api)
	httphello.Register(api, greetUser)

	// Serve Scalar API reference at /docs.
	router.Get("/docs", httpdocs.Handler(appName+" API Reference", "/openapi.json"))

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// ─── Graceful shutdown ─────────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", addr, "docs", "http://localhost:"+cfg.Port+"/docs")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("listen: %w", err)
		}
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
	case err := <-errCh:
		return err
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	logger.Info("shutdown complete")
	return nil
}
