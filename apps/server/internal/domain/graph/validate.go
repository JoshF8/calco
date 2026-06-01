package graph

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
)

// Terraform identifiers (resource names, variable/output names) must start
// with a letter or underscore and contain only letters, digits, underscores,
// and hyphens.
var nameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]*$`)

// Terraform resource types are lowercase snake-case, e.g. "aws_vpc".
var typeRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// Validate checks every Model invariant and returns all violations joined
// into a single error (errors.Is matches each underlying sentinel). A nil
// return means the Model is safe to hand to the HCL generator.
//
// Invariants:
//   - each resource has a valid UUID ID, a valid type, and a valid name slug;
//   - resource IDs are unique and addresses (type.name) are unique;
//   - every attribute key is a valid identifier, every attribute value is
//     internally consistent, and every reference points at an existing
//     resource;
//   - every edge connects two existing resources, is not a self-loop, and is
//     not a duplicate of another edge;
//   - variable and output names are valid identifiers and unique, variable
//     types are non-empty, and variable defaults are literal constants (they
//     may not reference resources, matching Terraform);
//   - the dependency graph (derived from references) is acyclic.
func (m *Model) Validate() error {
	var errs []error

	ids := make(map[ResourceID]bool, len(m.Resources))
	addrs := make(map[string]bool, len(m.Resources))

	for i := range m.Resources {
		r := &m.Resources[i]

		switch {
		case r.ID == "":
			errs = append(errs, ErrEmptyID)
		case !r.ID.Valid():
			errs = append(errs, fmt.Errorf("%w: %s", ErrInvalidID, r.ID))
		case ids[r.ID]:
			errs = append(errs, fmt.Errorf("%w: %s", ErrDuplicateID, r.ID))
		default:
			ids[r.ID] = true
		}

		if r.Type == "" {
			errs = append(errs, fmt.Errorf("%w: resource %s", ErrEmptyType, r.ID))
		} else if !typeRe.MatchString(r.Type) {
			errs = append(errs, fmt.Errorf("%w: %q", ErrInvalidType, r.Type))
		}

		if !nameRe.MatchString(r.Name) {
			errs = append(errs, fmt.Errorf("%w: %q", ErrInvalidName, r.Name))
		}

		if r.Type != "" && nameRe.MatchString(r.Name) {
			addr := r.Address()
			if addrs[addr] {
				errs = append(errs, fmt.Errorf("%w: %s", ErrDuplicateAddress, addr))
			}
			addrs[addr] = true
		}

		// Attribute values: well-formed for their kind.
		names := make([]string, 0, len(r.Attributes))
		for name := range r.Attributes {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			// Attribute keys are emitted as bare HCL argument names with no
			// escaping, so they must be valid identifiers.
			if !nameRe.MatchString(name) {
				errs = append(errs, fmt.Errorf("%w: attribute key %q on %s", ErrInvalidName, name, r.Address()))
			}
			if !r.Attributes[name].Valid() {
				errs = append(errs, fmt.Errorf("%w: %s.%s", ErrInvalidValue, r.Address(), name))
			}
		}
	}

	// References (in attributes, outputs, variable defaults) must resolve.
	for i := range m.Resources {
		r := &m.Resources[i]
		names := make([]string, 0, len(r.Attributes))
		for name := range r.Attributes {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			for _, target := range r.Attributes[name].walkRefs(nil) {
				if !ids[target] {
					errs = append(errs, fmt.Errorf("%w: %s.%s -> %s", ErrDanglingReference, r.Address(), name, target))
				}
			}
		}
	}

	// Edges: endpoints exist, no self-loop, no duplicates (matching AddEdge).
	seenEdges := make(map[Edge]bool, len(m.Edges))
	for _, e := range m.Edges {
		if seenEdges[e] {
			errs = append(errs, fmt.Errorf("%w: %s -> %s (%s)", ErrDuplicateEdge, e.From, e.To, e.Attribute))
		}
		seenEdges[e] = true
		if e.From == e.To {
			errs = append(errs, fmt.Errorf("%w: %s", ErrSelfEdge, e.From))
			continue
		}
		if !ids[e.From] {
			errs = append(errs, fmt.Errorf("%w: from %s", ErrDanglingEdge, e.From))
		}
		if !ids[e.To] {
			errs = append(errs, fmt.Errorf("%w: to %s", ErrDanglingEdge, e.To))
		}
	}

	// Variables: valid unique names, non-empty types, literal defaults.
	varNames := make(map[string]bool, len(m.Variables))
	for _, v := range m.Variables {
		if !nameRe.MatchString(v.Name) {
			errs = append(errs, fmt.Errorf("%w: variable %q", ErrInvalidName, v.Name))
		}
		if varNames[v.Name] {
			errs = append(errs, fmt.Errorf("%w: %s", ErrDuplicateVariable, v.Name))
		}
		varNames[v.Name] = true
		if v.Type == "" {
			errs = append(errs, fmt.Errorf("%w: variable %s", ErrEmptyType, v.Name))
		}
		if v.Default != nil {
			if !v.Default.Valid() {
				errs = append(errs, fmt.Errorf("%w: variable %s default", ErrInvalidValue, v.Name))
			}
			// Terraform variable defaults must be literal constants — they
			// cannot reference resources.
			if len(v.Default.walkRefs(nil)) > 0 {
				errs = append(errs, fmt.Errorf("%w: variable %s default must not reference a resource", ErrInvalidValue, v.Name))
			}
		}
	}

	// Outputs: valid unique names, valid values, resolvable references.
	outNames := make(map[string]bool, len(m.Outputs))
	for _, o := range m.Outputs {
		if !nameRe.MatchString(o.Name) {
			errs = append(errs, fmt.Errorf("%w: output %q", ErrInvalidName, o.Name))
		}
		if outNames[o.Name] {
			errs = append(errs, fmt.Errorf("%w: %s", ErrDuplicateOutput, o.Name))
		}
		outNames[o.Name] = true
		if !o.Value.Valid() {
			errs = append(errs, fmt.Errorf("%w: output %s", ErrInvalidValue, o.Name))
		}
		for _, target := range o.Value.walkRefs(nil) {
			if !ids[target] {
				errs = append(errs, fmt.Errorf("%w: output %s -> %s", ErrDanglingReference, o.Name, target))
			}
		}
	}

	// Dependency graph must be acyclic. Only meaningful once references
	// resolve; if there are already dangling refs the cycle check still runs
	// over the resolvable subset, which is harmless.
	if _, err := m.TopologicalSort(); err != nil {
		errs = append(errs, err)
	}

	return errors.Join(errs...)
}
