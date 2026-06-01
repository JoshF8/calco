// Package generate is the HTTP adapter for the HCL generation use case.
package generate

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/apimodel"
	appgenerate "github.com/JoshF8/calco/apps/server/internal/application/generate"
)

type generateInput struct {
	Body apimodel.Model
}

type generateOutput struct {
	Body struct {
		Files map[string]string `json:"files" doc:"Generated Terraform files, keyed by filename (e.g. main.tf)."`
	}
}

// Register wires the generate endpoint onto the given Huma API.
func Register(api huma.API, uc *appgenerate.GenerateHCL) {
	huma.Register(api, huma.Operation{
		OperationID: "generate-hcl",
		Method:      http.MethodPost,
		Path:        "/api/v1/generate",
		Summary:     "Generate Terraform from a graph model",
		Description: "Validates the supplied graph model and renders it to Terraform files. A 422 is returned if the model is not generator-safe (dangling references, a dependency cycle, invalid identifiers, and so on). The output is syntactically valid HCL; it is not checked against provider schemas.",
		Tags:        []string{"Generate"},
	}, func(_ context.Context, in *generateInput) (*generateOutput, error) {
		files, err := uc.Execute(in.Body.ToDomain())
		if err != nil {
			return nil, huma.Error422UnprocessableEntity("the graph model is not generator-safe", err)
		}
		out := &generateOutput{}
		out.Body.Files = files
		return out, nil
	})
}
