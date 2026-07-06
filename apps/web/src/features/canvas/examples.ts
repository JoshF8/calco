// Ready-made example graphs for the empty canvas. Each example is a small but
// real AWS architecture built only from the current catalog, so loading one is
// both a starting point and a live demonstration of the connection and
// containment rules — every edge here is one a user could draw by hand.
//
// Metadata (name, description) is NOT stored here: it is resolved at render
// time from i18n keys canvas.example.<id>.name / .desc, so the picker follows
// the language like the rest of the canvas.
import { MarkerType, type Edge } from '@xyflow/react';
import type { ResourceNode } from './store';
import { connectionRule } from './connection';
import { isContainer } from './containment';

interface Built {
  nodes: ResourceNode[];
  edges: Edge[];
}

interface Size {
  width: number;
  height: number;
}

// mk builds a node. Containers carry an explicit size; nested nodes carry a
// parentId and a parent-relative position — React Flow's model, mirrored by the
// store. The containment reference (vpc_id / subnet_id) is derived from
// parentId at projection time, exactly as an interactive nest would be.
function mk(
  type: string,
  name: string,
  position: { x: number; y: number },
  opts: { size?: Size; parentId?: string } = {},
): ResourceNode {
  return {
    id: crypto.randomUUID(),
    type: isContainer(type) ? 'container' : 'resource',
    position,
    ...(opts.size ?? {}),
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
    data: { type, name, attributes: {} },
  };
}

// connect wires a typed reference edge between two nodes, oriented by the rule
// (dependent -> dependency) exactly as the interactive onConnect does. It
// throws if the pair has no rule, which would be an authoring bug in the
// example — caught by the "every example builds" test, never shipped.
function connect(a: ResourceNode, b: ResourceNode): Edge {
  const rule = connectionRule(a.data.type, b.data.type);
  if (!rule) {
    throw new Error(`example: no connection rule for ${a.data.type} <-> ${b.data.type}`);
  }
  const dependent = a.data.type === rule.from ? a : b;
  const dependency = dependent === a ? b : a;
  return {
    id: crypto.randomUUID(),
    source: dependent.id,
    target: dependency.id,
    type: 'ref',
    data: { attribute: rule.attribute, cardinality: rule.cardinality, refAttr: rule.refAttr },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--xy-edge-stroke)' },
  };
}

// Web tier: a VPC with two subnets, an EC2 instance in each, and a shared
// security group both reference. The canonical starter (kept as the default
// example) — the smallest graph that shows nesting + a list reference.
function web(): Built {
  const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 60 }, { size: { width: 560, height: 340 } });
  const sub1 = mk('aws_subnet', 'subnet_1', { x: 16, y: 52 }, { size: { width: 250, height: 190 }, parentId: vpc.id });
  const sub2 = mk('aws_subnet', 'subnet_2', { x: 288, y: 52 }, { size: { width: 250, height: 190 }, parentId: vpc.id });
  const sg = mk('aws_security_group', 'security_group_1', { x: 20, y: 262 }, { parentId: vpc.id });
  const i1 = mk('aws_instance', 'instance_1', { x: 18, y: 64 }, { parentId: sub1.id });
  const i2 = mk('aws_instance', 'instance_2', { x: 18, y: 64 }, { parentId: sub2.id });
  return { nodes: [vpc, sub1, sub2, sg, i1, i2], edges: [connect(i1, sg), connect(i2, sg)] };
}

// Network foundation: a VPC with a public and a private subnet, an internet
// gateway, and a NAT gateway drawing its address from an Elastic IP.
function network(): Built {
  const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 60 }, { size: { width: 700, height: 430 } });
  const pub = mk('aws_subnet', 'public', { x: 24, y: 56 }, { size: { width: 300, height: 210 }, parentId: vpc.id });
  const priv = mk('aws_subnet', 'private', { x: 360, y: 56 }, { size: { width: 300, height: 210 }, parentId: vpc.id });
  const igw = mk('aws_internet_gateway', 'igw_1', { x: 24, y: 300 }, { parentId: vpc.id });
  const sg = mk('aws_security_group', 'security_group_1', { x: 360, y: 300 }, { parentId: vpc.id });
  const nat = mk('aws_nat_gateway', 'nat_1', { x: 20, y: 70 }, { parentId: pub.id });
  const eip = mk('aws_eip', 'nat_eip', { x: 840, y: 120 });
  return { nodes: [vpc, pub, priv, igw, sg, nat, eip], edges: [connect(nat, eip)] };
}

