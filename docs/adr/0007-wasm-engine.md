# ADR-0007 — The domain core as an in-browser WASM engine

- **Status:** Accepted
- **Date:** 2026-08-17
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

The interactive flows talk to exactly two backend endpoints — `POST /api/v1/import`
and `POST /api/v1/generate` — and nothing else touches the network; canvas,
layout, diagnostics grouping, the catalog and the folder picker are all client-side.
That single REST dependency is also the only thing standing between the app and a
serverless, static deployment such as GitHub Pages.

A spike (compiled the domain core to `js/wasm`, ran a real EKS import in the
browser) showed the engine is a pure function of its input: `hcl.Import`/`hcl.Generate`
have no port dependencies — no `os.`, `net/http` or `filepath` — and operate over an
in-memory file map. The module builds at ~2 MB gzipped, boots in ~130 ms and imports
the verification repo (87 files, 107 resources, 8 local modules) in ~430 ms — numbers
identical to the REST pipeline.

## Decision

Compile the Go domain core to WebAssembly and run import + generate **in the
browser**, so the whole app is a static site:

1. **`apps/server/cmd/wasm`** (`//go:build js && wasm`, a separate `main` package)
   exposes two globals, `calcoImport(filesJSON)` and `calcoGenerate(modelJSON)`,
   reusing the existing application use cases and the `apimodel` wire types. The
   wire JSON is byte-compatible with the REST endpoints, so the client already has
   the types (`types.gen.ts` is generated from the same OpenAPI spec).
2. **`apps/web/src/lib/wasm-core.ts`** boots the engine lazily and idempotently
   (`ensureEngine()`), then `importRepo(files)` / `generateHCL(model)` replace the
   two `apiClient` calls. Import and Export panels call those instead of `fetch`.
3. **The engine is a build artefact, never committed.** `task wasm:build` compiles
   it into `apps/web/public/` for Vite to serve (gitignored); `task dev` and
   `task build` depend on it, so a fresh clone works without extra steps.
4. **GitHub Pages** deploy via `.github/workflows/pages.yml`: builds the web + the
   WASM engine in CI, sets `CALCO_BASE=/calco/` (the repo subpath), and publishes
   `apps/web/dist` with `actions/deploy-pages`.

## Consequences

### Positive

- The app runs from a purely static origin. Verified end-to-end on a production
  build served without any backend: EKS import → 107 resources, 841 diagnostics,
  8 module containers; example → generated HCL; zero requests to the API.
- Matches the importer's zero-infrastructure philosophy (ADR-0006): module
  resolution is already path arithmetic over uploaded files; now it happens on
  the client itself.
- The REST API and the server binary are untouched, so the hosted product keeps
  its full surface (templates, auth, database) later with no rework.

### Negative

- ~2 MB gzipped engine (the full HCL parser) loads before import/generate; a
  shared main-thread module blocks for ~130 ms at boot. Acceptable for a design
  tool, worth a Web Worker + `godotenv`-style prefetch if it ever matters.
- Domain changes require regenerating the artefact (`task wasm:build`) — the
  Pages workflow does this on every build, so deployed drift is limited to the
  PR gap between engine change and deploy.
- The engine and the API must stay wire-compatible by convention. Risky only if
  they diverge silently; the OpenAPI drift check (CI) keeps the shared types
  honest.

### Neutral

- Importing a folder still relies on `webkitdirectory` (Chrome/Edge/Firefox);
  Safari users get the paste / drag-drop path, unchanged by this ADR.
- The engine is built with `-ldflags="-s -w"`; measurements showed symbols cost
  ~2%, so size comes from the parser, not debug info.

## Alternatives considered

### Static frontend on Pages + API on a free tier

Rejected: works with almost no code, but the site is not actually static — it
sleeps, needs CORS configuration and an external account, and contradicts the
zero-infra direction.

### Reimplement the importer/generator in TypeScript

Rejected: a second implementation guarantees drift between the two engines, and
the whole point of the Go core is a single source of truth for HCL.

### Keep requiring the backend (no Pages)

Rejected at the product level: a visual tool that cannot be shown to the world
without running servers is harder to share; the spike proved the cost of going
static is small and bounded.