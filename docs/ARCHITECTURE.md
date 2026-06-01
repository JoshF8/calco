# Architecture — calco

> This document is the source of truth for **how** calco is built. The **what** (product vision, positioning) lives in [`README.md`](../README.md). The **why** of individual decisions lives in [`docs/adr/`](./adr/).

Status: Pre-MVP. Architecture defined; implementation in progress.

---

## 1. System overview

calco is built as **two processes** that cooperate, plus an **ephemeral sandbox** for Terraform execution.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER  (React + TS · SPA)                   │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  Canvas (React Flow / @xyflow/react) + Panels            │   │
│   │  Client state: Zustand                                    │   │
│   │  Server state: TanStack Query                             │   │
│   │  Types: generated from /openapi.json                      │   │
│   └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS · REST · JSON
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVER  (Single Go binary · Huma + chi)             │
│                                                                  │
│  Inbound adapters (HTTP, OpenAPI auto-spec)                      │
│         ↓                                                        │
│  Application (use cases)                                         │
│         ↓                                                        │
│  Domain (pure Go: graph model, HCL generator, HCL importer)      │
│         ↓                                                        │
│  Outbound adapters (sqlc/pgx · sqlc/sqlite · DockerRunner · ...) │
└────────────────────┬─────────────────────────┬──────────────────┘
                     │                         │ os/exec
                     ▼                         ▼
        ┌─────────────────────┐    ┌──────────────────────────────┐
        │  Postgres / SQLite  │    │  Docker container            │
        │  (persistent state) │    │  hashicorp/terraform:1.x     │
        └─────────────────────┘    │  validate · plan · graph     │
                                   │  ephemeral · network-isolated │
                                   └──────────────────────────────┘
```

- **One frontend** (React SPA) talks to **one backend** (Go binary) over REST.
- The backend **spawns short-lived Docker containers** to execute `terraform` operations in isolation.
- No microservices. No message queues. No real-time collaboration (yet).

---

## 2. Architectural pattern

**Modular monolith + Hexagonal (Ports & Adapters) + Feature-based frontend.**

Full rationale in [ADR-0001](./adr/0001-architecture-pattern.md). Summary:

| Decision | What it means in practice |
|---|---|
| Modular monolith | Single deployable binary. Module boundaries inside the codebase, no network between them. |
| Hexagonal | Domain is pure Go with no I/O. Application orchestrates use cases. Adapters (HTTP, DB, Docker) implement Ports. |
| Feature-based frontend | `src/features/canvas/`, `src/features/import-flow/`, etc. — each feature is a self-contained slice. |

### The three backend layers, explicit

**Domain** (`internal/domain/`)
Pure Go. Tipos + funciones puras. No imports of `net/http`, `database/sql`, Docker, or anything I/O.
Holds: `GraphModel`, `Resource`, `Edge`, `Variable`, the `HCLGenerator` (graph→HCL), the `HCLImporter` (HCL→graph), and resource schemas.
Tested without mocks.

**Application** (`internal/application/`)
Use cases that orchestrate the domain + Ports. Each use case is a struct with dependencies injected by construction (manual DI, no container).

```go
type GenerateHCL struct {
    projects ports.ProjectRepository
    runner   ports.Runner
}

func (uc *GenerateHCL) Execute(ctx context.Context, projectID ProjectID) (HCLFiles, error) {
    p, err := uc.projects.FindByID(ctx, projectID)
    if err != nil { return nil, err }
    files, err := domain.GenerateFromGraph(p.Graph)
    if err != nil { return nil, err }
    if err := uc.runner.Validate(ctx, files); err != nil { return nil, err }
    return files, nil
}
```

The use case **does not know** how a project is persisted nor how Terraform is executed. It only knows the Port interfaces.

**Ports** (`internal/ports/`)
The interfaces that domain + application consume:

```go
type ProjectRepository interface {
    FindByID(ctx context.Context, id ProjectID) (Project, error)
    Save(ctx context.Context, p Project) error
    List(ctx context.Context, ownerID UserID) ([]Project, error)
}

