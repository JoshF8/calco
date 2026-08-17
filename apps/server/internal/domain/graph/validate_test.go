package graph

import (
	"errors"
	"testing"
)

// validModel returns a small, fully-valid model: a VPC and a subnet that
// references it.
func validModel() *Model {
	vpc := rid("01")
	sub := rid("02")
	return &Model{
		Resources: []Resource{
			{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]AttrValue{
				"cidr_block": String("10.0.0.0/16"),
			}},
			{ID: sub, Type: "aws_subnet", Name: "a", Attributes: map[string]AttrValue{
				"vpc_id":     Ref(vpc, "id"),
				"cidr_block": String("10.0.1.0/24"),
			}},
		},
		Edges: []Edge{{From: sub, To: vpc, Attribute: "vpc_id"}},
		Outputs: []Output{
			{Name: "vpc_id", Value: Ref(vpc, "id")},
		},
	}
}

func TestValidateValidModel(t *testing.T) {
	if err := validModel().Validate(); err != nil {
		t.Fatalf("valid model rejected: %v", err)
	}
}

func TestValidateFailures(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(m *Model)
		wantErr error
	}{
		{"empty id", func(m *Model) { m.Resources[0].ID = "" }, ErrEmptyID},
		{"invalid id", func(m *Model) { m.Resources[0].ID = "not-a-uuid" }, ErrInvalidID},
		{"empty type", func(m *Model) { m.Resources[0].Type = "" }, ErrEmptyType},
		{"invalid type", func(m *Model) { m.Resources[0].Type = "AWS-VPC" }, ErrInvalidType},
		{"invalid name", func(m *Model) { m.Resources[0].Name = "1bad name" }, ErrInvalidName},
		{"duplicate id", func(m *Model) { m.Resources[1].ID = m.Resources[0].ID }, ErrDuplicateID},
		{
			"duplicate address",
			func(m *Model) {
				m.Resources[1].Type = m.Resources[0].Type
				m.Resources[1].Name = m.Resources[0].Name
			},
			ErrDuplicateAddress,
		},
		{
			"dangling reference",
			func(m *Model) { m.Resources[1].Attributes["vpc_id"] = Ref(rid("ff"), "id") },
			ErrDanglingReference,
		},
		{
			"dangling edge",
			func(m *Model) { m.Edges = append(m.Edges, Edge{From: m.Resources[0].ID, To: rid("ff")}) },
			ErrDanglingEdge,
		},
		{
			"self edge",
			func(m *Model) { m.Edges = append(m.Edges, Edge{From: m.Resources[0].ID, To: m.Resources[0].ID}) },
			ErrSelfEdge,
		},
		{
			"invalid value",
			func(m *Model) {
				m.Resources[0].Attributes["bad"] = AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "xyz"}
			},
			ErrInvalidValue,
		},
		{
			"duplicate variable",
			func(m *Model) {
				m.Variables = []Variable{{Name: "region", Type: "string"}, {Name: "region", Type: "string"}}
			},
			ErrDuplicateVariable,
		},
		{
			"duplicate output",
			func(m *Model) {
				m.Outputs = append(m.Outputs, Output{Name: "vpc_id", Value: String("x")})
			},
			ErrDuplicateOutput,
		},
		{
			"dangling output reference",
			func(m *Model) { m.Outputs[0].Value = Ref(rid("ff"), "id") },
			ErrDanglingReference,
		},
		{
			"cycle",
			func(m *Model) {
				m.Resources[0].Attributes["back"] = Ref(m.Resources[1].ID, "id")
			},
			ErrCycle,
		},
		{
			"invalid variable name",
			func(m *Model) { m.Variables = []Variable{{Name: "1bad", Type: "string"}} },
			ErrInvalidName,
		},
		{
			"empty variable type",
			func(m *Model) { m.Variables = []Variable{{Name: "region", Type: ""}} },
			ErrEmptyType,
		},
		{
			"variable default references a resource",
			func(m *Model) {
				d := Ref(m.Resources[0].ID, "id")
				m.Variables = []Variable{{Name: "v", Type: "string", Default: &d}}
			},
			ErrInvalidValue,
		},
		{
			"invalid output name",
			func(m *Model) { m.Outputs = append(m.Outputs, Output{Name: "1bad", Value: String("x")}) },
			ErrInvalidName,
		},
		{
			"duplicate edge",
			func(m *Model) { m.Edges = append(m.Edges, m.Edges[0]) },
			ErrDuplicateEdge,
		},
		{
			"injection via attribute key",
			func(m *Model) {
				m.Resources[0].Attributes["x\"\n  injected = \"y"] = String("z")
			},
			ErrInvalidName,
		},
		{
			"injection via block type",
			func(m *Model) {
				m.Resources[0].Blocks = []Block{{Type: "x\"\n  injected = \"y"}}
			},
			ErrInvalidName,
		},
		{
			"dangling reference inside block",
			func(m *Model) {
				m.Resources[0].Blocks = []Block{{Type: "ingress", Attributes: map[string]AttrValue{
					"vpc_id": Ref(rid("ff"), "id"),
				}}}
			},
			ErrDanglingReference,
		},
		{
			"invalid value inside block",
			func(m *Model) {
				m.Resources[0].Blocks = []Block{{Type: "ingress", Attributes: map[string]AttrValue{
					"from_port": AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "xyz"},
				}}}
			},
			ErrInvalidValue,
		},
		{
			"cycle through a block",
			func(m *Model) {
				// subnet's vpc_id (existing) plus a block ref back on the vpc:
				// vpc → subnet (through block), subnet → vpc (attribute).
				m.Resources[0].Blocks = []Block{{Type: "rule", Attributes: map[string]AttrValue{
					"target": Ref(m.Resources[1].ID, "id"),
				}}}
			},
			ErrCycle,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := validModel()
			tc.mutate(m)
			err := m.Validate()
			if err == nil {
				t.Fatalf("expected error %v, got nil", tc.wantErr)
			}
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want errors.Is %v", err, tc.wantErr)
			}
		})
	}
}

func TestValidateAggregatesMultiple(t *testing.T) {
	m := validModel()
	m.Resources[0].Type = ""         // ErrEmptyType
	m.Resources[1].Name = "bad name" // ErrInvalidName
	err := m.Validate()
	if !errors.Is(err, ErrEmptyType) || !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected both errors joined, got: %v", err)
	}
}
