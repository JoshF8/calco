package graph

import "fmt"

// FindResource returns a pointer to the resource with the given ID and whether
// it was found. The pointer aliases the Model's backing array: it is valid for
// inspection and in-place field reads until the next AddResource or
// RemoveResource, which may reallocate or reorder the slice and invalidate it.
// To change a resource's name or attributes safely, prefer RenameResource,
// SetAttribute, and RemoveAttribute, which enforce the Model invariants that a
// raw pointer write would bypass.
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

// RemoveEdge removes the first edge equal to e and reports whether one was
// found and removed.
func (m *Model) RemoveEdge(e Edge) bool {
	for i, existing := range m.Edges {
		if existing == e {
			m.Edges = append(m.Edges[:i], m.Edges[i+1:]...)
			return true
		}
	}
	return false
}

// RenameResource changes a resource's Terraform-name slug, enforcing the same
// validity and address-uniqueness rules as AddResource. Renaming through this
// method — rather than by writing to a FindResource pointer — cannot leave the
// Model with an invalid or colliding address.
func (m *Model) RenameResource(id ResourceID, name string) error {
	r, ok := m.FindResource(id)
	if !ok {
		return fmt.Errorf("%w: %s", ErrResourceNotFound, id)
	}
	if !nameRe.MatchString(name) {
		return fmt.Errorf("%w: %q", ErrInvalidName, name)
	}
	if existing, ok := m.FindResourceByAddress(r.Type, name); ok && existing.ID != id {
		return fmt.Errorf("%w: %s.%s", ErrDuplicateAddress, r.Type, name)
	}
	r.Name = name
	return nil
}

// SetAttribute sets or replaces an attribute on a resource, rejecting values
// that are not internally consistent for their kind.
func (m *Model) SetAttribute(id ResourceID, name string, v AttrValue) error {
	r, ok := m.FindResource(id)
	if !ok {
		return fmt.Errorf("%w: %s", ErrResourceNotFound, id)
	}
	if !v.Valid() {
		return fmt.Errorf("%w: %s.%s", ErrInvalidValue, r.Address(), name)
	}
	if r.Attributes == nil {
		r.Attributes = map[string]AttrValue{}
	}
	r.Attributes[name] = v
	return nil
}

// RemoveAttribute deletes an attribute from a resource. Deleting an absent
// attribute is a no-op.
func (m *Model) RemoveAttribute(id ResourceID, name string) error {
	r, ok := m.FindResource(id)
	if !ok {
		return fmt.Errorf("%w: %s", ErrResourceNotFound, id)
	}
	delete(r.Attributes, name)
	return nil
}
