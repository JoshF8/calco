# ADR-0005 — Nested blocks in the graph model

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decision driver:** [@JoshF8](https://github.com/JoshF8)

## Context

Many Terraform resources express their real behaviour through **nested blocks**, not
just arguments: an `aws_security_group` carries `ingress`/`egress`, an
`aws_lb_listener` carries `default_action`, an `aws_launch_template` carries
`ebs_block_device`/`network_interfaces`/`tag_specifications`. A spike measuring
importer fidelity against six real-world repositories found that dropping these
blocks was the dominant cause of loss: the importer produced a "skeleton" and
the resources that define real infrastructure lost most of their substance.

Before this change the domain modeled resource bodies as flat
`Attributes map[string]AttrValue`. Nested blocks were reported as diagnostics
("nested block not modeled yet") and skipped.

## Decision

Add an **ordered, recursively nestable** `Block` structure to the domain model,
as a field alongside the attribute map rather than as an attribute value:

```go
type Block struct {
    Type       string               // e.g. "ingress", "default_action"
    Attributes map[string]AttrValue
    Blocks     []Block              // arbitrary nesting
}
```

Key properties of the design:

1. **Ordered slice, not a map.** Blocks repeat (several `ingress` blocks on one
   security group) and carry order, so they cannot live in a map keyed by type.
   They are kept in source order and generated in model order.
2. **Separate from `AttrValue`, not a fourth kind.** A block is a *syntactic*
   unit (an HCL body), not a *value*. Being in its own slice keeps the value
   algebra (`literal`/`ref`/`list`) untouched, which matters because the
   generator renders values and blocks through different code paths.
3. **Recursive.** A block's body has its own attributes and blocks, which is
   how constructs like `default_action → forward → target_group` are expressed.
4. **Unlabelled blocks only.** `dynamic "type"`, `provisioner`/`connection`
   carry *labels*. Modelling them would fold a code-generation construct
   (`dynamic`/`for_each`) into the model, which is explicitly out of scope; they
   are still diagnosed and skipped, never guessed.

## Consequences

### Positive

- The importer now converts resource nested blocks into `graph.Block` values in
  source order, with references inside blocks resolved against the same address
  index as top-level attributes.
- The generator emits nested blocks after a resource's attributes, preserving
  model order; attributes inside a block remain alphabetized.
- Dependencies are complete: `DeriveEdges`/`TopologicalSort`/`Validate` must
  (and now do) walk block refs, so resources referenced *only* from inside a
  block are still ordered correctly and cycles are still caught.
- Fidelity improves measurably: on the module repos used in the spike, 78–100%
  of static (non-`dynamic`) nested blocks now import, versus 0% before. The
  remaining `dynamic` blocks are reported honestly.

### Negative

- The wire model grows (`Resource.blocks`, recursive `Block`); the frontend
  TypeScript types were regenerated (`types.gen.ts`).
- The canvas does **not** render or author blocks yet — imported projects are
  read-only, so blocks round-trip through the server model but are dropped if an
  imported canvas is reconstructed locally. Editing block content on the canvas
  is future work that now has a shape to attach to.

### Neutral

- `dynamic` blocks (the dominant form in modern module-writing style) remain a
  diagnostic. The spike measured that most nested blocks in professional
  `terraform-aws-modules` are `dynamic "…"` blocks; supporting them means
  modelling `for_each`/`content` expansion, which is deferred.

## Alternatives considered

### Nested blocks as an `AttrValue` kind (`kind = "block"`)

A block would be one kind of value in the tagged union. **Rejected:** repeated
blocks of the same type (the common case) cannot be represented as values in a
keyed map without inventing a synthetic list-of-blocks kind; order would be
ambiguous; and validation/edge-walking would mix value semantics with
body/syntax semantics.

### Wrapping every block in an explicit list type (`type "ingress" → literal
"ingress" = [body, body]`)

Objects indistinguishable from attribute-style `ingress = [...]` arguments.
**Rejected:** conflates a syntax feature (an HCL body with its own nested
blocks) with a value expression. The field `Blocks []Block` on Resource keeps
the distinction visible and the generator's two render paths symmetrical with
HCL's own attribute/block split.