package hcl

import (
	"reflect"
	"strings"
	"testing"

	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
)

// findAddr returns the resource at "type.name" or fails the test.
func findAddr(t *testing.T, m *graph.Model, typ, name string) *graph.Resource {
	t.Helper()
	r, ok := m.FindResourceByAddress(typ, name)
	if !ok {
		t.Fatalf("resource %s.%s not imported", typ, name)
	}
	return r
}

func TestImportLiteralsAndReference(t *testing.T) {
	src := `
resource "aws_vpc" "main" {
  cidr_block         = "10.0.0.0/16"
  enable_dns_support = true
  max_size           = 65535
}

resource "aws_subnet" "a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = false
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}

	vpc := findAddr(t, m, "aws_vpc", "main")
	if got := vpc.Attributes["cidr_block"]; got.Kind != graph.KindLiteral || got.Lit != "10.0.0.0/16" {
		t.Errorf("cidr_block = %+v", got)
	}
	if got := vpc.Attributes["enable_dns_support"]; got.LitType != graph.LitBool || got.Lit != "true" {
		t.Errorf("enable_dns_support = %+v", got)
	}
	// Number keeps exact source text (not 65535.0).
	if got := vpc.Attributes["max_size"]; got.LitType != graph.LitNumber || got.Lit != "65535" {
		t.Errorf("max_size = %+v", got)
	}

	sub := findAddr(t, m, "aws_subnet", "a")
	ref := sub.Attributes["vpc_id"]
	if ref.Kind != graph.KindRef || ref.RefTarget != vpc.ID || ref.RefAttribute != "id" {
		t.Errorf("vpc_id ref = %+v (want ref to %s .id)", ref, vpc.ID)
	}
	if got := sub.Attributes["map_public_ip_on_launch"]; got.LitType != graph.LitBool || got.Lit != "false" {
		t.Errorf("map_public_ip_on_launch = %+v", got)
	}
}

func TestImportListOfReferences(t *testing.T) {
	src := `
resource "aws_security_group" "a" {}
resource "aws_security_group" "b" {}
resource "aws_instance" "web" {
  vpc_security_group_ids = [aws_security_group.a.id, aws_security_group.b.id]
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	web := findAddr(t, m, "aws_instance", "web")
	list := web.Attributes["vpc_security_group_ids"]
	if list.Kind != graph.KindList || len(list.Items) != 2 {
		t.Fatalf("vpc_security_group_ids = %+v", list)
	}
	sgA := findAddr(t, m, "aws_security_group", "a")
	sgB := findAddr(t, m, "aws_security_group", "b")
	if list.Items[0].RefTarget != sgA.ID || list.Items[1].RefTarget != sgB.ID {
		t.Errorf("list refs = %+v (want a=%s b=%s)", list.Items, sgA.ID, sgB.ID)
	}
}

func TestImportResolvesInterpolationStyleReferences(t *testing.T) {
	// Terraform 0.11-era quoted-interpolation reference style, still common in
	// the wild. Both the scalar and list forms must resolve to real refs.
	src := `
resource "aws_security_group" "sg" {}
resource "aws_subnet" "a" {}
resource "aws_instance" "web" {
  subnet_id              = "${aws_subnet.a.id}"
  vpc_security_group_ids = ["${aws_security_group.sg.id}"]
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	web := findAddr(t, m, "aws_instance", "web")
	sub := findAddr(t, m, "aws_subnet", "a")
	sg := findAddr(t, m, "aws_security_group", "sg")

	if got := web.Attributes["subnet_id"]; got.Kind != graph.KindRef || got.RefTarget != sub.ID {
		t.Errorf("subnet_id (scalar interpolation) = %+v", got)
	}
	list := web.Attributes["vpc_security_group_ids"]
	if list.Kind != graph.KindList || len(list.Items) != 1 || list.Items[0].RefTarget != sg.ID {
		t.Errorf("vpc_security_group_ids (list interpolation) = %+v", list)
	}
}

func TestImportReferencesResolveAcrossFiles(t *testing.T) {
	files := map[string]string{
		"network.tf": `resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }`,
		"compute.tf": `resource "aws_subnet" "a" { vpc_id = aws_vpc.main.id }`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	vpc := findAddr(t, m, "aws_vpc", "main")
	sub := findAddr(t, m, "aws_subnet", "a")
	if sub.Attributes["vpc_id"].RefTarget != vpc.ID {
		t.Errorf("cross-file ref did not resolve: %+v", sub.Attributes["vpc_id"])
	}
}

func TestImportDiagnosesUnsupportedConstructs(t *testing.T) {
	src := `
resource "aws_s3_bucket" "b" {
  bucket = "my-bucket"
  tags   = jsonencode({ Name = "x" })
  policy = data.aws_iam_policy_document.this.json
  region = var.region

  lifecycle_rule {
    enabled = true
  }
}

variable "region" {
  type = string
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}

	// Only the plain string literal survives as an attribute.
	b := findAddr(t, m, "aws_s3_bucket", "b")
	if len(b.Attributes) != 1 || b.Attributes["bucket"].Lit != "my-bucket" {
		t.Errorf("expected only bucket attribute, got %+v", b.Attributes)
	}

	// Each unsupported construct is reported, not silently dropped.
	reasons := map[string]bool{}
	for _, d := range diags {
		reasons[d.Attribute] = true
	}
	for _, want := range []string{"tags", "policy", "region", "lifecycle_rule"} {
		if !reasons[want] {
			t.Errorf("missing diagnostic for %q; got %+v", want, diags)
		}
	}
	// The variable block is reported as not-yet-imported.
	foundVar := false
	for _, d := range diags {
		if strings.Contains(d.Reason, "variable") {
			foundVar = true
		}
	}
	if !foundVar {
		t.Errorf("expected a diagnostic for the variable block; got %+v", diags)
	}
}

