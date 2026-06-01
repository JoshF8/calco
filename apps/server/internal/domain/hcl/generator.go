// Package hcl renders a graph.Model into Terraform configuration files.
//
// It lives in the domain layer: hclwrite is pure token manipulation with no
// I/O, and HCL generation is core product behaviour, not infrastructure. The
// generator is the reason the graph model uses a tagged AttrValue — it needs
// to emit a reference (aws_vpc.main.id) bare and unquoted, distinguish it from
// a string literal, and preserve number precision, none of which a naked
// map[string]any could express.
package hcl

import (
	"fmt"
	"sort"
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"

	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
)

// Files maps a filename (e.g. "main.tf") to its generated HCL content.
type Files map[string]string

// Generate renders a graph.Model into Terraform files.
//
// It runs Model.Validate first and returns that error if the model is not
// generator-safe, so a nil error guarantees the model's invariants hold (no
// dangling references, acyclic, valid identifiers) and the output is
// syntactically valid HCL. Only non-empty files are returned:
//   - main.tf       resources, in dependency (topological) order
//   - providers.tf  a required_providers + provider block per provider prefix
//   - variables.tf  input variables (omitted if there are none)
//   - outputs.tf    outputs (omitted if there are none)
//
// Output is deterministic: attributes within a block are emitted in
// alphabetical order, resources in topological-then-model order.
func Generate(m *graph.Model) (Files, error) {
	if err := m.Validate(); err != nil {
		return nil, fmt.Errorf("hcl: model is not valid: %w", err)
	}

	byID := make(map[graph.ResourceID]*graph.Resource, len(m.Resources))
	for i := range m.Resources {
		byID[m.Resources[i].ID] = &m.Resources[i]
	}

	files := Files{}
	if len(m.Resources) > 0 {
		ordered, err := m.TopologicalSort()
		if err != nil {
			// Unreachable after a successful Validate; kept as a guard.
			return nil, fmt.Errorf("hcl: %w", err)
		}
		files["main.tf"] = renderResources(ordered, byID)
		files["providers.tf"] = renderProviders(m.Resources)
	}
	if len(m.Variables) > 0 {
		files["variables.tf"] = renderVariables(m.Variables, byID)
	}
	if len(m.Outputs) > 0 {
		files["outputs.tf"] = renderOutputs(m.Outputs, byID)
	}
	return files, nil
}

func renderResources(ordered []graph.Resource, byID map[graph.ResourceID]*graph.Resource) string {
	f := hclwrite.NewEmptyFile()
	body := f.Body()
	for i, r := range ordered {
		if i > 0 {
			body.AppendNewline()
		}
		block := body.AppendNewBlock("resource", []string{r.Type, r.Name})
		setAttributes(block.Body(), r.Attributes, byID)
	}
	return string(f.Bytes())
}

func renderProviders(resources []graph.Resource) string {
	prefixes := map[string]bool{}
	for _, r := range resources {
		prefixes[providerPrefix(r.Type)] = true
	}
	sorted := make([]string, 0, len(prefixes))
	for p := range prefixes {
		sorted = append(sorted, p)
	}
	sort.Strings(sorted)

	f := hclwrite.NewEmptyFile()
	body := f.Body()
	tf := body.AppendNewBlock("terraform", nil).Body()
	rp := tf.AppendNewBlock("required_providers", nil).Body()
	for _, p := range sorted {
		rp.SetAttributeValue(p, cty.ObjectVal(map[string]cty.Value{
			"source": cty.StringVal("hashicorp/" + p),
		}))
	}
	for _, p := range sorted {
		body.AppendNewline()
		body.AppendNewBlock("provider", []string{p})
	}
	return string(f.Bytes())
}

