package graph

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestAddResource(t *testing.T) {
	m := NewModel()
	a := Resource{ID: rid("01"), Type: "aws_vpc", Name: "main"}

	if err := m.AddResource(a); err != nil {
		t.Fatalf("first add: %v", err)
	}
	if len(m.Resources) != 1 {
		t.Fatalf("want 1 resource, got %d", len(m.Resources))
	}
	// Attributes should be initialized to non-nil.
	if m.Resources[0].Attributes == nil {
		t.Fatal("attributes not initialized")
	}

	if err := m.AddResource(Resource{ID: "", Type: "aws_vpc", Name: "x"}); !errors.Is(err, ErrEmptyID) {
		t.Fatalf("empty id: err = %v", err)
	}
	if err := m.AddResource(Resource{ID: rid("01"), Type: "aws_s3_bucket", Name: "b"}); !errors.Is(err, ErrDuplicateID) {
		t.Fatalf("dup id: err = %v", err)
	}
	if err := m.AddResource(Resource{ID: rid("02"), Type: "aws_vpc", Name: "main"}); !errors.Is(err, ErrDuplicateAddress) {
		t.Fatalf("dup address: err = %v", err)
	}
}

func TestRemoveResourceCascadesEdges(t *testing.T) {
	vpc, sub := rid("01"), rid("02")
	m := &Model{
		Resources: []Resource{
			{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]AttrValue{}},
			{ID: sub, Type: "aws_subnet", Name: "a", Attributes: map[string]AttrValue{"vpc_id": Ref(vpc, "id")}},
		},
		Edges: []Edge{{From: sub, To: vpc, Attribute: "vpc_id"}},
	}

	if err := m.RemoveResource(vpc); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if len(m.Resources) != 1 || m.Resources[0].ID != sub {
		t.Fatalf("vpc not removed cleanly: %v", order(m.Resources))
	}
	if len(m.Edges) != 0 {
		t.Fatalf("edges touching removed resource not cascaded: %+v", m.Edges)
	}
	// The dangling reference in the subnet is intentionally left for Validate
	// to surface, not silently mutated.
	if _, ok := m.Resources[0].Attributes["vpc_id"]; !ok {
		t.Fatal("reference was silently removed; expected it to remain dangling")
	}
	if !errors.Is(m.Validate(), ErrDanglingReference) {
		t.Fatal("expected validate to flag the dangling reference")
	}
}

func TestRemoveResourceNotFound(t *testing.T) {
	m := NewModel()
	if err := m.RemoveResource(rid("99")); !errors.Is(err, ErrResourceNotFound) {
		t.Fatalf("err = %v, want ErrResourceNotFound", err)
	}
}

func TestFindResource(t *testing.T) {
	vpc := rid("01")
	m := &Model{Resources: []Resource{{ID: vpc, Type: "aws_vpc", Name: "main"}}}

	if r, ok := m.FindResource(vpc); !ok || r.ID != vpc {
		t.Fatal("FindResource miss")
	}
	if _, ok := m.FindResource(rid("99")); ok {
		t.Fatal("FindResource false hit")
	}
	if r, ok := m.FindResourceByAddress("aws_vpc", "main"); !ok || r.ID != vpc {
		t.Fatal("FindResourceByAddress miss")
	}
	if _, ok := m.FindResourceByAddress("aws_vpc", "other"); ok {
		t.Fatal("FindResourceByAddress false hit")
	}
}

// FindResource returns a live pointer; mutating it mutates the Model.
func TestFindResourceReturnsLivePointer(t *testing.T) {
	vpc := rid("01")
	m := &Model{Resources: []Resource{{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]AttrValue{}}}}
	r, _ := m.FindResource(vpc)
	r.Attributes["cidr_block"] = String("10.0.0.0/16")
	if _, ok := m.Resources[0].Attributes["cidr_block"]; !ok {
		t.Fatal("mutation through pointer did not reach the model")
	}
}

func TestAddEdge(t *testing.T) {
	a, b := rid("01"), rid("02")
	m := &Model{Resources: []Resource{
		{ID: a, Type: "aws_vpc", Name: "v"},
		{ID: b, Type: "aws_subnet", Name: "s"},
	}}

	if err := m.AddEdge(Edge{From: b, To: a, Attribute: "vpc_id"}); err != nil {
		t.Fatalf("valid edge: %v", err)
	}
	if err := m.AddEdge(Edge{From: a, To: a}); !errors.Is(err, ErrSelfEdge) {
		t.Fatalf("self edge: err = %v", err)
	}
	if err := m.AddEdge(Edge{From: a, To: rid("99")}); !errors.Is(err, ErrDanglingEdge) {
		t.Fatalf("dangling to: err = %v", err)
	}
	if err := m.AddEdge(Edge{From: rid("99"), To: a}); !errors.Is(err, ErrDanglingEdge) {
		t.Fatalf("dangling from: err = %v", err)
	}
	if err := m.AddEdge(Edge{From: b, To: a, Attribute: "vpc_id"}); !errors.Is(err, ErrDuplicateEdge) {
		t.Fatalf("dup edge: err = %v", err)
	}
}

func TestRemoveEdge(t *testing.T) {
	a, b := rid("01"), rid("02")
	e := Edge{From: b, To: a, Attribute: "vpc_id"}
	m := &Model{
		Resources: []Resource{{ID: a, Type: "aws_vpc", Name: "v"}, {ID: b, Type: "aws_subnet", Name: "s"}},
		Edges:     []Edge{e},
	}
	if !m.RemoveEdge(e) {
		t.Fatal("RemoveEdge returned false for existing edge")
	}
	if len(m.Edges) != 0 {
		t.Fatalf("edge not removed: %+v", m.Edges)
	}
	if m.RemoveEdge(e) {
		t.Fatal("RemoveEdge returned true for absent edge")
	}
}

// A whole Model must survive a JSON round-trip — this is the persistence and
// REST-transport contract, and the place a naked map would corrupt numbers.
func TestModelJSONRoundTrip(t *testing.T) {
	m := validModel()
	m.Resources[0].Attributes["int_attr"] = Int(65535)
	m.Resources[0].Position = Position{X: 12.5, Y: -3.25}

	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got Model
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if err := got.Validate(); err != nil {
		t.Fatalf("round-tripped model invalid: %v", err)
	}
	iv := got.Resources[0].Attributes["int_attr"]
	if iv.LitType != LitNumber || iv.Lit != "65535" {
		t.Fatalf("int attribute corrupted across JSON: %+v", iv)
	}
	if got.Resources[0].Position.X != 12.5 || got.Resources[0].Position.Y != -3.25 {
		t.Fatalf("position corrupted: %+v", got.Resources[0].Position)
	}
}