func TestImportRejectsInvalidHCL(t *testing.T) {
	_, _, err := Import(map[string]string{"broken.tf": `resource "aws_vpc" "main" {`})
	if err == nil {
		t.Fatal("expected a parse error for unbalanced braces")
	}
}

// --- round-trip: Generate then Import must reproduce the model up to the
// freshly-minted resource IDs (compared by address). This ties the generator
// and the parser together: any asymmetry between them fails here.

func canonVal(m *graph.Model, v graph.AttrValue) string {
	switch v.Kind {
	case graph.KindLiteral:
		return "lit:" + string(v.LitType) + ":" + v.Lit
	case graph.KindRef:
		return "ref:" + addressOf(m, v.RefTarget) + "." + v.RefAttribute
	case graph.KindList:
		parts := make([]string, len(v.Items))
		for i, it := range v.Items {
			parts[i] = canonVal(m, it)
		}
		return "list[" + strings.Join(parts, ",") + "]"
	}
	return "?"
}

// canonModel reduces a model to address -> attribute -> canonical value, which
// is invariant under the ID remapping an import performs.
func canonModel(m *graph.Model) map[string]map[string]string {
	out := map[string]map[string]string{}
	for i := range m.Resources {
		r := &m.Resources[i]
		am := map[string]string{}
		for k, v := range r.Attributes {
			am[k] = canonVal(m, v)
		}
		out[r.Address()] = am
	}
	return out
}

func TestImportRoundTripsGeneratedHCL(t *testing.T) {
	vpc := rid("01")
	sub := rid("02")
	sg := rid("03")
	orig := &graph.Model{
		Resources: []graph.Resource{
			{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]graph.AttrValue{
				"cidr_block": graph.String("10.0.0.0/16"),
				"max_size":   graph.Int(65535),
			}},
			{ID: sub, Type: "aws_subnet", Name: "a", Attributes: map[string]graph.AttrValue{
				"vpc_id":     graph.Ref(vpc, "id"),
				"cidr_block": graph.String("10.0.1.0/24"),
			}},
			{ID: sg, Type: "aws_security_group", Name: "web", Attributes: map[string]graph.AttrValue{
				"name": graph.String("web"),
			}},
			{ID: rid("04"), Type: "aws_instance", Name: "web", Attributes: map[string]graph.AttrValue{
				"instance_type":          graph.String("t3.micro"),
				"vpc_security_group_ids": graph.List(graph.Ref(sg, "id")),
			}},
		},
	}

	files, err := Generate(orig)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	imported, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	// providers.tf holds only terraform/provider blocks, ignored silently.
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics on round-trip: %+v", diags)
	}
	if err := imported.Validate(); err != nil {
		t.Fatalf("imported model does not validate: %v", err)
	}

	want := canonModel(orig)
	got := canonModel(imported)
	if !reflect.DeepEqual(want, got) {
		t.Errorf("round-trip mismatch:\n orig = %#v\n imp  = %#v", want, got)
	}
}
