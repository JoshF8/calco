// Package graph is the pure-domain model of an infrastructure design.
//
// A Model is the single source of truth that the canvas, the HCL generator,
// and the brownfield importer all pivot on. This package has no I/O and no
// framework dependencies: it is types and pure functions, exercised by
// table-driven tests without mocks.
//
// The central design choice is AttrValue (see value.go): resource attributes
// are a tagged union, not a naked map[string]any, so the HCL generator can
// distinguish a literal string from a bare reference expression
// (aws_vpc.main.id) and preserve number precision across JSON round-trips.
package graph

import "errors"

// Sentinel errors returned by operations and surfaced (joined) by Validate.
var (
	ErrEmptyID           = errors.New("graph: empty ID")
	ErrInvalidID         = errors.New("graph: invalid ID (not a valid UUID)")
	ErrEmptyType         = errors.New("graph: empty type")
	ErrInvalidType       = errors.New("graph: invalid type")
	ErrInvalidName       = errors.New("graph: invalid name (not a valid Terraform identifier)")
	ErrDuplicateID       = errors.New("graph: duplicate resource ID")
	ErrDuplicateAddress  = errors.New("graph: duplicate resource address (type.name)")
	ErrResourceNotFound  = errors.New("graph: resource not found")
	ErrDanglingReference = errors.New("graph: attribute references a resource that does not exist")
	ErrDanglingEdge      = errors.New("graph: edge endpoint does not exist")
	ErrSelfEdge          = errors.New("graph: edge connects a resource to itself")
	ErrDuplicateEdge     = errors.New("graph: duplicate edge")
	ErrCycle             = errors.New("graph: dependency cycle")
	ErrInvalidValue      = errors.New("graph: invalid attribute value")
	ErrDuplicateVariable = errors.New("graph: duplicate variable name")
	ErrDuplicateOutput   = errors.New("graph: duplicate output name")
)
