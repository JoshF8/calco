// Package hello is the HTTP adapter for the hello use case.
//
// It maps HTTP requests to the application-layer GreetUser, providing the
// shape of the API for OpenAPI consumers.
package hello

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	apphello "github.com/JoshF8/calco/apps/server/internal/application/hello"
)

// greetInput is the request shape for the greet endpoint.
type greetInput struct {
	Name string `query:"name" doc:"Name to greet. Defaults to 'world' if empty." example:"calco"`
}

// greetOutput is the response body for the greet endpoint.
type greetOutput struct {
	Body struct {
		Message string `json:"message" example:"Hello, calco" doc:"The generated greeting."`
	}
}

// Register wires the hello endpoint onto the given Huma API, using the
// provided GreetUser use case.
func Register(api huma.API, greet *apphello.GreetUser) {
	huma.Register(api, huma.Operation{
		OperationID: "hello-greet",
		Method:      http.MethodGet,
		Path:        "/api/v1/hello",
		Summary:     "Greet a user by name",
		Description: "Trivial endpoint that exercises the hexagonal layering end-to-end (HTTP adapter → application use case → domain function).",
		Tags:        []string{"Hello"},
	}, func(_ context.Context, in *greetInput) (*greetOutput, error) {
		out := &greetOutput{}
		out.Body.Message = greet.Execute(in.Name)
		return out, nil
	})
}