type Runner interface {
    Validate(ctx context.Context, files HCLFiles) (ValidationResult, error)
    Graph(ctx context.Context, files HCLFiles) (GraphDOT, error)
}
```

**Adapters**
- **Inbound (driving):** `internal/adapters/inbound/http/` — Huma handlers receive requests, call use cases, format responses.
- **Outbound (driven):** concrete implementations of Ports. `PostgresProjectRepository`, `SQLiteProjectRepository`, `DockerRunner`, `GithubFetcher`.

### Wiring in `main.go`

All dependency inversion happens here. No DI framework. No annotations. Just struct construction.

```go
func main() {
    cfg := config.Load()
    db := mustConnectDB(cfg.DatabaseURL)

    projectRepo := postgresrepo.New(db)
    runner := dockerrunner.New("hashicorp/terraform:1.7")

    createProject := application.NewCreateProject(projectRepo)
    generateHCL   := application.NewGenerateHCL(projectRepo, runner)
    importTF      := application.NewImportTerraform(projectRepo, runner)
    // ...

    api := huma.New(humachi.New(chi.NewRouter()), humaCfg)
    httpadapter.Register(api, createProject, generateHCL, importTF /* ... */)

    log.Fatal(http.ListenAndServe(":8080", api.Adapter()))
}
```

---

## 3. Tech stack (with pinned versions)

Versions reflect snapshot as of **May 2026**. Patches bump freely; majors require an ADR.

### Backend (Go)

| Tool | Version | Purpose |
|---|---|---|
| Go | `1.26.3` | Language |
| `danielgtaylor/huma/v2` | `v2.38.0` | REST framework, OpenAPI 3.1 auto-spec, validation |
| `go-chi/chi/v5` | `v5.3.0` | Router (`net/http` compatible) |
| `sqlc` (CLI) | `v1.31.1` | SQL → typed Go code generation |
| `pressly/goose/v3` | `v3.27.1` | Migrations (library + CLI) |
| `jackc/pgx/v5` | `v5.9.2` | PostgreSQL driver |
| `modernc.org/sqlite` | `v1.50.1` | SQLite driver (pure Go, no CGO) |
| `hashicorp/hcl/v2` + `hclwrite` | latest | HCL parsing + formatting-preserving generation |
| `log/slog` | stdlib | Structured logging (JSON handler) |

### Frontend (TypeScript)

| Tool | Version | Purpose |
|---|---|---|
| Node.js | `≥ 22 LTS` | Required by pnpm 11 |
| pnpm | `11.3.0` | Package manager |
| TypeScript | `6.0.3` | Language |
| Vite | `8.0.14` | Build + dev server |
| React | `19.2.6` | UI framework |
| `@xyflow/react` | `12.10.2` | Canvas (formerly `reactflow`, renamed in 2024) |
| Tailwind CSS | `4.3.0` | Styling (v4 with `@theme` directive) |
| `@tailwindcss/vite` | `4.3.0` | Vite plugin |
| shadcn (CLI) | `4.8.0` | Component scaffolder |
| Zustand | `5.0.13` | Client state |
| `@tanstack/react-query` | `5.100.14` | Server state (cache + mutations) |
| `react-router` | `7.15.1` | Routing |
| `openapi-typescript` | `7.13.0` | Generates TS types from OpenAPI spec |

### Runner

| Tool | Version | Purpose |
|---|---|---|
| `hashicorp/terraform` (Docker) | `1.7+` | Runs `terraform validate`, `plan -refresh=false`, `graph` |
| Go `os/exec` | stdlib | Spawns containers, captures stdout/stderr |

---

## 4. Repository structure

```
calco/
├── apps/
│   ├── web/                            # Frontend (React + Vite + TS)
│   │   └── src/
│   │       ├── features/               # Feature-based slices
│   │       │   ├── canvas/
│   │       │   ├── resource-panel/
│   │       │   ├── import-flow/
│   │       │   ├── export-flow/
│   │       │   └── project-list/
│   │       ├── shared/                 # Cross-feature components
│   │       ├── lib/
│   │       │   ├── api-client.ts       # fetch wrapper over generated types
│   │       │   └── types.gen.ts        # generated from /openapi.json
│   │       └── styles/
│   │
│   └── server/                         # Backend (Go binary)
│       ├── cmd/server/main.go          # Entry point + DI wiring
│       └── internal/
│           ├── domain/                 # PURE: graph, hcl, schemas, project
│           ├── application/            # Use cases
│           ├── ports/                  # Interfaces consumed by app/domain
│           ├── adapters/
│           │   ├── inbound/http/       # Huma handlers
│           │   └── outbound/
│           │       ├── db/             # sqlc generated + repositories
│           │       │   ├── queries/    # *.sql (sqlc input)
│           │       │   ├── migrations/ # *.sql (goose input)
│           │       │   └── generated/  # sqlc output
│           │       ├── runner/         # DockerRunner
│           │       └── github/         # GitHub repo fetcher
│           ├── config/                 # env, flags
│           └── observability/          # slog setup
│
├── docs/
│   ├── ARCHITECTURE.md                 # This file
│   ├── BRAND.md
│   ├── adr/                            # Architecture Decision Records
│   └── brand/                          # SVG assets + preview
│
├── infra/                              # Terraform that deploys calco itself
├── .github/workflows/                  # CI/CD
├── Taskfile.yml                        # Cross-language task runner
├── README.md
└── README.es.md
```

---

## 5. Key flows

### 5.1 Greenfield — canvas to HCL

```
1. User drags resources onto the canvas.
   → Zustand updates the GraphModel (frontend in-memory).

