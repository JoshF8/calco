// Package generate is the application layer for HCL generation.
package generate

import (
	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
	"github.com/JoshF8/calco/apps/server/internal/domain/hcl"
)

// GenerateHCL is the use case that turns a graph model into Terraform files.
// It has no port dependencies — the model arrives in the request and the
// generator is a pure domain function — but it exists so the HTTP adapter
// depends on a use case rather than reaching into the domain directly, keeping
// the layering uniform with the rest of the server.
type GenerateHCL struct{}

// NewGenerateHCL builds the use case.
func NewGenerateHCL() *GenerateHCL {
	return &GenerateHCL{}
}

// Execute validates the model and renders it to Terraform files. It returns
// the domain's validation error unchanged when the model is not
// generator-safe, so the adapter can map it to an appropriate HTTP status.
func (uc *GenerateHCL) Execute(m *graph.Model) (hcl.Files, error) {
	return hcl.Generate(m)
}
