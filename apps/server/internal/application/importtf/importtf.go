// Package importtf is the application layer for importing Terraform into a
// graph model.
package importtf

import (
	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
	"github.com/JoshF8/calco/apps/server/internal/domain/hcl"
)

// ImportTerraform is the use case that parses Terraform source into a graph
// model. Like GenerateHCL it has no port dependencies — the importer is a pure
// domain function and the sources arrive in the request — but it exists so the
// HTTP adapter depends on a use case, keeping the layering uniform.
type ImportTerraform struct{}

// NewImportTerraform builds the use case.
func NewImportTerraform() *ImportTerraform {
	return &ImportTerraform{}
}

// Execute parses the given Terraform files into a graph model plus the
// diagnostics for anything that could not be represented. It returns an error
// only when the HCL does not parse; valid-but-unsupported input yields
// diagnostics, not an error.
func (uc *ImportTerraform) Execute(files map[string]string) (*graph.Model, []hcl.Diagnostic, error) {
	return hcl.Import(files)
}
