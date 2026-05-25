package hello

import "testing"

func TestGreet(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty defaults to world", in: "", want: "Hello, world"},
		{name: "uses given name", in: "calco", want: "Hello, calco"},
		{name: "preserves spacing", in: "Joshua Franco", want: "Hello, Joshua Franco"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Greet(tc.in)
			if got != tc.want {
				t.Fatalf("Greet(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