2. Auto-save (debounced):
   → PUT /api/v1/projects/:id  { graph: GraphModel }

3. Server (Huma):
   → Validates input against generated schemas.
   → Calls UpdateProject use case.
   → Use case saves via ProjectRepository.

4. User clicks "Export":
   → POST /api/v1/projects/:id/export

5. Server runs GenerateHCL use case:
   a. Load Project from repository.
   b. domain.GenerateFromGraph(graph) → HCLFiles (in-memory map[filename]string).
   c. runner.Validate(files) → spawns Docker terraform validate.
   d. If valid, response is a zip of .tf files.

6. Browser downloads the zip.
```

### 5.2 Brownfield — HCL to canvas (read-only in MVP)

```
1. User pastes a GitHub URL or uploads a .zip of Terraform files.
   → POST /api/v1/import/github  { url: "..." }   (or multipart upload)

2. Server runs ImportTerraform use case:
   a. GithubFetcher clones the repo to a tmpdir.
   b. runner.Init(tmpdir)       — terraform init (download providers)
   c. runner.Graph(tmpdir)      — terraform graph -type=plan (or plan -refresh=false → show -json)
   d. domain.ImportFromGraph(graphDOT) → GraphModel
   e. Persist as a new Project.

3. Browser navigates to the new project. Canvas renders with ELK.js layout (client-side).

4. MVP constraint: imported projects are read-only. To edit, the user "adopts" the project,
   which regenerates clean HCL from the graph and converts to an editable project.
```

### 5.3 The "puente" flow (future, post-MVP)

Imported brownfield projects can be adopted into editable greenfield projects. This regenerates HCL from the graph and **loses original formatting**. Clearly communicated in the UI. Full round-trip preserving user formatting requires `hclwrite` surgical edits and is explicitly out of MVP scope — see [ADR-0001](./adr/0001-architecture-pattern.md#out-of-scope).

---

## 6. Cross-cutting concerns

### Logging

- `log/slog` from stdlib. JSON handler in production. Text handler in dev.
- Every request gets a request ID injected by middleware; all logs include it.

### Observability

Current state: structured logging only. The rest is the intended design,
wired as the surfaces they observe come online.

- `/healthz` (liveness) is wired today.
- `/readyz` (readiness with a DB ping) — *planned*, lands with the persistence layer.
- Metrics at `/metrics` (Prometheus format) — *planned*, folds in with the runner.
- OpenTelemetry traces opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` — *planned*, earns its keep once multi-hop flows (HTTP → use case → runner → DB) exist.

### Error handling

- Domain returns typed errors (sentinel `var Err... = errors.New(...)`).
- Application layer wraps with context via `fmt.Errorf("...: %w", err)`.
- HTTP layer maps to Huma `ProblemDetails` (RFC 7807) for client-readable errors.

### Configuration

- Env vars only. No config files. `godotenv` in dev to load `.env.local`.
- `internal/config/` exports a `Config` struct with `LoadFromEnv()`.

### Security

The 11 May 2026 `@tanstack/*` npm supply-chain attack ([TanStack postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)) shaped the following measures.

**Frontend dependency hygiene:**
- Exact version pins in `package.json` (no `^`, no `~`).
- `.npmrc` enforces `minimum-release-age=24h` — refuses to install packages published within the last 24 hours.
- CI runs `pnpm audit signatures` on every PR.
- `pnpm-lock.yaml` committed and verified by CI (`pnpm install --frozen-lockfile`).

**Backend dependency hygiene:**
- `go.sum` committed and verified in CI (`go mod verify`).
- Dependabot watches npm, Go modules, and GitHub Actions weekly and proposes grouped upgrade PRs (`.github/dependabot.yml`).

**Runner sandbox:**
- Terraform containers spawned with `--network=none` after `terraform init` (init needs network for provider download; everything else does not).
- Read-only filesystem except for an ephemeral working directory.
- CPU and memory caps (cgroup limits).
- Strict timeouts (`validate` 30s; `plan` 2min).
- No host AWS credentials. Brownfield validation runs `terraform plan -refresh=false` with stub provider configurations.
- `apply` is **not exposed** in the MVP and would require explicit ADR work.