// Load-balanced app: a load balancer with its target group and listener, in
// front of two instances behind a security group.
function loadBalanced(): Built {
  const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 120 }, { size: { width: 720, height: 470 } });
  const subA = mk('aws_subnet', 'subnet_a', { x: 24, y: 56 }, { size: { width: 310, height: 220 }, parentId: vpc.id });
  const subB = mk('aws_subnet', 'subnet_b', { x: 366, y: 56 }, { size: { width: 310, height: 220 }, parentId: vpc.id });
  const i1 = mk('aws_instance', 'web_1', { x: 18, y: 70 }, { parentId: subA.id });
  const i2 = mk('aws_instance', 'web_2', { x: 18, y: 70 }, { parentId: subB.id });
  const sg = mk('aws_security_group', 'web_sg', { x: 24, y: 320 }, { parentId: vpc.id });
  const tg = mk('aws_lb_target_group', 'web_tg', { x: 366, y: 320 }, { parentId: vpc.id });
  const lb = mk('aws_lb', 'web_lb', { x: 880, y: 160 });
  const listener = mk('aws_lb_listener', 'https', { x: 880, y: 300 });
  return {
    nodes: [vpc, subA, subB, i1, i2, sg, tg, lb, listener],
    edges: [connect(i1, sg), connect(i2, sg), connect(listener, lb)],
  };
}

// Database: an RDS instance wired to its subnet group (spanning two subnets),
// a security group, and a KMS key for encryption at rest.
function database(): Built {
  const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 80 }, { size: { width: 660, height: 410 } });
  const subA = mk('aws_subnet', 'db_a', { x: 24, y: 56 }, { size: { width: 290, height: 200 }, parentId: vpc.id });
  const subB = mk('aws_subnet', 'db_b', { x: 346, y: 56 }, { size: { width: 290, height: 200 }, parentId: vpc.id });
  const sg = mk('aws_security_group', 'db_sg', { x: 24, y: 290 }, { parentId: vpc.id });
  const dbsg = mk('aws_db_subnet_group', 'db_subnets', { x: 800, y: 100 });
  const db = mk('aws_db_instance', 'postgres', { x: 800, y: 240 });
  const kms = mk('aws_kms_key', 'db_key', { x: 800, y: 380 });
  return {
    nodes: [vpc, subA, subB, sg, dbsg, db, kms],
    edges: [connect(dbsg, subA), connect(dbsg, subB), connect(db, dbsg), connect(db, sg), connect(db, kms)],
  };
}

// Secured EC2: an instance that assumes an IAM role through an instance
// profile — the chain that lets EC2 reference a role at all.
function compute(): Built {
  const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 80 }, { size: { width: 520, height: 360 } });
  const sub = mk('aws_subnet', 'app', { x: 24, y: 56 }, { size: { width: 300, height: 210 }, parentId: vpc.id });
  const inst = mk('aws_instance', 'app_1', { x: 18, y: 70 }, { parentId: sub.id });
  const sg = mk('aws_security_group', 'app_sg', { x: 24, y: 290 }, { parentId: vpc.id });
  const profile = mk('aws_iam_instance_profile', 'app_profile', { x: 660, y: 120 });
  const role = mk('aws_iam_role', 'app_role', { x: 660, y: 260 });
  return {
    nodes: [vpc, sub, inst, sg, profile, role],
    edges: [connect(inst, sg), connect(inst, profile), connect(profile, role)],
  };
}

// Serverless: a Lambda with its IAM role, plus the data resources it typically
// leans on — a DynamoDB table, an S3 bucket, and an ECR repository.
function serverless(): Built {
  const fn = mk('aws_lambda_function', 'api', { x: 120, y: 120 });
  const role = mk('aws_iam_role', 'lambda_role', { x: 440, y: 120 });
  const table = mk('aws_dynamodb_table', 'items', { x: 120, y: 300 });
  const bucket = mk('aws_s3_bucket', 'assets', { x: 440, y: 300 });
  const ecr = mk('aws_ecr_repository', 'images', { x: 760, y: 300 });
  return { nodes: [fn, role, table, bucket, ecr], edges: [connect(fn, role)] };
}

/** An example the empty-canvas picker can load. `id` is the i18n key suffix
 * (canvas.example.<id>.name / .desc) and the argument to loadExample. */
export interface ExampleDef {
  id: string;
  build: () => Built;
}

/** The example gallery, in picker order. The first entry is the default loaded
 * by loadExample() with no argument. Between them they use every catalog type. */
export const EXAMPLES: ExampleDef[] = [
  { id: 'web', build: web },
  { id: 'network', build: network },
  { id: 'loadBalanced', build: loadBalanced },
  { id: 'database', build: database },
  { id: 'compute', build: compute },
  { id: 'serverless', build: serverless },
];
