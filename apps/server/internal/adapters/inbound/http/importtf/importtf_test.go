package importtf

import (
	"net/http"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"

	appimporttf "github.com/JoshF8/calco/apps/server/internal/application/importtf"
)

func newAPI(t *testing.T) humatest.TestAPI {
	t.Helper()
	_, api := humatest.New(t)
	Register(api, appimporttf.NewImportTerraform())
	return api
}

// Valid Terraform imports into a model whose references resolve, with no
// diagnostics.
func TestImportEndpointSuccess(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"files": map[string]string{
			"main.tf": `
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
resource "aws_subnet" "a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}
`,
		},
	}
	resp := api.Post("/api/v1/import", body)
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", resp.Code, resp.Body.String())
	}
	out := resp.Body.String()
	if !strings.Contains(out, "aws_vpc") || !strings.Contains(out, "aws_subnet") {
		t.Fatalf("expected both resources in response; got: %s", out)
	}
	// The subnet's vpc_id is returned as a ref (kind=ref), not a literal string.
	if !strings.Contains(out, `"kind":"ref"`) {
		t.Fatalf("expected a ref in the imported model; got: %s", out)
	}
}

// Unsupported-but-valid constructs come back as diagnostics with a 200, not an
// error — the rest of the file still imports.
func TestImportEndpointReportsDiagnostics(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"files": map[string]string{
			"main.tf": `
resource "aws_s3_bucket" "b" {
  bucket = "x"
  tags   = jsonencode({ Name = "x" })
}
`,
		},
	}
	resp := api.Post("/api/v1/import", body)
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", resp.Code, resp.Body.String())
	}
	out := resp.Body.String()
	if !strings.Contains(out, "diagnostics") || !strings.Contains(out, "tags") {
		t.Fatalf("expected a diagnostic for tags; got: %s", out)
	}
}

// Unparseable HCL yields 422, not 500.
func TestImportEndpointInvalidHCL(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"files": map[string]string{"broken.tf": `resource "aws_vpc" "main" {`},
	}
	resp := api.Post("/api/v1/import", body)
	if resp.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body: %s", resp.Code, resp.Body.String())
	}
}
