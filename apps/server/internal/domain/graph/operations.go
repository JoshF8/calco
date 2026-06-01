package graph

import "fmt"

// FindResource returns a pointer to the resource with the given ID and whether
// it was found. The pointer aliases the Model's backing array; mutating it
// mutates the Model.
func (m *Model) FindResource(id ResourceID) (*Resource, bool) {
	for i := range m.Resources {
		if m.Resources[i].ID == id {
			return &m.Resources[i], true
		}
	}
	return nil, false
}

// FindResourceByAddress returns the resource at address "type.name".
func (m *Model) FindResourceByAddress(typ, name string) (*Resource, bool) {
	for i := range m.Resources {
		if m.Resources[i].Type == typ && m.Resources[i].Name == name {
			return &m.Resources[i], true
		}
	}
	return nil, false
}

// AddResource appends a resource after checking the invariants an addition can
// violate locally: a non-empty ID unique within the Model, and an address
// (type.name) not already taken. It does not run full Model validation.
func (m *Model) AddResource(r Resource) error {
	if r.ID == "" {
		return ErrEmptyID
	}
	if _, exists := m.FindResource(r.ID); exists {
		return fmt.Errorf("%w: %s", ErrDuplicateID, r.ID)
	}
	if _, exists := m.FindResourceByAddress(r.Type, r.Name); exists {
		return fmt.Errorf("%w: %s", ErrDuplicateAddress, r.Address())
	}
	if r.Attributes == nil {
		r.Attributes = map[string]AttrValue{}
	}
	m.Resources = append(m.Resources, r)
	return nil
}

// RemoveResource removes the resource with the given ID and, as a cascade,
// every edge touching it. References to the removed resource that remain in
// other resources' attributes are left intact and become dangling — Validate
// reports them, so the caller can decide how to repair them rather than having
// edits silently mutate unrelated resources.
func (m *Model) RemoveResource(id ResourceID) error {
	idx := -1
	for i := range m.Resources {
		if m.Resources[i].ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return fmt.Errorf("%w: %s", ErrResourceNotFound, id)
	}
	m.Resources = append(m.Resources[:idx], m.Resources[idx+1:]...)

	kept := m.Edges[:0]
	for _, e := range m.Edges {
		if e.From != id && e.To != id {
			kept = append(kept, e)
		}
	}
	m.Edges = kept
	return nil
}

// AddEdge appends a dependency edge after checking both endpoints exist, the
// edge is not a self-loop, and an identical edge does not already exist.
func (m *Model) AddEdge(e Edge) error {
	if e.From == e.To {
		return fmt.Errorf("%w: %s", ErrSelfEdge, e.From)
	}
	if _, ok := m.FindResource(e.From); !ok {
		return fmt.Errorf("%w: from %s", ErrDanglingEdge, e.From)
	}
	if _, ok := m.FindResource(e.To); !ok {
		return fmt.Errorf("%w: to %s", ErrDanglingEdge, e.To)
	}
	for _, existing := range m.Edges {
		if existing == e {
			return fmt.Errorf("%w: %s -> %s (%s)", ErrDuplicateEdge, e.From, e.To, e.Attribute)
		}
	}
	m.Edges = append(m.Edges, e)
	return nil
}

// RemoveEdge removes the first edge equal to e. It is a no-op (returning
// ErrResourceNotFound-free) if no such edge exists; callers that care can
// check the returned bool.
func (m *Model) RemoveEdge(e Edge) bool {
	for i, existing := range m.Edges {
		if existing == e {
			m.Edges = append(m.Edges[:i], m.Edges[i+1:]...)
			return true
		}
	}
	return false
}
