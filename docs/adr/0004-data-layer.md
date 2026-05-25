# ADR-0004 — Data layer

- **Status:** Accepted
- **Date:** 2026-05-24
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

calco persists projects, project versions, resources, and edges in a relational database. Two deployment targets are in scope:

- **Self-hosted (open-source binary):** SQLite. Zero infrastructure, single file, ships with the binary.
- **Hosted (paid SaaS):** PostgreSQL. Multi-tenant, managed via RDS or equivalent.

The schema is relational, mid-sized (estimated 8–12 tables in MVP), and includes operations that benefit from precise SQL control: filtering resources by attribute, listing projects with pagination, querying project versions for diffs.

Performance matters in the brownfield import path, which can issue many writes for a single imported repository.

We need:

1. **Type-safe Go access** to queries and results.
2. **Migration tooling** that supports SQLite and Postgres.
3. **Cross-database compatibility** without runtime adapter chaos.
4. **Drivers** that are reliable, performant, and pure Go where possible (to keep cross-compilation simple).

## Decision

Four components:

| Concern | Tool |
|---|---|
| Query code generation | **sqlc** (`v1.31.1`) |
| Schema migrations | **goose v3** (`v3.27.1`) |
| PostgreSQL driver | **jackc/pgx/v5** (`v5.9.2`) |
| SQLite driver | **modernc.org/sqlite** (`v1.50.1`) |

We write SQL in `queries/` and `migrations/`. sqlc generates type-safe Go functions. goose runs migrations against either database. Drivers connect at runtime based on configuration.

## Consequences

### Positive

- **Type safety without an ORM.** Generated functions are direct mappings of SQL to Go; the compiler catches typos, missing columns, and shape mismatches.
- **No runtime ORM overhead.** No reflection, no entity tracking, no implicit lazy loading.
- **Explicit queries.** No N+1 surprises. The SQL we write is the SQL that runs.
- **Cross-database support is native.** sqlc compiles different query sets per engine when needed; goose runs migrations against both.
- **Pure Go SQLite (modernc.org/sqlite)** means no CGO. Cross-compile freely.
- **`pgx`** is the de facto Postgres driver in modern Go with first-class support for Postgres-specific features (JSONB, arrays, COPY) when we need them.
- **Portfolio signal.** "SQL-first with sqlc" is the 2025–2026 Go community direction.

### Negative

- **SQL literacy required.** sqlc has no query builder DSL. We write the JOINs ourselves. This is positive for developers comfortable with SQL; could slow others.
- **Codegen step.** `sqlc generate` must run after every query change. Integrated into the dev workflow via `Taskfile.yml`.
- **Cross-DB SQL discipline.** Postgres-specific features (JSONB operators, advanced CTEs, arrays) require either fallback queries for SQLite or restricting to the compatible subset. For the calco schema, the compatible subset is sufficient.
- **No automatic migration generation from struct diffs.** Migrations are written by hand. Acceptable trade-off; explicit migrations are more reliable for production data.

## Alternatives considered

### GORM

The most popular Go ORM. **Rejected.**

- Heavy use of reflection and runtime magic.
- N+1 query patterns are easy to introduce accidentally.
- Performance lags behind sqlc, sqlx, Bun, and Ent in published benchmarks.
- Hooks fire implicitly; debugging "why did this update happen" is frustrating.
- In 2026, GORM in a new repo is read by senior reviewers as a default rather than a decision. We want decisions.

### Ent (by Facebook/Meta)

Schema-as-code with full type-safe generated APIs. **Rejected** because:

- Heavy code generation produces large surface area to understand when something goes wrong.
- Strong opinions about graph relationships are overkill for a relational schema of calco's size.
- Migrating away from Ent is non-trivial; Ent owns the schema definition.
- Better fit for very large codebases with many entities. calco does not have that volume.

### Bun

Modern ORM, lightweight query builder + struct mapping. **Rejected** narrowly.

- Performance is excellent.
- API is pleasant.
- But: it remains an ORM. The query expression is Go code, not SQL. For a developer comfortable with SQL, Bun adds an indirection. The "where ORM helps" cases (junior developers, schema-driven apps) do not apply to calco.

### sqlx + manual scanning

Lightweight extension to `database/sql`. **Rejected** because it does not provide type-safe results. Every `Scan` call requires keeping struct fields in sync manually, with errors caught only at runtime. sqlc gives the same explicit SQL with a generated layer that catches mistakes at compile time.

### Pure `database/sql`

The standard library only. **Rejected.** Same reason as sqlx, plus more boilerplate.

### Database migration alternatives

- **golang-migrate** — also excellent, more popular than goose by GitHub stars. Goose was chosen because of its tighter integration story with sqlc (documented and recommended by both teams) and its support for Go-function migrations (sometimes needed for data backfills).

### SQLite driver alternatives

- **`mattn/go-sqlite3`** — CGO-based, more mature historically. **Rejected** because CGO complicates cross-compilation and increases build time. `modernc.org/sqlite` is pure Go, performant enough for our scale, and lets us produce static binaries for any platform.

## Risks

- **JSONB temptation.** Postgres has powerful JSONB operators. If we use them, SQLite needs equivalent fallback paths. We avoid JSONB-heavy designs in MVP; if a future feature requires JSONB, we explicitly accept self-host SQLite restrictions in that feature's ADR.
- **Schema evolution.** Migrations are forward-only by default. We will not add automatic rollback; rollbacks happen by writing a new forward migration. This matches the operational discipline of mature production systems.

## References

- sqlc — [sqlc.dev](https://sqlc.dev) and [github.com/sqlc-dev/sqlc](https://github.com/sqlc-dev/sqlc)
- goose — [github.com/pressly/goose](https://github.com/pressly/goose)
- pgx — [github.com/jackc/pgx](https://github.com/jackc/pgx)
- modernc.org/sqlite — [pkg.go.dev/modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)
- sqlc + goose integration guide — [pressly.github.io/goose/blog/2024/goose-sqlc/](https://pressly.github.io/goose/blog/2024/goose-sqlc/)
