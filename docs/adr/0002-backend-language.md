# ADR-0002 — Backend language

- **Status:** Accepted
- **Date:** 2026-05-24
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

calco's backend has three responsibilities of unequal weight:

1. **Standard HTTP/CRUD work** — auth (in the hosted version), session handling, project metadata, listing endpoints. Roughly 30% of code volume.
2. **HCL handling** — parsing Terraform configurations, generating HCL from a graph model, ideally with format-preserving round-trip in v2. Roughly 40% of value and complexity.
3. **Runner orchestration** — spawning Docker containers running `terraform`, capturing stdout, parsing plan JSON, enforcing timeouts and resource limits. Roughly 30% of code volume but disproportionate operational weight.

The Terraform ecosystem — the official `hcl/v2` library, `hclwrite`, `tfexec`, `terraform-config-inspect`, the providers, Terraform itself, OpenTofu, Pulumi's backend, Atlantis, Spacelift internals — is written in Go. Almost the entire IaC community contributes in Go.

Calco is a product about Terraform. Its long-term value depends on going deep in this ecosystem.

The frontend is React + TypeScript; this is non-negotiable because React Flow / `@xyflow/react` has no equivalent outside the JavaScript ecosystem.

The decision is therefore: **what language(s) does the backend use?**

## Decision

**Full Go backend.** The HTTP server, application layer, domain, ports, and all outbound adapters (DB, runner, GitHub fetcher) are written in Go.

The frontend remains TypeScript. Communication between frontend and backend is REST + OpenAPI 3.1 (see [ADR-0003](./0003-api-and-web-framework.md)).

## Consequences

### Positive

- **Single language across the backend.** No cross-language IPC, no marshalling boundary, no duplicated domain types.
- **Native access to the Terraform ecosystem.** `hcl/v2`, `hclwrite`, `tfexec`, provider schemas, plan parsing — all directly importable. No subprocess hops.
- **Concurrency model fits the runner.** Goroutines + channels handle Docker spawn orchestration more naturally than Node's event loop or child-process management.
- **Single static binary.** Self-host distribution is straightforward; cross-compilation is free.
- **Predictable performance and memory.** Server + runner share the same runtime characteristics; capacity planning is simpler.
- **Strong portfolio signal.** A complete Go backend communicates more language depth than a primarily TS project with a Go module bolted on.

### Negative

- **Type sharing with frontend is not free.** Tools generate TS types from the OpenAPI spec; an automated codegen step (`openapi-typescript`) must remain in the build pipeline.
- **More boilerplate for CRUD.** Go is more verbose than TypeScript for the 30% of code that is plain HTTP handlers. We accept the cost in exchange for everything else.
- **Hot-reload story.** `air` provides good Go hot reload (~2s cycles), but it remains slower than TS+Vite (~1s). Acceptable.
- **Hiring pool is smaller** if/when team grows. Mitigated by Go's reputation as easy to onboard relative to its capability ceiling.

## Alternatives considered

### Full TypeScript backend (Node + Hono/Fastify, with HCL via templates)

**Rejected.**

- The TypeScript HCL ecosystem is third-party and partial. `hclwrite`-quality format-preserving generation does not exist; AST-level parsing is incomplete; plan JSON parsing is more error-prone in dynamic types.
- Templates can generate clean HCL from scratch (greenfield is fine) but **cannot** support round-trip editing of user HCL — which is on the v2 roadmap.
- Choosing TypeScript would impose a permanent ceiling on the product's depth in the IaC space, traded for ~3–4 weeks of MVP speed. Not a worthwhile trade for a product whose entire identity is Terraform-centric.

### Hybrid: TypeScript server + Go binary only for the HCL engine

This was the initially proposed option and was **rejected after closer analysis**.

- The domain (graph model + HCL operations) is the heart of the product. Splitting it across two languages forces manual schema synchronisation, IPC overhead on every domain operation (~5–20 ms per call plus serialisation), and effectively duplicates types and validation.
- This combines the costs of polyglot (two toolchains, two CIs, cross-language debugging) with the costs of TypeScript-for-IaC (limited HCL library quality) without giving the benefits of either.
- The "I can change it later" defence is rejected: in practice, "migrate later" architectures rarely migrate. The cost of cross-language friction compounds.

### "I'll start with TypeScript and migrate to Go when I hit pain"

**Rejected explicitly.** Architecture decisions of this magnitude do not get re-litigated mid-flight. Teams build features on top, accumulate language-specific code, and freeze. We commit to the language that matches where the product is going in 2–3 years, not the one that is fastest for week 1.

## Risks

- **Solo dev velocity for non-HCL features.** Mitigated by using Huma (idiomatic, OpenAPI-first; reduces handler boilerplate) and sqlc (writes the data access layer).
- **Frontend type drift if codegen breaks.** Mitigated by CI gate: `openapi-typescript` runs on PRs; mismatch fails the build.

## References

- HashiCorp `hcl/v2` — [pkg.go.dev/github.com/hashicorp/hcl/v2](https://pkg.go.dev/github.com/hashicorp/hcl/v2)
- HashiCorp `hclwrite` — [pkg.go.dev/github.com/hashicorp/hcl/v2/hclwrite](https://pkg.go.dev/github.com/hashicorp/hcl/v2/hclwrite)
- Industry pattern: "Node.js for product backends, Go for infra services" — multiple 2026 surveys cited in initial discussion.
