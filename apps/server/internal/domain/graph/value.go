package graph

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
)

// numberRe matches a finite decimal number. strconv.ParseFloat alone would
// also accept "Inf", "NaN", hex floats ("0x1p4"), and a leading '+', none of
// which are valid HCL numbers.
var numberRe = regexp.MustCompile(`^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$`)

// ValueKind tags the variant of an AttrValue.
type ValueKind string

const (
	// KindLiteral is a concrete scalar: a string, number, or bool.
	KindLiteral ValueKind = "literal"
	// KindRef is a reference to another resource's attribute. In HCL it is
	// emitted bare/unquoted as <type>.<name>.<attribute> and is load-bearing
	// for dependency ordering.
	KindRef ValueKind = "ref"
	// KindList is an ordered list of child values.
	KindList ValueKind = "list"
)

// LitType tags the type of a literal scalar so the generator can decide
// whether to quote it (strings) or emit it bare (numbers, bools).
type LitType string

const (
	LitString LitType = "string"
	LitNumber LitType = "number"
	LitBool   LitType = "bool"
)

// AttrValue is a resource attribute value, modelled as a tagged union.
//
// Why not map[string]any: a naked map decoded from JSON cannot represent a
// reference at all (aws_vpc.main.id is indistinguishable from the literal
// string "aws_vpc.main.id"), and it collapses every integer to float64, so
// 65535 and 65535.0 become the same value. Both distinctions are exactly
// what the HCL generator needs. cty.Value-grade typing (full type system,
// conversions) is deliberately deferred; this is the minimum the generator
// requires.
//
// Exactly one variant's fields are meaningful, selected by Kind. Construct
// values with String/Int/Float/NumberText/Bool/Ref/List rather than building
// the struct directly.
type AttrValue struct {
	Kind ValueKind

	// Literal (Kind == KindLiteral): the literal's type plus its canonical
	// textual form. Stored as text so a number never loses precision or its
	// int/float identity across a JSON round-trip.
	LitType LitType
	Lit     string

	// Ref (Kind == KindRef): the stable ID of the referenced resource and the
	// attribute name on it (e.g. "id", "arn", "cidr_block").
	RefTarget    ResourceID
	RefAttribute string

	// List (Kind == KindList): ordered child values.
	Items []AttrValue
}

// String builds a literal string value.
func String(s string) AttrValue {
	return AttrValue{Kind: KindLiteral, LitType: LitString, Lit: s}
}

// Int builds a literal number value from an integer.
func Int(n int64) AttrValue {
	return AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: strconv.FormatInt(n, 10)}
}

// Float builds a literal number value from a float, using the shortest
// representation that round-trips.
func Float(f float64) AttrValue {
	return AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: strconv.FormatFloat(f, 'f', -1, 64)}
}

// NumberText builds a literal number value from an already-canonical textual
// form. Use when the exact source text matters (e.g. preserving an importer's
// representation).
func NumberText(s string) AttrValue {
	return AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: s}
}

// Bool builds a literal bool value.
func Bool(b bool) AttrValue {
	return AttrValue{Kind: KindLiteral, LitType: LitBool, Lit: strconv.FormatBool(b)}
}

// Ref builds a reference to target's attribute.
func Ref(target ResourceID, attribute string) AttrValue {
	return AttrValue{Kind: KindRef, RefTarget: target, RefAttribute: attribute}
}

// List builds an ordered list value.
func List(items ...AttrValue) AttrValue {
	return AttrValue{Kind: KindList, Items: items}
}

// Valid reports whether the value is internally consistent for its Kind.
func (v AttrValue) Valid() bool {
	switch v.Kind {
	case KindLiteral:
		switch v.LitType {
		case LitString, LitBool:
			return true
		case LitNumber:
			return numberRe.MatchString(v.Lit)
		default:
			return false
		}
	case KindRef:
		return v.RefTarget != "" && v.RefAttribute != ""
	case KindList:
		for _, it := range v.Items {
			if !it.Valid() {
				return false
			}
		}
		return true
	default:
		return false
	}
}

// walkRefs appends every ResourceID referenced by this value (recursing into
// lists) to dst.
func (v AttrValue) walkRefs(dst []ResourceID) []ResourceID {
	switch v.Kind {
	case KindRef:
		return append(dst, v.RefTarget)
	case KindList:
		for _, it := range v.Items {
			dst = it.walkRefs(dst)
		}
	}
	return dst
}

// attrValueJSON is the wire shape: a discriminated union keyed on "kind".
type attrValueJSON struct {
	Kind      ValueKind   `json:"kind"`
	LitType   LitType     `json:"litType,omitempty"`
	Value     *string     `json:"value,omitempty"`
	Target    ResourceID  `json:"target,omitempty"`
	Attribute string      `json:"attribute,omitempty"`
	Items     []AttrValue `json:"items,omitempty"`
}

// MarshalJSON encodes the active variant only, producing a tagged-union shape
// that survives a round-trip without type loss.
func (v AttrValue) MarshalJSON() ([]byte, error) {
	out := attrValueJSON{Kind: v.Kind}
	switch v.Kind {
	case KindLiteral:
		switch v.LitType {
		case LitString, LitNumber, LitBool:
		default:
			return nil, fmt.Errorf("%w: literal has invalid litType %q", ErrInvalidValue, v.LitType)
		}
		lit := v.Lit
		out.LitType = v.LitType
		out.Value = &lit
	case KindRef:
		out.Target = v.RefTarget
		out.Attribute = v.RefAttribute
	case KindList:
		out.Items = v.Items
	default:
		return nil, fmt.Errorf("%w: cannot marshal unknown kind %q", ErrInvalidValue, v.Kind)
	}
	return json.Marshal(out)
}

// UnmarshalJSON decodes the tagged-union shape back into the flat struct.
func (v *AttrValue) UnmarshalJSON(data []byte) error {
	var in attrValueJSON
	if err := json.Unmarshal(data, &in); err != nil {
		return err
	}
	switch in.Kind {
	case KindLiteral:
		if in.Value == nil {
			return fmt.Errorf("%w: literal missing \"value\"", ErrInvalidValue)
		}
		*v = AttrValue{Kind: KindLiteral, LitType: in.LitType, Lit: *in.Value}
	case KindRef:
		*v = AttrValue{Kind: KindRef, RefTarget: in.Target, RefAttribute: in.Attribute}
	case KindList:
		*v = AttrValue{Kind: KindList, Items: in.Items}
	default:
		return fmt.Errorf("%w: unknown kind %q", ErrInvalidValue, in.Kind)
	}
	return nil
}
