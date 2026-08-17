package graph

import (
	"fmt"
	"sort"
)

// DeriveEdges computes the dependency edges implied by the Ref values inside
// resource attributes and nested blocks. This — not the Model.Edges slice — is
// the authoritative dependency information: Edges exist for the canvas and may
// be stale or hand-drawn, whereas a Ref is what the generator actually emits.
//
// One edge is produced per (resource, attribute-or-block, referenced target).
// Edges are returned in a deterministic order: by source resource order in the
// Model, then by attribute name, then by the order refs appear within the
// value; block references follow the resource's attributes (in block order).
func (m *Model) DeriveEdges() []Edge {
	var edges []Edge
	for i := range m.Resources {
		r := &m.Resources[i]
		for _, name := range sortedKeys(r.Attributes) {
			for _, target := range r.Attributes[name].walkRefs(nil) {
				edges = append(edges, Edge{From: r.ID, To: target, Attribute: name})
			}
		}
		for _, b := range r.Blocks {
			for _, target := range b.walkRefs(nil) {
				edges = append(edges, Edge{From: r.ID, To: target, Attribute: b.Type})
			}
		}
	}
	return edges
}

// sortedKeys returns the map keys in lexical order; every place that iterates
// an attribute map goes through here so output and edge derivation are
// deterministic regardless of map iteration order.
func sortedKeys[V any](m map[string]V) []string {
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// CycleError reports a dependency cycle and the resources involved.
type CycleError struct {
	Involved []ResourceID
}

func (e *CycleError) Error() string {
	return fmt.Sprintf("%v: %v", ErrCycle, e.Involved)
}

// Unwrap lets errors.Is(err, ErrCycle) match a *CycleError.
func (e *CycleError) Unwrap() error { return ErrCycle }

// TopologicalSort returns the resources in dependency order — every resource
// appears after all the resources it (transitively) references — which is the
// order in which they can be emitted or created. Ordering is derived from
// Ref values (via DeriveEdges), not from the canvas Edges slice.
//
// Among resources that are mutually independent, the original Model order is
// preserved, so the output is deterministic. If the dependency graph contains
// a cycle, it returns a *CycleError naming the resources that could not be
// ordered (errors.Is(err, ErrCycle) is true).
//
// References to non-existent resources are ignored here (Validate is
// responsible for flagging dangling references); they do not affect ordering.
func (m *Model) TopologicalSort() ([]Resource, error) {
	// index of existing resource IDs → position in m.Resources
	pos := make(map[ResourceID]int, len(m.Resources))
	for i := range m.Resources {
		pos[m.Resources[i].ID] = i
	}

	// depCount[id] = number of distinct existing dependencies id has.
	// dependents[id] = resources that depend on id (to relax on emit).
	depCount := make(map[ResourceID]int, len(m.Resources))
	dependents := make(map[ResourceID][]ResourceID, len(m.Resources))
	seen := make(map[[2]ResourceID]bool) // dedupe (from,to)

	for _, e := range m.DeriveEdges() {
		if _, ok := pos[e.To]; !ok {
			continue // dangling ref — Validate's concern, not ordering's
		}
		key := [2]ResourceID{e.From, e.To}
		if seen[key] {
			continue
		}
		seen[key] = true
		depCount[e.From]++
		dependents[e.To] = append(dependents[e.To], e.From)
	}

	emitted := make(map[ResourceID]bool, len(m.Resources))
	out := make([]Resource, 0, len(m.Resources))

	// Deterministic Kahn: repeatedly emit, in Model order, every not-yet-
	// emitted resource whose dependencies are all already emitted.
	for len(out) < len(m.Resources) {
		progress := false
		for i := range m.Resources {
			r := &m.Resources[i]
			if emitted[r.ID] || depCount[r.ID] > 0 {
				continue
			}
			out = append(out, *r)
			emitted[r.ID] = true
			progress = true
			for _, dep := range dependents[r.ID] {
				depCount[dep]--
			}
		}
		if !progress {
			break
		}
	}

	if len(out) < len(m.Resources) {
		var involved []ResourceID
		for i := range m.Resources {
			if !emitted[m.Resources[i].ID] {
				involved = append(involved, m.Resources[i].ID)
			}
		}
		return nil, &CycleError{Involved: involved}
	}
	return out, nil
}
