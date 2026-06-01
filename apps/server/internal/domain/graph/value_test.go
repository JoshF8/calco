package graph

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

func TestAttrValueJSONRoundTrip(t *testing.T) {
	cases := []struct {
		name string
		val  AttrValue
	}{
		{"string", String("10.0.0.0/16")},
		{"empty string", String("")},
		{"int", Int(65535)},
		{"negative int", Int(-1)},
		{"float", Float(1.5)},
		{"bool true", Bool(true)},
		{"bool false", Bool(false)},
		{"ref", Ref(ResourceID("0192f8a0-0000-7000-8000-000000000001"), "id")},
		{"empty list", List()},
		{"list of literals", List(String("a"), Int(2), Bool(true))},
		{"nested list with ref", List(String("x"), List(Ref(ResourceID("0192f8a0-0000-7000-8000-000000000002"), "arn")))},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data, err := json.Marshal(tc.val)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			var got AttrValue
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if !equalValue(tc.val, got) {
				t.Fatalf("round-trip mismatch:\n in:  %#v\n out: %#v\n json: %s", tc.val, got, data)
			}
		})
	}
}

// TestAttrValueIntDoesNotBecomeFloat is the regression guard for the whole
// reason AttrValue exists: a number must not lose its integer identity across
// JSON the way a naked map[string]any would (every JSON number → float64).
func TestAttrValueIntDoesNotBecomeFloat(t *testing.T) {
	data, err := json.Marshal(Int(65535))
	if err != nil {
		t.Fatal(err)
	}
	var got AttrValue
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got.LitType != LitNumber {
		t.Fatalf("LitType = %q, want %q", got.LitType, LitNumber)
	}
	if got.Lit != "65535" {
		t.Fatalf("Lit = %q, want %q (a float round-trip would yield 65535 vs 65535.0 ambiguity)", got.Lit, "65535")
	}
}

// TestAttrValueRefDistinctFromString guards the other half: a reference must
// be distinguishable from a literal string that happens to look like one.
func TestAttrValueRefDistinctFromString(t *testing.T) {
	target := ResourceID("0192f8a0-0000-7000-8000-000000000003")
	ref := Ref(target, "id")
	lit := String("aws_vpc.main.id")

	if ref.Kind == lit.Kind {
		t.Fatal("ref and string literal share a Kind; generator cannot tell them apart")
	}

	refJSON, _ := json.Marshal(ref)
	litJSON, _ := json.Marshal(lit)
	if string(refJSON) == string(litJSON) {
		t.Fatalf("ref and string serialize identically: %s", refJSON)
	}
}

func TestAttrValueValid(t *testing.T) {
	cases := []struct {
		name string
		val  AttrValue
		want bool
	}{
		{"string", String("x"), true},
		{"int", Int(1), true},
		{"bool", Bool(false), true},
		{"ref", Ref(ResourceID("id"), "attr"), true},
		{"list ok", List(String("a")), true},
		{"bad number text", AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "not-a-number"}, false},
		{"unknown lit type", AttrValue{Kind: KindLiteral, LitType: "weird", Lit: "x"}, false},
		{"ref missing target", AttrValue{Kind: KindRef, RefAttribute: "id"}, false},
		{"ref missing attribute", AttrValue{Kind: KindRef, RefTarget: "id"}, false},
		{"unknown kind", AttrValue{Kind: "mystery"}, false},
		{"list with invalid child", List(AttrValue{Kind: KindRef, RefTarget: "id"}), false},
		{"infinity", AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "+Inf"}, false},
		{"nan", AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "NaN"}, false},
		{"hex float", AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "0x1p4"}, false},
		{"leading plus", AttrValue{Kind: KindLiteral, LitType: LitNumber, Lit: "+5"}, false},
		{"valid exponent", NumberText("1e10"), true},
		{"float-via-Inf-constructor", Float(math.Inf(1)), false},
		{"leading zeros", NumberText("065535"), false},
		{"exponent out of range", NumberText("1e2147483648"), false},
		{"exponent yielding inf", NumberText("1e1000000000"), false},
		{"ref with non-identifier attribute", AttrValue{Kind: KindRef, RefTarget: "x", RefAttribute: `id" injected="pwned`}, false},
		{"ref with expression attribute", AttrValue{Kind: KindRef, RefTarget: "x", RefAttribute: "a ? b : c"}, false},
		{"ref with valid attribute", Ref(ResourceID("x"), "cidr_block"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.val.Valid(); got != tc.want {
				t.Fatalf("Valid() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAttrValueMarshalUnknownKindErrors(t *testing.T) {
	_, err := json.Marshal(AttrValue{Kind: "mystery"})
	if !errors.Is(err, ErrInvalidValue) {
		t.Fatalf("err = %v, want ErrInvalidValue", err)
	}
}

// A literal with an empty/unknown LitType must not marshal to a shape that
// silently decodes back as invalid (omitempty would otherwise drop litType).
func TestAttrValueMarshalInvalidLitTypeErrors(t *testing.T) {
	_, err := json.Marshal(AttrValue{Kind: KindLiteral, LitType: "", Lit: "x"})
	if !errors.Is(err, ErrInvalidValue) {
		t.Fatalf("err = %v, want ErrInvalidValue", err)
	}
}

func TestAttrValueUnmarshalErrors(t *testing.T) {
	cases := []struct {
		name string
		data string
	}{
		{"unknown kind", `{"kind":"mystery"}`},
		{"literal missing value", `{"kind":"literal","litType":"string"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var v AttrValue
			err := json.Unmarshal([]byte(tc.data), &v)
			if !errors.Is(err, ErrInvalidValue) {
				t.Fatalf("err = %v, want ErrInvalidValue", err)
			}
		})
	}
}

// equalValue is a structural comparison used only by tests.
func equalValue(a, b AttrValue) bool {
	if a.Kind != b.Kind {
		return false
	}
	switch a.Kind {
	case KindLiteral:
		return a.LitType == b.LitType && a.Lit == b.Lit
	case KindRef:
		return a.RefTarget == b.RefTarget && a.RefAttribute == b.RefAttribute
	case KindList:
		if len(a.Items) != len(b.Items) {
			return false
		}
		for i := range a.Items {
			if !equalValue(a.Items[i], b.Items[i]) {
				return false
			}
		}
		return true
	}
	return false
}
