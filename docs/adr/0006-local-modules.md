# ADR-0006 — Local module resolution in the importer

- **Status:** Accepted
- **Date:** 2026-08-17
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

The static importer (`domain.Import`) modeled `resource` blocks and diagnosed
everything else. Measuring real-world repositories, the dominant remaining
diagnostic drivers were exactly the constructs that professional
`terraform-aws-modules`-style repos are made of: `module` blocks, the
`variable`/`output` blocks that form a module's interface, and the
`var.*`/`module.*` references threaded through them. On the EKS repo the import
reported 1609 diagnostics; the `module`/`variable`/`output` causes alone were
roughly a third of them.

Terraform exposes no stable "module boundary" in its graph output, so the
plan-to-graph pipeline does not recover it either. But a large share of module
usage in these repos is **local**: a `module` block whose `source` (`./modules/…`,
`../…`) points at a directory that is itself inside the uploaded file set. The
parser already has those files — resolving those modules is pure path arithmetic,
with zero network and zero terraform binary.

## Decision

Model **local** module invocations as first-class, read-only containers in the
domain model:

```go
type Module struct {
    ID        ResourceID
    Name      string               // block label, e.g. "eks"
    Source    string               // "./modules/eks"
    Local     bool                 // resolved from the imported file set
    Arguments map[string]AttrValue // representable invocation arguments
    Resources []ResourceID         // resources under the source directory
}
```

`Model` gains `Modules []Module`.

Key properties of the design:

1. **One container per unique local source directory.** File keys (the browser's
   `webkitRelativePath`) live in one namespace, so a source is resolved by
   cleaning `dir(declaring-file) + source` against that namespace. Several
   invocations of the same directory (two environments both sourcing
   `./modules/network`) share one container — the canvas shows the module
   source codebase once, not one box per instantiation. The instantiations
   themselves are not modeled yet.
2. **Resources are assigned by deepest-prefix.** A resource under
   `modules/eks/sub/` belongs to the nested module claimed there, not to its
   parent. A resolved module's own `variable`/`output` blocks are its
   *interface* and are silent — no longer diagnosed.
3. **Arguments are stored when representable; failures are aggregated.**
   Literal and resource-reference arguments convert against the same address
   index and are kept on the `Module`. Arguments that reference `var`/`data`/
   `module`/interpolation are **not** diagnosed one-by-one (that exploded the
   count: converting them individually took secure-baseline from 822 to 1434
   diagnostics); instead each invocation emits a single `"module arguments not
   representable"` diagnostic.
4. **Remote modules stay diagnosed.** `source`s that are registry shorthand,
   `git::`, or scheme'd URLs — or that do not resolve to an uploaded directory —
   keep the existing `"module" block not imported yet` diagnostic unchanged. The
   future GithubFetcher pipeline (§5.2 of ARCHITECTURE.md) owns them.
5. **The canvas renders modules as read-only boxes.** `modelToCanvas` creates a
   `module` node (a distinct React Flow type, unselectable, no handles) and its
   resources nest inside it via `parentId`. Containment nesting *within* a module
   still wins, so a subnet nests into its VPC inside the module box. Module
   boxes are excluded from `toApiModel` so export never emits `resource "module"`.

## Consequences

### Positive

- Diagnostics collapse on the real repos used for verification: EKS
  1609 → 841 (the module/variable/output noise is gone; remaining causes are
  genuine `var.*`/interpolation/data/locals references), secure-baseline
  822 → 706 with 11 local modules resolved.
- The canvas now shows structure the graph pipeline cannot: the module boundary
  is visible, with the module's resources grouped inside it.
- Zero infrastructure: resolution is path arithmetic over the already-uploaded
  file set. No `terraform init`, no network, no new runner capability.

### Negative

- Per-argument detail is lost in the aggregated module-arguments diagnostic (a
  single row per invocation instead of one row per unrepresentable argument).
  The module's file is still reachable from the diagnostic group.
- Duplicate invocations of the same source directory are collapsed into one box;
  the distinct instantiations' differing arguments are not modeled.
- Module boundaries are not preserved on export (`toApiModel` drops module
  boxes). This is consistent with the read-only import contract: adopting an
  imported project regenerates clean HCL.

### Neutral

- The generator is untouched — it reads only Resources/Variables/Outputs, so the
  new `Modules` field is inert for generation.
- Remote modules remain the next frontier; the local/remote split is exactly the
  line the static parser can cross honestly.

## Alternatives considered

### Model module arguments per-argument (honest granularity)

Rejected: the spike measured that converting each module argument individually
blew the diagnostic count up (58% of secure-baseline's diagnostics became
module-argument entries, most of them `var.*` references) while the canvas does
not render module arguments yet — pure noise with no consumer.

### Treat local modules as plain resource containers

Rejected: a module is not a resource type; a synthetic `resource "module"` would
corrupt the catalog, the palette, and the export path. A distinct node kind
keeps module boxes visually and semantically separate.

### Resolve remote modules (GithubFetcher + runner)

Deferred to the next milestone. Reading module code from the registry requires
network I/O and version resolution, which the static importer deliberately
avoids; keeping that split is what makes this change safe.