package hcl

import (
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/JoshF8/calco/apps/server/internal/domain/graph"
)

// findAddr returns the resource at "type.name" or fails the test.
func findAddr(t *testing.T, m *graph.Model, typ, name string) *graph.Resource {
	t.Helper()
	r, ok := m.FindResourceByAddress(typ, name)
	if !ok {
		t.Fatalf("resource %s.%s not imported", typ, name)
	}
	return r
}

func TestImportLiteralsAndReference(t *testing.T) {
	src := `
resource "aws_vpc" "main" {
  cidr_block         = "10.0.0.0/16"
  enable_dns_support = true
  max_size           = 65535
}

resource "aws_subnet" "a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = false
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}

	vpc := findAddr(t, m, "aws_vpc", "main")
	if got := vpc.Attributes["cidr_block"]; got.Kind != graph.KindLiteral || got.Lit != "10.0.0.0/16" {
		t.Errorf("cidr_block = %+v", got)
	}
	if got := vpc.Attributes["enable_dns_support"]; got.LitType != graph.LitBool || got.Lit != "true" {
		t.Errorf("enable_dns_support = %+v", got)
	}
	// Number keeps exact source text (not 65535.0).
	if got := vpc.Attributes["max_size"]; got.LitType != graph.LitNumber || got.Lit != "65535" {
		t.Errorf("max_size = %+v", got)
	}

	sub := findAddr(t, m, "aws_subnet", "a")
	ref := sub.Attributes["vpc_id"]
	if ref.Kind != graph.KindRef || ref.RefTarget != vpc.ID || ref.RefAttribute != "id" {
		t.Errorf("vpc_id ref = %+v (want ref to %s .id)", ref, vpc.ID)
	}
	if got := sub.Attributes["map_public_ip_on_launch"]; got.LitType != graph.LitBool || got.Lit != "false" {
		t.Errorf("map_public_ip_on_launch = %+v", got)
	}
}

func TestImportListOfReferences(t *testing.T) {
	src := `
resource "aws_security_group" "a" {}
resource "aws_security_group" "b" {}
resource "aws_instance" "web" {
  vpc_security_group_ids = [aws_security_group.a.id, aws_security_group.b.id]
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	web := findAddr(t, m, "aws_instance", "web")
	list := web.Attributes["vpc_security_group_ids"]
	if list.Kind != graph.KindList || len(list.Items) != 2 {
		t.Fatalf("vpc_security_group_ids = %+v", list)
	}
	sgA := findAddr(t, m, "aws_security_group", "a")
	sgB := findAddr(t, m, "aws_security_group", "b")
	if list.Items[0].RefTarget != sgA.ID || list.Items[1].RefTarget != sgB.ID {
		t.Errorf("list refs = %+v (want a=%s b=%s)", list.Items, sgA.ID, sgB.ID)
	}
}

func TestImportResolvesInterpolationStyleReferences(t *testing.T) {
	// Terraform 0.11-era quoted-interpolation reference style, still common in
	// the wild. Both the scalar and list forms must resolve to real refs.
	src := `
resource "aws_security_group" "sg" {}
resource "aws_subnet" "a" {}
resource "aws_instance" "web" {
  subnet_id              = "${aws_subnet.a.id}"
  vpc_security_group_ids = ["${aws_security_group.sg.id}"]
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	web := findAddr(t, m, "aws_instance", "web")
	sub := findAddr(t, m, "aws_subnet", "a")
	sg := findAddr(t, m, "aws_security_group", "sg")

	if got := web.Attributes["subnet_id"]; got.Kind != graph.KindRef || got.RefTarget != sub.ID {
		t.Errorf("subnet_id (scalar interpolation) = %+v", got)
	}
	list := web.Attributes["vpc_security_group_ids"]
	if list.Kind != graph.KindList || len(list.Items) != 1 || list.Items[0].RefTarget != sg.ID {
		t.Errorf("vpc_security_group_ids (list interpolation) = %+v", list)
	}
}

func TestImportReferencesResolveAcrossFiles(t *testing.T) {
	files := map[string]string{
		"network.tf": `resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }`,
		"compute.tf": `resource "aws_subnet" "a" { vpc_id = aws_vpc.main.id }`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	vpc := findAddr(t, m, "aws_vpc", "main")
	sub := findAddr(t, m, "aws_subnet", "a")
	if sub.Attributes["vpc_id"].RefTarget != vpc.ID {
		t.Errorf("cross-file ref did not resolve: %+v", sub.Attributes["vpc_id"])
	}
}

func TestImportNestedBlocks(t *testing.T) {
	src := `
resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.front.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb" "front" {}
resource "aws_lb_target_group" "web" {}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}

	sg := findAddr(t, m, "aws_security_group", "web")
	if len(sg.Blocks) != 2 {
		t.Fatalf("want 2 blocks on web, got %+v", sg.Blocks)
	}
	if got := sg.Blocks[0].Type; got != "ingress" {
		t.Fatalf("block[0].Type = %q, want ingress", got)
	}
	if got := sg.Blocks[0].Attributes["from_port"].Lit; got != "443" {
		t.Errorf("ingress.from_port = %q, want 443", got)
	}
	// A reference inside a block resolves against the same index.
	vpc := findAddr(t, m, "aws_vpc", "main")
	if ref := sg.Attributes["vpc_id"].RefTarget; ref != vpc.ID {
		t.Errorf("vpc_id ref = %v, want %s", ref, vpc.ID)
	}
	cidrs := sg.Blocks[1].Attributes["cidr_blocks"]
	if cidrs.Kind != graph.KindList || len(cidrs.Items) != 1 {
		t.Errorf("egress.cidr_blocks = %+v", cidrs)
	}

	// Nested-block references create real dependencies (lb before listener).
	l := findAddr(t, m, "aws_lb_listener", "http")
	if len(l.Blocks) != 1 || l.Blocks[0].Type != "default_action" {
		t.Fatalf("default_action not imported: %+v", l.Blocks)
	}
	act := l.Blocks[0].Attributes["target_group_arn"]
	if act.Kind != graph.KindRef {
		t.Fatalf("default_action.target_group_arn = %+v, want ref", act)
	}
	tg := findAddr(t, m, "aws_lb_target_group", "web")
	if act.RefTarget != tg.ID || act.RefAttribute != "arn" {
		t.Errorf("target_group_arn ref = %+v, want %s .arn", act, tg.ID)
	}
	// The imported model preserves block references in DeriveEdges.
	found := false
	for _, e := range m.DeriveEdges() {
		if e.From == l.ID && e.To == tg.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("no edge from listener to target group; got %+v", m.DeriveEdges())
	}
}

