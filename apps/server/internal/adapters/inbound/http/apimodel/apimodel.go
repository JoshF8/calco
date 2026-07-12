// Package apimodel holds the HTTP wire types for the graph model and their
// conversion to the domain.
//
// The domain graph types are not used directly as request/response bodies for
// two reasons: (1) keeping the domain free of the HTTP framework (Huma)
// preserves hexagonal purity, and (2) graph.AttrValue has custom JSON
// marshaling (a discriminated union) that Huma's struct reflection would not
// describe correctly, so the generated OpenAPI — and the TypeScript types
// derived from it — would not match the real wire shape. These DTOs mirror the
// exact wire shape with Huma tags, and ToDomain converts them.
package apimodel

import "github.com/JoshF8/calco/apps/server/internal/domain/graph"

// AttrValue is the wire form of graph.AttrValue: a tagged union keyed on Kind.
// Exactly one variant's fields are meaningful.
type AttrValue struct {
	Kind      string      `json:"kind" enum:"literal,ref,list" doc:"Value variant: literal scalar, reference to another resource, or list."`
	LitType   string      `json:"litType,omitempty" enum:"string,number,bool" doc:"Scalar type (when kind=literal)."`
	Value     *string     `json:"value,omitempty" doc:"Canonical literal text (when kind=literal); numbers are kept as text to preserve precision."`
	Target    string      `json:"target,omitempty" doc:"Referenced resource ID (when kind=ref)."`
	Attribute string      `json:"attribute,omitempty" doc:"Referenced attribute name (when kind=ref), emitted bare in HCL."`
	Items     []AttrValue `json:"items,omitempty" doc:"Child values (when kind=list)."`
}

func (v AttrValue) toDomain() graph.AttrValue {
	switch v.Kind {
	case string(graph.KindLiteral):
		lit := ""
		if v.Value != nil {
			lit = *v.Value
		}
		return graph.AttrValue{Kind: graph.KindLiteral, LitType: graph.LitType(v.LitType), Lit: lit}
	case string(graph.KindRef):
		return graph.AttrValue{Kind: graph.KindRef, RefTarget: graph.ResourceID(v.Target), RefAttribute: v.Attribute}
	case string(graph.KindList):
		items := make([]graph.AttrValue, len(v.Items))
		for i, it := range v.Items {
			items[i] = it.toDomain()
		}
		return graph.AttrValue{Kind: graph.KindList, Items: items}
	default:
		// Preserve the unknown kind so Model.Validate rejects it rather than
		// silently coercing to a default.
		return graph.AttrValue{Kind: graph.ValueKind(v.Kind)}
	}
}

// Position is the wire form of graph.Position.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Resource is the wire form of graph.Resource. Attributes and Position are
// optional: a resource may have no arguments, and Position is canvas-only
// (the generator ignores it).
type Resource struct {
	ID         string               `json:"id" doc:"Stable internal resource ID (UUID)."`
	Type       string               `json:"type" example:"aws_vpc" doc:"Terraform resource type."`
	Name       string               `json:"name" example:"main" doc:"Terraform name slug."`
	Attributes map[string]AttrValue `json:"attributes,omitempty"`
	Position   *Position            `json:"position,omitempty"`
}

// Edge is the wire form of graph.Edge.
type Edge struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Attribute string `json:"attribute"`
}

// Variable is the wire form of graph.Variable.
type Variable struct {
	Name        string     `json:"name"`
	Type        string     `json:"type" example:"string"`
	Default     *AttrValue `json:"default,omitempty"`
	Description string     `json:"description,omitempty"`
	Sensitive   bool       `json:"sensitive,omitempty"`
}

// Output is the wire form of graph.Output.
type Output struct {
	Name        string    `json:"name"`
	Value       AttrValue `json:"value"`
	Description string    `json:"description,omitempty"`
	Sensitive   bool      `json:"sensitive,omitempty"`
}

// Model is the wire form of graph.Model. Every collection is optional: an
// empty model is valid (it simply yields no files), and a model may contain
// only resources.
type Model struct {
	Resources []Resource `json:"resources,omitempty"`
	Edges     []Edge     `json:"edges,omitempty"`
	Variables []Variable `json:"variables,omitempty"`
	Outputs   []Output   `json:"outputs,omitempty"`
}

