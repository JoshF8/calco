package hcl

import (
	"strings"
	"testing"

	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
)

func rid(suffix string) graph.ResourceID {
	return graph.ResourceID("0192f8a0-0000-7000-8000-0000000000" + suffix)
}

// sampleModel: a VPC, a subnet referencing it, an input variable, and an
// output referencing the VPC — exercising literals, a reference, a number, a
// bool, a variable type expression, and topological ordering.
func sampleModel() *graph.Model {
	vpc := rid("01")
	sub := rid("02")
	regionDefault := graph.String("us-east-1")
	return &graph.Model{
		Resources: []graph.Resource{
			// Deliberately listed subnet-first so the generator must reorder.
			{ID: sub, Type: "aws_subnet", Name: "a", Attributes: map[string]graph.AttrValue{
				"vpc_id":            graph.Ref(vpc, "id"),
				"cidr_block":        graph.String("10.0.1.0/24"),
				"map_public_ip":     graph.Bool(true),
				"availability_zone": graph.String("us-east-1a"),
			}},
			{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]graph.AttrValue{
				"cidr_block": graph.String("10.0.0.0/16"),
				"max_size":   graph.Int(65535),
			}},
		},
		Variables: []graph.Variable{
			{Name: "region", Type: "string", Default: &regionDefault, Description: "AWS region"},
		},
		Outputs: []graph.Output{
			{Name: "vpc_id", Value: graph.Ref(vpc, "id")},
		},
	}
}

func TestGenerateProducesParseableFiles(t *testing.T) {
	files, err := Generate(sampleModel())
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	want := []string{"main.tf", "providers.tf", "variables.tf", "outputs.tf"}
	for _, name := range want {
		content, ok := files[name]
		if !ok {
			t.Fatalf("missing file %s", name)
		}
		if err := Parse(name, content); err != nil {
			t.Fatalf("%s is not valid HCL: %v\n---\n%s", name, err, content)
		}
	}
}

func TestGenerateReferenceIsBare(t *testing.T) {
	files, err := Generate(sampleModel())
	if err != nil {
		t.Fatal(err)
	}
	main := files["main.tf"]
	if !strings.Contains(norm(main), "vpc_id = aws_vpc.main.id") {
		t.Fatalf("reference not emitted bare; main.tf:\n%s", main)
	}
	if strings.Contains(main, `"aws_vpc.main.id"`) {
		t.Fatalf("reference was quoted as a string; main.tf:\n%s", main)
	}
	// Output references must be bare too.
	if !strings.Contains(norm(files["outputs.tf"]), "value = aws_vpc.main.id") {
		t.Fatalf("output reference not bare; outputs.tf:\n%s", files["outputs.tf"])
	}
}

func TestGenerateNumberIsBareNotQuoted(t *testing.T) {
	files, err := Generate(sampleModel())
	if err != nil {
		t.Fatal(err)
	}
	main := files["main.tf"]
	if !strings.Contains(norm(main), "max_size = 65535") {
		t.Fatalf("number not emitted bare; main.tf:\n%s", main)
	}
	if strings.Contains(main, `"65535"`) || strings.Contains(main, "65535.0") {
		t.Fatalf("number corrupted (quoted or floatified); main.tf:\n%s", main)
	}
}

func TestGenerateStringIsQuoted(t *testing.T) {
	files, _ := Generate(sampleModel())
	if !strings.Contains(norm(files["main.tf"]), `cidr_block = "10.0.0.0/16"`) {
		t.Fatalf("string not quoted; main.tf:\n%s", files["main.tf"])
	}
}

func TestGenerateTopologicalOrder(t *testing.T) {
	files, err := Generate(sampleModel())
	if err != nil {
		t.Fatal(err)
	}
	main := files["main.tf"]
	vpcAt := strings.Index(main, `resource "aws_vpc" "main"`)
	subAt := strings.Index(main, `resource "aws_subnet" "a"`)
	if vpcAt == -1 || subAt == -1 {
		t.Fatalf("missing resource blocks; main.tf:\n%s", main)
	}
	if vpcAt > subAt {
		t.Fatalf("vpc must precede the subnet that depends on it; main.tf:\n%s", main)
	}
}

func TestGenerateVariableTypeIsBare(t *testing.T) {
	files, _ := Generate(sampleModel())
	vars := files["variables.tf"]
	if !strings.Contains(norm(vars), "type = string") {
		t.Fatalf("variable type not emitted bare; variables.tf:\n%s", vars)
	}
	if strings.Contains(vars, `"string"`) {
		t.Fatalf("variable type was quoted; variables.tf:\n%s", vars)
	}
	if !strings.Contains(norm(vars), `default = "us-east-1"`) {
		t.Fatalf("variable default missing; variables.tf:\n%s", vars)
	}
}

func TestGenerateProvidersDerivedFromResources(t *testing.T) {
	files, _ := Generate(sampleModel())
	prov := files["providers.tf"]
	if err := Parse("providers.tf", prov); err != nil {
		t.Fatalf("providers.tf invalid: %v", err)
	}
	if !strings.Contains(norm(prov), `source = "hashicorp/aws"`) {
		t.Fatalf("aws provider not derived; providers.tf:\n%s", prov)
	}
	if !strings.Contains(prov, `provider "aws"`) {
		t.Fatalf("aws provider block missing; providers.tf:\n%s", prov)
	}
}

func TestGenerateListWithMixedItems(t *testing.T) {
	vpc := rid("01")
	other := rid("03")
	m := &graph.Model{Resources: []graph.Resource{
		{ID: other, Type: "aws_security_group", Name: "sg", Attributes: map[string]graph.AttrValue{}},
		{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]graph.AttrValue{
			// A list mixing a literal and a reference — the case a naked value
			// type cannot represent.
			"mixed": graph.List(graph.String("static"), graph.Ref(other, "id")),
		}},
	}}
	files, err := Generate(m)
	if err != nil {
		t.Fatal(err)
	}
	main := files["main.tf"]
	if err := Parse("main.tf", main); err != nil {
		t.Fatalf("mixed list produced invalid HCL: %v\n%s", err, main)
	}
	if !strings.Contains(main, `"static"`) || !strings.Contains(main, "aws_security_group.sg.id") {
		t.Fatalf("mixed list not rendered correctly; main.tf:\n%s", main)
	}
}

func TestGenerateDeterministic(t *testing.T) {
	a, _ := Generate(sampleModel())
	b, _ := Generate(sampleModel())
	for name, ca := range a {
		if cb := b[name]; cb != ca {
			t.Fatalf("non-deterministic output for %s:\n--- a ---\n%s\n--- b ---\n%s", name, ca, cb)
		}
	}
}

func TestGenerateRejectsInvalidModel(t *testing.T) {
	m := &graph.Model{Resources: []graph.Resource{
		{ID: "not-a-uuid", Type: "aws_vpc", Name: "main"},
	}}
	if _, err := Generate(m); err == nil {
		t.Fatal("expected Generate to reject an invalid model")
	}
}

func TestGenerateEmptyModel(t *testing.T) {
	files, err := Generate(graph.NewModel())
	if err != nil {
		t.Fatalf("empty model: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("empty model should produce no files, got %v", keys(files))
	}
}

func keys(f Files) []string {
	out := make([]string, 0, len(f))
	for k := range f {
		out = append(out, k)
	}
	return out
}

// norm collapses all runs of whitespace (including newlines) to single spaces,
// so assertions are robust to hclwrite's column alignment of attributes.
func norm(s string) string {
	return strings.Join(strings.Fields(s), " ")
}
