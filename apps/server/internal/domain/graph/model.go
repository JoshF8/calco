package graph

// Position is a resource's location on the canvas. It carries no semantic
// meaning for code generation; it exists so the visual layout survives a
// save/load round-trip.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Resource is a single infrastructure resource (e.g. an aws_vpc).
type Resource struct {
	// ID is the stable internal identity (UUID). It never changes once
	// assigned, even when Name does.
	ID ResourceID `json:"id"`
	// Type is the Terraform resource type, e.g. "aws_vpc".
	Type string `json:"type"`
	// Name is the Terraform-name slug, e.g. "main" → address aws_vpc.main.
	// It is user-editable and must be unique per Type within a Model.
	Name string `json:"name"`
	// Attributes are the resource's arguments, keyed by HCL argument name.
	Attributes map[string]AttrValue `json:"attributes"`
	// Blocks are the resource's nested blocks, in order. Nested blocks are
	// distinct from attributes: they repeat (e.g. several ingress blocks on a
	// security group), carry order, and may themselves contain blocks.
	Blocks []Block `json:"blocks"`
	// Position is the canvas placement.
	Position Position `json:"position"`
}

// Block is a nested HCL block inside a resource — e.g. an ingress block on an
// aws_security_group, a default_action on an aws_lb_listener, or an
// ebs_block_device on an aws_instance. Blocks are ordered and repeatable, so
// they live in their own slice rather than in the attribute map. Blocks can
// nest arbitrarily deep (a block's body contains its own attributes and
// blocks), which is how nested structures like aws_lb_listener's default_action
// forwarding blocks are expressed.
type Block struct {
	// Type is the block type label, e.g. "ingress", "default_action".
	// Terraform block types are bare identifiers, exactly like attribute
	// names, so nameRe gates them against injection into generated HCL.
	Type string `json:"type"`
	// Attributes are the block's arguments, keyed by HCL argument name.
	Attributes map[string]AttrValue `json:"attributes"`
	// Blocks are this block's nested blocks, in order.
	Blocks []Block `json:"blocks"`
}

// walkRefs appends every ResourceID referenced anywhere in this block — its
// own attribute values and its nested blocks' — in deterministic order:
// blocks in slice order, attributes in sorted-name order.
func (b Block) walkRefs(dst []ResourceID) []ResourceID {
	for _, name := range sortedKeys(b.Attributes) {
		dst = b.Attributes[name].walkRefs(dst)
	}
	for i := range b.Blocks {
		dst = b.Blocks[i].walkRefs(dst)
	}
	return dst
}

// valid reports whether the block is safe to hand to the HCL generator: a
// valid identifier as its type label, every attribute key a valid identifier
// with a well-formed value, and every nested block valid. Reference targets
// are not checked here (they may point forward in the model; Validate resolves
// them after the whole model is known).
func (b Block) valid() bool {
	if !nameRe.MatchString(b.Type) {
		return false
	}
	for name, v := range b.Attributes {
		if !nameRe.MatchString(name) || !v.Valid() {
			return false
		}
	}
	for i := range b.Blocks {
		if !b.Blocks[i].valid() {
			return false
		}
	}
	return true
}

// Address returns the Terraform address "type.name" (e.g. "aws_vpc.main").
func (r Resource) Address() string {
	return r.Type + "." + r.Name
}

// Edge is a directed dependency from one resource to another, used by the
// canvas to render connections. The authoritative source of dependency
// information is the set of Ref values inside resource attributes (see
// Model.DeriveEdges); an Edge mirrors that for layout and may also represent
// a hand-drawn connection. Edges must never be the only home for a
// dependency, or the generator could order resources without being able to
// emit the reference text.
type Edge struct {
	// From is the dependent resource (the one whose attribute holds the ref).
	From ResourceID `json:"from"`
	// To is the dependency (the referenced resource).
	To ResourceID `json:"to"`
	// Attribute is the argument on From that creates the dependency.
	Attribute string `json:"attribute"`
}

// Variable is a Terraform input variable.
type Variable struct {
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Default     *AttrValue `json:"default,omitempty"`
	Description string     `json:"description,omitempty"`
	Sensitive   bool       `json:"sensitive,omitempty"`
}

// Output is a Terraform output value.
type Output struct {
	Name        string    `json:"name"`
	Value       AttrValue `json:"value"`
	Description string    `json:"description,omitempty"`
	Sensitive   bool      `json:"sensitive,omitempty"`
}

// Model is a complete infrastructure design: the single source of truth
// between the canvas and the generated Terraform.
type Model struct {
	Resources []Resource `json:"resources"`
	Edges     []Edge     `json:"edges"`
	Variables []Variable `json:"variables"`
	Outputs   []Output   `json:"outputs"`
}

// NewModel returns an empty Model with non-nil slices.
func NewModel() *Model {
	return &Model{
		Resources: []Resource{},
		Edges:     []Edge{},
		Variables: []Variable{},
		Outputs:   []Output{},
	}
}