func renderVariables(vars []graph.Variable, byID map[graph.ResourceID]*graph.Resource) string {
	f := hclwrite.NewEmptyFile()
	body := f.Body()
	for i, v := range vars {
		if i > 0 {
			body.AppendNewline()
		}
		b := body.AppendNewBlock("variable", []string{v.Name}).Body()
		if v.Type != "" {
			// A variable type is an HCL type expression (string, list(string),
			// ...), emitted bare, not as a quoted string.
			b.SetAttributeRaw("type", hclwrite.Tokens{
				{Type: hclsyntax.TokenIdent, Bytes: []byte(v.Type)},
			})
		}
		if v.Description != "" {
			b.SetAttributeValue("description", cty.StringVal(v.Description))
		}
		if v.Default != nil {
			b.SetAttributeRaw("default", renderValue(*v.Default, byID))
		}
		if v.Sensitive {
			b.SetAttributeValue("sensitive", cty.True)
		}
	}
	return string(f.Bytes())
}

func renderOutputs(outs []graph.Output, byID map[graph.ResourceID]*graph.Resource) string {
	f := hclwrite.NewEmptyFile()
	body := f.Body()
	for i, o := range outs {
		if i > 0 {
			body.AppendNewline()
		}
		b := body.AppendNewBlock("output", []string{o.Name}).Body()
		b.SetAttributeRaw("value", renderValue(o.Value, byID))
		if o.Description != "" {
			b.SetAttributeValue("description", cty.StringVal(o.Description))
		}
		if o.Sensitive {
			b.SetAttributeValue("sensitive", cty.True)
		}
	}
	return string(f.Bytes())
}

func setAttributes(body *hclwrite.Body, attrs map[string]graph.AttrValue, byID map[graph.ResourceID]*graph.Resource) {
	names := make([]string, 0, len(attrs))
	for n := range attrs {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		body.SetAttributeRaw(n, renderValue(attrs[n], byID))
	}
}

// renderValue turns an AttrValue into HCL tokens. Literals become cty values
// (quoted strings, bare numbers/bools), references become bare traversals
// (type.name.attribute), and lists become bracketed tuples — so a list can mix
// literals and references, which is exactly what a naked value type could not.
func renderValue(v graph.AttrValue, byID map[graph.ResourceID]*graph.Resource) hclwrite.Tokens {
	switch v.Kind {
	case graph.KindLiteral:
		return hclwrite.TokensForValue(litToCty(v))
	case graph.KindRef:
		target, ok := byID[v.RefTarget]
		if !ok {
			// Unreachable after Validate; emit null rather than panic.
			return hclwrite.TokensForValue(cty.NullVal(cty.DynamicPseudoType))
		}
		return hclwrite.TokensForTraversal(hcl.Traversal{
			hcl.TraverseRoot{Name: target.Type},
			hcl.TraverseAttr{Name: target.Name},
			hcl.TraverseAttr{Name: v.RefAttribute},
		})
	case graph.KindList:
		items := make([]hclwrite.Tokens, len(v.Items))
		for i, it := range v.Items {
			items[i] = renderValue(it, byID)
		}
		return hclwrite.TokensForTuple(items)
	default:
		return hclwrite.TokensForValue(cty.NullVal(cty.DynamicPseudoType))
	}
}

func litToCty(v graph.AttrValue) cty.Value {
	switch v.LitType {
	case graph.LitString:
		return cty.StringVal(v.Lit)
	case graph.LitBool:
		return cty.BoolVal(v.Lit == "true")
	case graph.LitNumber:
		// ParseNumberVal preserves precision from the canonical text — the
		// whole reason numbers are stored as strings rather than float64.
		n, err := cty.ParseNumberVal(v.Lit)
		if err != nil {
			// Unreachable after Valid(); fall back to a string.
			return cty.StringVal(v.Lit)
		}
		return n
	default:
		return cty.NullVal(cty.DynamicPseudoType)
	}
}

func providerPrefix(resourceType string) string {
	if i := strings.Index(resourceType, "_"); i >= 0 {
		return resourceType[:i]
	}
	return resourceType
}

// Parse re-parses generated HCL to confirm it is syntactically valid. It is
// used by tests (and available to callers) as a cheap correctness gate that
// does not require a terraform binary.
func Parse(filename, content string) error {
	_, diags := hclsyntax.ParseConfig([]byte(content), filename, hcl.Pos{Line: 1, Column: 1})
	if diags.HasErrors() {
		return fmt.Errorf("hcl: %s does not parse: %s", filename, diags.Error())
	}
	return nil
}