func TestImportLabeledBlocksAreDiagnosed(t *testing.T) {
	src := `
resource "aws_security_group" "web" {
  name = "web-sg"

  dynamic "ingress" {
    for_each = var.ports
    content {
      protocol = "tcp"
    }
  }
}
`
	_, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	found := false
	for _, d := range diags {
		if strings.Contains(d.Reason, "dynamic") && strings.Contains(d.Reason, "labels") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a label diagnostic for dynamic ingress; got %+v", diags)
	}
}

func TestImportDiagnosesUnsupportedConstructs(t *testing.T) {
	src := `
resource "aws_s3_bucket" "b" {
  bucket = "my-bucket"
  tags   = jsonencode({ Name = "x" })
  policy = data.aws_iam_policy_document.this.json
  region = var.region

  lifecycle_rule {
    enabled = true
    prefix  = "logs/"
  }
}

variable "region" {
  type = string
}
`
	m, diags, err := Import(map[string]string{"main.tf": src})
	if err != nil {
		t.Fatalf("import: %v", err)
	}

	// Only the plain string literal survives as an attribute.
	b := findAddr(t, m, "aws_s3_bucket", "b")
	if len(b.Attributes) != 1 || b.Attributes["bucket"].Lit != "my-bucket" {
		t.Errorf("expected only bucket attribute, got %+v", b.Attributes)
	}
	// The nested block imports (not a bare attribute), preserving its order.
	if len(b.Blocks) != 1 || b.Blocks[0].Type != "lifecycle_rule" {
		t.Fatalf("expected lifecycle_rule block, got %+v", b.Blocks)
	}
	if got := b.Blocks[0].Attributes["enabled"].Lit; got != "true" {
		t.Errorf("lifecycle_rule.enabled = %+v, want literal true", b.Blocks[0].Attributes["enabled"])
	}

	// Each unsupported construct is reported, not silently dropped.
	reasons := map[string]bool{}
	for _, d := range diags {
		reasons[d.Attribute] = true
	}
	for _, want := range []string{"tags", "policy", "region"} {
		if !reasons[want] {
			t.Errorf("missing diagnostic for %q; got %+v", want, diags)
		}
	}
	// The variable block is reported as not-yet-imported.
	foundVar := false
	for _, d := range diags {
		if strings.Contains(d.Reason, "variable") {
			foundVar = true
		}
	}
	if !foundVar {
		t.Errorf("expected a diagnostic for the variable block; got %+v", diags)
	}
}

