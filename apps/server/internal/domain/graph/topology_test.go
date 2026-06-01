package graph

import (
	"errors"
	"testing"
)

// rid builds a valid UUID-shaped ResourceID from a 2-hex-digit suffix, so
// tests have stable IDs (ordering assertions need determinism).
func rid(suffix string) ResourceID {
	return ResourceID("0192f8a0-0000-7000-8000-0000000000" + suffix)
}

// res builds a resource whose attributes reference the given targets via an
// attribute named "ref_N" each.
func res(id ResourceID, typ, name string, refs ...ResourceID) Resource {
	attrs := map[string]AttrValue{}
	for i, target := range refs {
		attrs[string(rune('a'+i))+"_ref"] = Ref(target, "id")
	}
	return Resource{ID: id, Type: typ, Name: name, Attributes: attrs}
}

func order(rs []Resource) []ResourceID {
	out := make([]ResourceID, len(rs))
	for i, r := range rs {
		out[i] = r.ID
	}
	return out
}

func TestTopologicalSortLinear(t *testing.T) {
	a, b, c := rid("0a"), rid("0b"), rid("0c")
	m := &Model{Resources: []Resource{
		res(c, "aws_route", "r", b),  // c depends on b
		res(b, "aws_subnet", "s", a), // b depends on a
		res(a, "aws_vpc", "v"),       // a depends on nothing
	}}
	got, err := m.TopologicalSort()
	if err != nil {
		t.Fatal(err)
	}
	ids := order(got)
	assertBefore(t, ids, a, b)
	assertBefore(t, ids, b, c)
}

func TestTopologicalSortDiamond(t *testing.T) {
	vpc, sub1, sub2, rt := rid("01"), rid("02"), rid("03"), rid("04")
	m := &Model{Resources: []Resource{
		res(vpc, "aws_vpc", "main"),
		res(sub1, "aws_subnet", "a", vpc),
		res(sub2, "aws_subnet", "b", vpc),
		res(rt, "aws_route_table", "rt", sub1, sub2),
	}}
	got, err := m.TopologicalSort()
	if err != nil {
		t.Fatal(err)
	}
	ids := order(got)
	assertBefore(t, ids, vpc, sub1)
	assertBefore(t, ids, vpc, sub2)
	assertBefore(t, ids, sub1, rt)
	assertBefore(t, ids, sub2, rt)
}

func TestTopologicalSortIndependentPreservesModelOrder(t *testing.T) {
	a, b, c := rid("0a"), rid("0b"), rid("0c")
	m := &Model{Resources: []Resource{
		res(a, "aws_s3_bucket", "a"),
		res(b, "aws_s3_bucket", "b"),
		res(c, "aws_s3_bucket", "c"),
	}}
	got, err := m.TopologicalSort()
	if err != nil {
		t.Fatal(err)
	}
	want := []ResourceID{a, b, c}
	for i := range want {
		if got[i].ID != want[i] {
			t.Fatalf("order = %v, want model order %v", order(got), want)
		}
	}
}

func TestTopologicalSortCycle(t *testing.T) {
	a, b := rid("0a"), rid("0b")
	m := &Model{Resources: []Resource{
		res(a, "aws_x", "a", b),
		res(b, "aws_x", "b", a),
	}}
	_, err := m.TopologicalSort()
	if err == nil {
		t.Fatal("expected cycle error")
	}
	if !errors.Is(err, ErrCycle) {
		t.Fatalf("err = %v, want errors.Is ErrCycle", err)
	}
	var ce *CycleError
	if !errors.As(err, &ce) {
		t.Fatalf("err = %v, want *CycleError", err)
	}
	if len(ce.Involved) != 2 {
		t.Fatalf("involved = %v, want both resources", ce.Involved)
	}
}

func TestTopologicalSortDanglingRefIgnored(t *testing.T) {
	a := rid("0a")
	missing := rid("ff")
	m := &Model{Resources: []Resource{
		res(a, "aws_vpc", "v", missing), // references a resource not in the model
	}}
	got, err := m.TopologicalSort()
	if err != nil {
		t.Fatalf("dangling ref should not break ordering: %v", err)
	}
	if len(got) != 1 || got[0].ID != a {
		t.Fatalf("got %v, want [%s]", order(got), a)
	}
}

func TestDeriveEdgesDeterministic(t *testing.T) {
	a, b, c := rid("0a"), rid("0b"), rid("0c")
	r := Resource{ID: a, Type: "aws_x", Name: "x", Attributes: map[string]AttrValue{
		"z_attr": Ref(c, "id"),
		"a_attr": Ref(b, "id"),
	}}
	m := &Model{Resources: []Resource{r}}
	e1 := m.DeriveEdges()
	e2 := m.DeriveEdges()
	if len(e1) != 2 {
		t.Fatalf("got %d edges, want 2", len(e1))
	}
	// Sorted by attribute name: a_attr before z_attr.
	if e1[0].Attribute != "a_attr" || e1[1].Attribute != "z_attr" {
		t.Fatalf("edges not in attribute order: %+v", e1)
	}
	for i := range e1 {
		if e1[i] != e2[i] {
			t.Fatalf("DeriveEdges not deterministic: %+v vs %+v", e1, e2)
		}
	}
}

func assertBefore(t *testing.T, ids []ResourceID, first, second ResourceID) {
	t.Helper()
	fi, si := -1, -1
	for i, id := range ids {
		if id == first {
			fi = i
		}
		if id == second {
			si = i
		}
	}
	if fi == -1 || si == -1 {
		t.Fatalf("missing ids in %v (want %s before %s)", ids, first, second)
	}
	if fi >= si {
		t.Fatalf("order %v: %s must come before %s", ids, first, second)
	}
}
