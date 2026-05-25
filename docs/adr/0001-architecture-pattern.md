# ADR-0001 — Architecture pattern

- **Status:** Accepted
- **Date:** 2026-05-24
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

calco is a SaaS that translates between visual canvas representations of cloud infrastructure and Terraform code in both directions. It is being built by a single developer with the dual goal of (a) shipping a product useful for the Latin American market and (b) demonstrating senior full-stack capability for portfolio purposes.

The product has a clear bounded domain (graph model + HCL ↔ graph translation), a non-trivial runner subsystem (containerised Terraform execution), a web frontend with substantial interactivity (canvas-based), and a need to remain operable and maintainable by one or two people.

We need an architectural style that:

1. Keeps the domain isolated from infrastructure so adapters (DB, runner, HTTP layer) can be swapped without rewriting business logic.
2. Avoids premature distribution.
3. Supports a clean, file-based organization that does not collapse as features accumulate.
4. Signals architectural maturity to technical reviewers (recruiters, contributors, potential customers).

## Decision

We adopt **three combined patterns**, one per concern:

1. **Modular monolith** for deployment shape. One backend binary, one frontend bundle. Internal modules have clear boundaries; nothing is split across processes that does not need to be.
2. **Hexagonal architecture (Ports & Adapters)** for the backend's internal layering. The domain is pure Go with no I/O. The application layer orchestrates use cases. Ports are Go interfaces. Adapters are inbound (HTTP) and outbound (DB, runner, GitHub fetcher) implementations.
3. **Feature-based organisation** for the frontend. Each user-visible feature owns its components, hooks, and state in its own directory under `apps/web/src/features/`.

## Consequences

### Positive

- **Domain code is testable without mocks.** Pure Go functions, table-driven tests.
- **Swappable adapters.** SQLite → Postgres, templates → `hclwrite`, in-process runner → remote runner: each replaceable behind a stable Port.
- **No premature distribution.** Single deploy, single CI, single repo for the public product.
- **Feature folders scale.** Deleting a feature is `rm -rf src/features/feature-name/`; no orphaned imports.
- **Clear vocabulary for contributors.** "Domain", "Application", "Ports", "Adapters" map to well-known senior-level concepts.

### Negative

- **More files than a flat MVC project.** Five-package layout per backend feature can feel ceremonious until the product grows.
- **Manual DI in `main.go`.** No magic. Wires explicit. Acceptable cost for one or two people; verbose for larger teams.
- **Initial learning curve** for contributors unfamiliar with hexagonal architecture.

### Neutral

- **Module boundaries can be promoted to network boundaries later** if a particular adapter (the runner, the importer) needs to scale independently. The decision to distribute is deferred without locking out the option.

## Alternatives considered

### Strict Clean Architecture (Robert C. Martin)

Four concentric rings (entities, use cases, interface adapters, frameworks) with explicit directionality rules. **Rejected:** delivers the same isolation guarantees as hexagonal with more ceremony and more concepts for a single developer to internalise. Hexagonal achieves the same outcomes with two adapter directions instead of four rings.

### Microservices

Split the runner, the HCL engine, and the API into separate services from day one. **Rejected:** premature distribution. None of the proposed services have independent scaling, deployment, or team-ownership requirements. A solo developer running microservices spends most of their time on inter-service plumbing instead of product. The modular monolith preserves the option to split later if measured pain justifies it.

### Classic MVC

Controllers, models, views. **Rejected:** MVC is suited to CRUD-shaped applications where business logic is thin. calco's business logic (graph model transformations, HCL parsing and generation, runner orchestration) is the entire product. MVC has no idiomatic place for use cases or domain services and tends to push logic into controllers ("fat controllers") or models ("anaemic / fat ActiveRecord").

### Frontend organised by technical type (`components/`, `pages/`, `hooks/`, `utils/`)

The traditional React layout. **Rejected:** scales poorly past ~30 files. Cross-feature imports accumulate, deletions leave orphans, and the boundaries between features blur. Feature-based organisation is the canonical scalable pattern in 2025–2026 React.

## Out of scope (intentionally)

The following are explicit non-goals of this ADR and the MVP. Future ADRs may revisit them.

- Real-time multi-user collaboration (CRDTs, WebSocket).
- Event sourcing or CQRS — Project versioning, when needed, will use a simple `project_versions` table rather than event-sourced reconstruction.
- A plugin or marketplace system for custom resources.
- Multi-process orchestration of the runner.
- Round-trip editing of imported HCL preserving original formatting (requires `hclwrite` surgical edits; deferred).

## References

- Alistair Cockburn — Hexagonal Architecture (original 2005 article).
- Vaughn Vernon — *Implementing Domain-Driven Design* (chapters on layered + hexagonal architectures).
- Bill Wake — Feature-based folder organisation in component-based UI frameworks.