func TestImportRejectsInvalidHCL(t *testing.T) {
	_, _, err := Import(map[string]string{"broken.tf": `resource "aws_vpc" "main" {`})
	if err == nil {
		t.Fatal("expected a parse error for unbalanced braces")
	}
}

// --- round-trip: Generate then Import must reproduce the model up to the
// freshly-minted resource IDs (compared by address). This ties the generator
// and the parser together: any asymmetry between them fails here.

func canonVal(m *graph.Model, v graph.AttrValue) string {
	switch v.Kind {
	case graph.KindLiteral:
		return "lit:" + string(v.LitType) + ":" + v.Lit
	case graph.KindRef:
		return "ref:" + addressOf(m, v.RefTarget) + "." + v.RefAttribute
	case graph.KindList:
		parts := make([]string, len(v.Items))
		for i, it := range v.Items {
			parts[i] = canonVal(m, it)
		}
		return "list[" + strings.Join(parts, ",") + "]"
	}
	return "?"
}

// canonBlock reduces a block to "type{attr:val,…}[sub…]" in block/attribute
// order, so block round-trips are compared structurally.
func canonBlock(m *graph.Model, b graph.Block) string {
	attrs := make([]string, 0, len(b.Attributes))
	for name, v := range b.Attributes {
		attrs = append(attrs, name+"="+canonVal(m, v))
	}
	sort.Strings(attrs)
	var sb strings.Builder
	sb.WriteString(b.Type)
	sb.WriteString("{")
	sb.WriteString(strings.Join(attrs, ","))
	sb.WriteString("}")
	for _, sub := range b.Blocks {
		sb.WriteString("[" + canonBlock(m, sub) + "]")
	}
	return sb.String()
}

// canonModel reduces a model to address -> (attributes, blocks), which is
// invariant under the ID remapping an import performs.
func canonModel(m *graph.Model) map[string]struct {
	Attrs  map[string]string
	Blocks []string
} {
	out := map[string]struct {
		Attrs  map[string]string
		Blocks []string
	}{}
	for i := range m.Resources {
		r := &m.Resources[i]
		am := map[string]string{}
		for k, v := range r.Attributes {
			am[k] = canonVal(m, v)
		}
		blocks := make([]string, len(r.Blocks))
		for j, b := range r.Blocks {
			blocks[j] = canonBlock(m, b)
		}
		out[r.Address()] = struct {
			Attrs  map[string]string
			Blocks []string
		}{Attrs: am, Blocks: blocks}
	}
	return out
}