// ToDomain converts the wire model into a domain graph.Model. It performs no
// validation; callers run Model.Validate (Generate does this).
func (m Model) ToDomain() *graph.Model {
	out := &graph.Model{
		Resources: make([]graph.Resource, len(m.Resources)),
		Edges:     make([]graph.Edge, len(m.Edges)),
		Variables: make([]graph.Variable, len(m.Variables)),
		Outputs:   make([]graph.Output, len(m.Outputs)),
	}
	for i, r := range m.Resources {
		attrs := make(map[string]graph.AttrValue, len(r.Attributes))
		for k, v := range r.Attributes {
			attrs[k] = v.toDomain()
		}
		pos := graph.Position{}
		if r.Position != nil {
			pos = graph.Position{X: r.Position.X, Y: r.Position.Y}
		}
		out.Resources[i] = graph.Resource{
			ID:         graph.ResourceID(r.ID),
			Type:       r.Type,
			Name:       r.Name,
			Attributes: attrs,
			Position:   pos,
		}
	}
	for i, e := range m.Edges {
		out.Edges[i] = graph.Edge{From: graph.ResourceID(e.From), To: graph.ResourceID(e.To), Attribute: e.Attribute}
	}
	for i, v := range m.Variables {
		var def *graph.AttrValue
		if v.Default != nil {
			d := v.Default.toDomain()
			def = &d
		}
		out.Variables[i] = graph.Variable{
			Name:        v.Name,
			Type:        v.Type,
			Default:     def,
			Description: v.Description,
			Sensitive:   v.Sensitive,
		}
	}
	for i, o := range m.Outputs {
		out.Outputs[i] = graph.Output{
			Name:        o.Name,
			Value:       o.Value.toDomain(),
			Description: o.Description,
			Sensitive:   o.Sensitive,
		}
	}
	return out
}

func attrValueFromDomain(v graph.AttrValue) AttrValue {
	switch v.Kind {
	case graph.KindLiteral:
		lit := v.Lit
		return AttrValue{Kind: string(graph.KindLiteral), LitType: string(v.LitType), Value: &lit}
	case graph.KindRef:
		return AttrValue{Kind: string(graph.KindRef), Target: string(v.RefTarget), Attribute: v.RefAttribute}
	case graph.KindList:
		items := make([]AttrValue, len(v.Items))
		for i, it := range v.Items {
			items[i] = attrValueFromDomain(it)
		}
		return AttrValue{Kind: string(graph.KindList), Items: items}
	default:
		// Preserve an unknown kind rather than coercing it to a default.
		return AttrValue{Kind: string(v.Kind)}
	}
}

// FromDomain converts a domain model into the wire model — the inverse of
// ToDomain — so a server-built model (e.g. from the importer) can be returned
// to clients in the exact shape the frontend already consumes. Position is
// emitted only when set: an imported model has no canvas coordinates, and the
// client lays it out.
func FromDomain(m *graph.Model) Model {
	out := Model{
		Resources: make([]Resource, len(m.Resources)),
		Edges:     make([]Edge, len(m.Edges)),
		Variables: make([]Variable, len(m.Variables)),
		Outputs:   make([]Output, len(m.Outputs)),
	}
	for i := range m.Resources {
		r := m.Resources[i]
		attrs := make(map[string]AttrValue, len(r.Attributes))
		for k, v := range r.Attributes {
			attrs[k] = attrValueFromDomain(v)
		}
		var pos *Position
		if r.Position != (graph.Position{}) {
			pos = &Position{X: r.Position.X, Y: r.Position.Y}
		}
		out.Resources[i] = Resource{
			ID:         string(r.ID),
			Type:       r.Type,
			Name:       r.Name,
			Attributes: attrs,
			Position:   pos,
		}
	}
	for i, e := range m.Edges {
		out.Edges[i] = Edge{From: string(e.From), To: string(e.To), Attribute: e.Attribute}
	}
	for i, v := range m.Variables {
		var def *AttrValue
		if v.Default != nil {
			d := attrValueFromDomain(*v.Default)
			def = &d
		}
		out.Variables[i] = Variable{
			Name:        v.Name,
			Type:        v.Type,
			Default:     def,
			Description: v.Description,
			Sensitive:   v.Sensitive,
		}
	}
	for i, o := range m.Outputs {
		out.Outputs[i] = Output{
			Name:        o.Name,
			Value:       attrValueFromDomain(o.Value),
			Description: o.Description,
			Sensitive:   o.Sensitive,
		}
	}
	return out
}
