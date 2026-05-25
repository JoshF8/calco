// Package health registers liveness and readiness endpoints on a Huma API.
package health

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

// healthOutput is the response body for the liveness endpoint.
type healthOutput struct {
	Body struct {
		Status string `json:"status" example:"ok" doc:"Service status."`
	}
}

// Register wires the health endpoints onto the given Huma API.
func Register(api huma.API) {
	huma.Register(api, huma.Operation{
		OperationID: "health-liveness",
		Method:      http.MethodGet,
		Path:        "/healthz",
		Summary:     "Liveness check",
		Description: "Returns 200 OK if the process is running. Does not check downstream dependencies.",
		Tags:        []string{"Health"},
	}, func(_ context.Context, _ *struct{}) (*healthOutput, error) {
		out := &healthOutput{}
		out.Body.Status = "ok"
		return out, nil
	})
}
