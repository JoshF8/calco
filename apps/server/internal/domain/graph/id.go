package graph

import "github.com/google/uuid"

// ResourceID is an opaque, stable identifier for a resource within a Model.
//
// It is a UUID (v7: time-ordered, collision-free) rather than the Terraform
// address "type.name". Decoupling identity from the address means a user can
// rename a resource (changing its Name slug) without breaking the references
// that point at it — the Ref's target is the ResourceID, not the address.
type ResourceID string

// NewResourceID generates a fresh time-ordered (v7) ResourceID.
func NewResourceID() ResourceID {
	return ResourceID(uuid.Must(uuid.NewV7()).String())
}

// Valid reports whether the ID is a well-formed UUID.
func (id ResourceID) Valid() bool {
	if id == "" {
		return false
	}
	_, err := uuid.Parse(string(id))
	return err == nil
}

// String returns the ID as a string.
func (id ResourceID) String() string { return string(id) }
