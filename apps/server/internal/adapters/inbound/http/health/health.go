// Package health registers the liveness endpoint on a Huma API.
//
// Readiness (/readyz, which pings the database) lands with the
// persistence layer; until then only /healthz is wired.
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

// Register wires the liveness endpoint onto the given Huma API.
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
