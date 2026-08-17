// Package importtf is the HTTP adapter for the Terraform import use case.
package importtf

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/apimodel"
	appimporttf "github.com/JoshF8/calco/apps/server/internal/application/importtf"
	"github.com/JoshF8/calco/apps/server/internal/domain/hcl"
)

type importInput struct {
	Body struct {
		Files map[string]string `json:"files" doc:"Terraform sources keyed by filename (e.g. main.tf)."`
	}
}

// Diagnostic is the wire form of hcl.Diagnostic: one construct the importer
// could not represent and skipped.
type Diagnostic struct {
	File      string `json:"file,omitempty"`
	Address   string `json:"address,omitempty"`
	Attribute string `json:"attribute,omitempty"`
	Reason    string `json:"reason"`
}

type importOutput struct {
	Body struct {
		Model       apimodel.Model `json:"model" doc:"The imported graph model. Positions are unset; the client lays it out."`
		Diagnostics []Diagnostic   `json:"diagnostics" doc:"Constructs that could not be represented and were skipped (empty when everything imported cleanly)."`
	}
}

// Register wires the import endpoint onto the given Huma API.
func Register(api huma.API, uc *appimporttf.ImportTerraform) {
	huma.Register(api, huma.Operation{
		OperationID: "import-terraform",
		Method:      http.MethodPost,
		Path:        "/api/v1/import",
		Summary:     "Import Terraform into a graph model",
		Description: "Parses Terraform source statically (no terraform binary) into a graph model. It reads resource blocks, scalar literals, references between resources, lists of those, and nested blocks (ingress, default_action, ebs_block_device, …) in source order. Anything it cannot yet represent — label-bearing blocks such as dynamic/provisioner, references to var/data/module, functions, count/for_each — is returned as a diagnostic and skipped, never guessed. A 422 is returned only when the HCL does not parse.",
		Tags:        []string{"Import"},
	}, func(_ context.Context, in *importInput) (*importOutput, error) {
		model, diags, err := uc.Execute(in.Body.Files)
		if err != nil {
			return nil, huma.Error422UnprocessableEntity("the Terraform could not be parsed", err)
		}
		out := &importOutput{}
		out.Body.Model = apimodel.FromDomain(model)
		out.Body.Diagnostics = toWire(diags)
		return out, nil
	})
}

// toWire converts domain diagnostics to the wire form, always returning a
// non-nil slice so the JSON field is [] rather than null when there are none.
func toWire(ds []hcl.Diagnostic) []Diagnostic {
	out := make([]Diagnostic, 0, len(ds))
	for _, d := range ds {
		out = append(out, Diagnostic{File: d.File, Address: d.Address, Attribute: d.Attribute, Reason: d.Reason})
	}
	return out
}
