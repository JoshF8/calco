// Package hello holds the pure-domain logic for the trivial hello feature.
//
// This package exists primarily to anchor the hexagonal layering: every
// real feature will follow the same pattern (pure functions and types
// under internal/domain/<feature>, no I/O).
package hello

import "fmt"

// Greet returns a friendly hello for the given name. Empty names default
// to "world". The function is pure and has no side effects.
func Greet(name string) string {
	if name == "" {
		name = "world"
	}
	return fmt.Sprintf("Hello, %s", name)
}