**API:**
- HTTPS in production, HSTS, secure cookies.
- CORS allowlist configured per environment.
- Request size limits enforced by Huma.

### Testing strategy

- **Domain:** table-driven unit tests, `testing` + `testify/assert`. Zero mocks.
- **Application:** use case tests with in-memory adapter implementations.
- **Adapters:** contract tests against real Postgres (testcontainers-go) and real SQLite.
- **HTTP:** end-to-end with `httptest.Server`.
- **Frontend:** Vitest unit tests for hooks/stores; Playwright for E2E (covers the canvas drag-and-drop greenfield happy path).

---

## 7. Build, deploy, and develop

### Local development

The default local stack uses **SQLite as a single file** — no Docker, no infrastructure to start. Postgres is supported via `DATABASE_URL` for users who want to validate against both engines.

```bash
# Apply migrations (creates apps/server/calco.db on first run).
task db:migrate

# Run the Go server with hot reload (air).
task server:dev

# Run the frontend dev server.
task web:dev

# Regenerate TS types from the running server's /openapi.json.
task web:gen-types
```

To run against Postgres instead, export `DATABASE_URL` before invoking `db:migrate`:

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/calco?sslmode=disable"
task db:migrate
```

### Build (server)

```bash
cd apps/server
go build -o bin/calco ./cmd/server
```

Static binary. No CGO. Cross-compiles freely for Linux, macOS, Windows.

### Build (web)

```bash
cd apps/web
pnpm build
```

Produces static assets in `dist/`. Served by any web server or CDN.

### Deployment

- **Self-host:** a single Go binary serving the API plus the built frontend assets. SQLite file alongside the binary. No infrastructure required beyond the host. Optional Docker image for those who prefer container-based deploys.
- **Hosted (paid version):** AWS ECS Fargate with Postgres on RDS. Defined in a separate private repository (`calco-cloud`). Frontend served from CloudFront + S3. Backend behind an ALB.

The `infra/` directory in this repo holds Terraform modules used by both self-host examples and the hosted environment — eating our own dog food.

---

## 8. Open core split

calco is **open core**. The public repository (this one) is licensed under [Apache 2.0](../LICENSE). A separate **private** repository `calco-cloud` holds:

- Authentication (Auth.js, magic links, SSO).
- Multi-tenancy (workspaces, RBAC, audit logs).
- AWS account connection (assume-role, credential vault).
- Billing (Stripe).
- The hosted infrastructure that runs `calco.dev`.

The private repository **depends on** packages and binaries built from the public repository. Communication is via published Go modules and built binaries — there is no shared private code in the public repo.

---

## 9. Anti-features (explicitly NOT in MVP)

Documented here so we resist the temptation:

| Feature | Why not in MVP |
|---|---|
| Real-time multi-user collaboration | Adds CRDT or WebSocket complexity for an unvalidated need. |
| Microservices | Premature distribution. Modular boundaries inside the monolith are enough. |
| Event sourcing / CQRS | Overkill. Version history can live as a simple table when needed. |
| Auth, multi-tenancy, RBAC | Belong in `calco-cloud` private repo. The public binary is single-user, local. |
| Round-trip editing of imported HCL | Requires surgical AST edits with `hclwrite`. v2 feature. |
| `terraform apply` from the app | Out of scope. Validate + plan only. Would require explicit security ADR. |
| Multi-cloud (GCP, Azure) | AWS only in v1. |
| Mobile / native apps | Web only. |
| Plugin system, custom modules marketplace | v3 if ever. |

---

## 10. References

| Decision | ADR |
|---|---|
| Architecture pattern | [`docs/adr/0001-architecture-pattern.md`](./adr/0001-architecture-pattern.md) |
| Backend language | [`docs/adr/0002-backend-language.md`](./adr/0002-backend-language.md) |
| API and web framework | [`docs/adr/0003-api-and-web-framework.md`](./adr/0003-api-and-web-framework.md) |
| Data layer | [`docs/adr/0004-data-layer.md`](./adr/0004-data-layer.md) |
| License | Apache 2.0 — see [LICENSE](../LICENSE) and [README §License](../README.md#license) |
| Color palette | Documented in [`BRAND.md`](./BRAND.md) (no separate ADR needed) |

---

## 11. Document maintenance

This document changes when the architecture changes. Patch versions and dependency bumps do **not** require an update. Major version bumps, new ADRs, or changes to the layered structure **do**.

When making a change:
1. Open an ADR for the new decision (or reference an existing one).
2. Update the affected section here.
3. Cross-link the ADR.

The pattern is: **ADRs capture the decision in time; ARCHITECTURE.md reflects the current consolidated state**.
