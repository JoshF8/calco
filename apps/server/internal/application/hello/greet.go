// Package hello is the application layer for the hello feature.
//
// It orchestrates the domain (and its future ports) into a use case that
// HTTP adapters can call without knowing about domain internals.
package hello

import (
	domhello "github.com/JoshF8/calco/apps/server/internal/domain/hello"
)

// GreetUser is the use case that produces a greeting for a user.
//
// In the MVP it has no port dependencies; future features will inject
// ports here (e.g. user repository, audit logger).
type GreetUser struct{}

// NewGreetUser builds a GreetUser use case.
func NewGreetUser() *GreetUser {
	return &GreetUser{}
}

// Execute returns a greeting for the given name.
func (uc *GreetUser) Execute(name string) string {
	return domhello.Greet(name)
}
