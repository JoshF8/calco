package generate

import (
	"net/http"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2/humatest"

	appgenerate "github.com/JoshF8/calco/apps/server/internal/application/generate"
)

func newAPI(t *testing.T) humatest.TestAPI {
	t.Helper()
	_, api := humatest.New(t)
	Register(api, appgenerate.NewGenerateHCL())
	return api
}

// A valid graph model produces Terraform files. The request body uses the
// discriminated-union wire shape for attribute values.
func TestGenerateEndpointSuccess(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"resources": []map[string]any{
			{
				"id": "0192f8a0-0000-7000-8000-000000000001", "type": "aws_vpc", "name": "main",
				"attributes": map[string]any{
					"cidr_block": map[string]any{"kind": "literal", "litType": "string", "value": "10.0.0.0/16"},
				},
			},
			{
				"id": "0192f8a0-0000-7000-8000-000000000002", "type": "aws_subnet", "name": "a",
				"attributes": map[string]any{
					"vpc_id": map[string]any{"kind": "ref", "target": "0192f8a0-0000-7000-8000-000000000001", "attribute": "id"},
				},
			},
		},
	}
	resp := api.Post("/api/v1/generate", body)
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", resp.Code, resp.Body.String())
	}
	out := resp.Body.String()
	if !strings.Contains(out, "main.tf") || !strings.Contains(out, "providers.tf") {
		t.Fatalf("expected main.tf and providers.tf in response; got: %s", out)
	}
	// The reference must be present bare in the generated HCL (it is JSON-
	// escaped in the response envelope, hence the escaped quotes around it).
	if !strings.Contains(out, "aws_vpc.main.id") {
		t.Fatalf("generated HCL missing bare reference; got: %s", out)
	}
}

// An invalid model (dangling reference) yields 422, not 500.
func TestGenerateEndpointInvalidModel(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"resources": []map[string]any{
			{
				"id": "0192f8a0-0000-7000-8000-000000000001", "type": "aws_subnet", "name": "a",
				"attributes": map[string]any{
					"vpc_id": map[string]any{"kind": "ref", "target": "0192f8a0-0000-7000-8000-0000000000ff", "attribute": "id"},
				},
			},
		},
	}
	resp := api.Post("/api/v1/generate", body)
	if resp.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body: %s", resp.Code, resp.Body.String())
	}
}

// An identifier-injection attempt via a reference attribute is rejected with
// 422 rather than producing corrupted HCL.
func TestGenerateEndpointRejectsInjection(t *testing.T) {
	api := newAPI(t)
	body := map[string]any{
		"resources": []map[string]any{
			{
				"id": "0192f8a0-0000-7000-8000-000000000001", "type": "aws_vpc", "name": "main",
				"attributes": map[string]any{},
			},
			{
				"id": "0192f8a0-0000-7000-8000-000000000002", "type": "aws_subnet", "name": "a",
				"attributes": map[string]any{
					"vpc_id": map[string]any{
						"kind": "ref", "target": "0192f8a0-0000-7000-8000-000000000001",
						"attribute": "id\n  injected = \"x\"",
					},
				},
			},
		},
	}
	resp := api.Post("/api/v1/generate", body)
	if resp.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 for injection attempt; body: %s", resp.Code, resp.Body.String())
	}
}