func TestImportRoundTripsGeneratedHCL(t *testing.T) {
	vpc := rid("01")
	sub := rid("02")
	sg := rid("03")
	orig := &graph.Model{
		Resources: []graph.Resource{
			{ID: vpc, Type: "aws_vpc", Name: "main", Attributes: map[string]graph.AttrValue{
				"cidr_block": graph.String("10.0.0.0/16"),
				"max_size":   graph.Int(65535),
			}},
			{ID: sub, Type: "aws_subnet", Name: "a", Attributes: map[string]graph.AttrValue{
				"vpc_id":     graph.Ref(vpc, "id"),
				"cidr_block": graph.String("10.0.1.0/24"),
			}},
			{ID: sg, Type: "aws_security_group", Name: "web", Attributes: map[string]graph.AttrValue{
				"name": graph.String("web"),
			}, Blocks: []graph.Block{
				{
					Type: "ingress",
					Attributes: map[string]graph.AttrValue{
						"from_port":   graph.Int(443),
						"protocol":    graph.String("tcp"),
						"cidr_blocks": graph.List(graph.String("0.0.0.0/0")),
					},
				},
			}},
			{ID: rid("04"), Type: "aws_instance", Name: "web", Attributes: map[string]graph.AttrValue{
				"instance_type":          graph.String("t3.micro"),
				"vpc_security_group_ids": graph.List(graph.Ref(sg, "id")),
			}},
		},
	}

	files, err := Generate(orig)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	imported, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	// providers.tf holds only terraform/provider blocks, ignored silently.
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics on round-trip: %+v", diags)
	}
	if err := imported.Validate(); err != nil {
		t.Fatalf("imported model does not validate: %v", err)
	}

	want := canonModel(orig)
	got := canonModel(imported)
	if !reflect.DeepEqual(want, got) {
		t.Errorf("round-trip mismatch:\n orig = %#v\n imp  = %#v", want, got)
	}
}

func TestImportResolvesLocalModule(t *testing.T) {
	files := map[string]string{
		"main.tf": `
module "vpc" {
  source = "./modules/vpc"
  name   = "prod"
}
`,
		"modules/vpc/main.tf": `
variable "name" { type = string }
variable "cidr"  { default = "10.0.0.0/16" }

resource "aws_vpc" "this" {
  cidr_block = "10.0.0.0/16"
}
`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}

	if len(m.Modules) != 1 {
		t.Fatalf("expected 1 module, got %d", len(m.Modules))
	}
	mod := m.Modules[0]
	if mod.Name != "vpc" || mod.Source != "./modules/vpc" || !mod.Local {
		t.Errorf("module = %+v", mod)
	}
	vpc := findAddr(t, m, "aws_vpc", "this")
	if len(mod.Resources) != 1 || mod.Resources[0] != vpc.ID {
		t.Errorf("module.Resources = %v, want [%s]", mod.Resources, vpc.ID)
	}
	if got := mod.Arguments["name"]; got.Kind != graph.KindLiteral || got.Lit != "prod" {
		t.Errorf("module name argument = %+v, want literal prod", got)
	}
	// The module's variable/output blocks are its interface: silent, and the
	// module's internal var ref stays diagnosed (never guessed).
	if _, found := diagReason(diags, func(d Diagnostic) bool { return strings.Contains(d.Reason, "variable") }); found {
		t.Errorf("module interface variables should be silent; got %+v", diags)
	}
}

func TestImportLocalModuleShowsInternalVarRefs(t *testing.T) {
	files := map[string]string{
		"main.tf":                `module "m" { source = "./modules/m" }`,
		"modules/m/main.tf":      `resource "aws_vpc" "v" { cidr_block = var.cidr }`,
		"modules/m/variables.tf": `variable "cidr" {}`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(m.Modules) != 1 || !m.Modules[0].Local {
		t.Fatalf("expected a resolved local module, got %+v", m.Modules)
	}
	// The module groups the resource; the var reference inside it is diagnosed
	// honestly rather than resolved by guessing a default.
	var refFound bool
	for _, d := range diags {
		if d.Address == "aws_vpc.v" && d.Attribute == "cidr_block" {
			refFound = true
		}
	}
	if !refFound {
		t.Errorf("expected a diagnostic for the internal var ref; got %+v", diags)
	}
}

func TestImportDiagnosesRemoteModule(t *testing.T) {
	files := map[string]string{
		"main.tf": `
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  version = "20.0.0"
}
`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(m.Modules) != 0 {
		t.Errorf("remote module must not be resolved: %+v", m.Modules)
	}
	msg, found := diagReason(diags, func(d Diagnostic) bool {
		return strings.Contains(d.Reason, "module") && strings.Contains(d.Reason, "not imported")
	})
	if !found {
		t.Fatalf("expected a module diagnostic; got %+v", diags)
	}
	if !strings.Contains(msg, "module") {
		t.Errorf("reason = %q", msg)
	}
}

func TestImportModuleArgumentReferencesCallerResource(t *testing.T) {
	files := map[string]string{
		"main.tf": `
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

module "m" {
  source = "./modules/m"
  vpc_id = aws_vpc.main.id
}
`,
		"modules/m/main.tf": `resource "aws_subnet" "s" {}`,
	}
	m, _, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	vpc := findAddr(t, m, "aws_vpc", "main")
	mod := m.Modules[0]
	ref, ok := mod.Arguments["vpc_id"]
	if !ok || ref.Kind != graph.KindRef || ref.RefTarget != vpc.ID || ref.RefAttribute != "id" {
		t.Errorf("module vpc_id = %+v, want ref to %s.id", ref, vpc.ID)
	}
}

func TestImportNestedLocalModulesAssignDeepest(t *testing.T) {
	files := map[string]string{
		"main.tf": `
module "a" { source = "./modules/a" }
module "a_sub" { source = "./modules/a/sub" }
`,
		"modules/a/main.tf":     `resource "aws_vpc" "outer" {}`,
		"modules/a/sub/main.tf": `resource "aws_subnet" "inner" {}`,
	}
	m, _, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(m.Modules) != 2 {
		t.Fatalf("expected 2 modules, got %+v", m.Modules)
	}
	var outer, inner *graph.Module
	for i := range m.Modules {
		switch m.Modules[i].Source {
		case "./modules/a":
			outer = &m.Modules[i]
		case "./modules/a/sub":
			inner = &m.Modules[i]
		}
	}
	if outer == nil || inner == nil {
		t.Fatalf("modules = %+v", m.Modules)
	}
	if len(inner.Resources) != 1 || addressOf(m, inner.Resources[0]) != "aws_subnet.inner" {
		t.Errorf("nested module resources = %+v", inner.Resources)
	}
	if len(outer.Resources) != 1 || addressOf(m, outer.Resources[0]) != "aws_vpc.outer" {
		t.Errorf("outer module resources = %+v", outer.Resources)
	}
}

func TestImportSharedLocalModuleGroupsOnce(t *testing.T) {
	files := map[string]string{
		"main.tf": `
module "a" { source = "./modules/m" }
module "b" { source = "./modules/m" }
`,
		"modules/m/main.tf": `resource "aws_vpc" "v" {}`,
	}
	m, diags, err := Import(files)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	// One container per source dir; both invocations resolve (no diagnostics).
	if len(m.Modules) != 1 {
		t.Errorf("expected one shared module container, got %+v", m.Modules)
	}
	if _, found := diagReason(diags, func(d Diagnostic) bool { return strings.Contains(d.Reason, "module") }); found {
		t.Errorf("both invocations resolve; got %+v", diags)
	}
}

// diagReason returns the first diagnostic matching pred (and whether one was
// found), mirroring the small assertions used across the suite.
func diagReason(diags []Diagnostic, pred func(Diagnostic) bool) (string, bool) {
	for _, d := range diags {
		if pred(d) {
			return d.Reason, true
		}
	}
	return "", false
}
