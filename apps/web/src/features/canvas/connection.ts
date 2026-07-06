// Typed connection rules: the non-containment reference layer. A hand-drawn
// connection between two node handles encodes a real Terraform argument on the
// dependent resource — but only when a rule exists for that pair. This table is
// the sibling of containment.ts (nestRule): where containment covers *_id
// scoping refs (vpc_id, subnet_id), this covers the remaining resource-to-
// resource references in the current catalog.
//
// Design decisions baked into the table:
// - Direction is fixed by the rule (from = dependent, to = dependency), so the
//   same visual line always encodes the same thing regardless of drag order.
// - Cardinality is real: vpc_security_group_ids / security_groups are lists;
//   role is a single scalar.
// - refAttr is real: Lambda's role takes the role ARN, everything else the id.
// - Containment attrs (vpc_id, subnet_id) are deliberately absent — they are
//   containment-only and can never be produced by a connection.
//
// Everything NOT in this table is refused and explained (connectionReasonKey),
// rather than silently allowed with an invented argument.

import { canNest } from './containment';

export interface ConnectionRule {
  /** Dependent resource type — the one that holds the reference. */
  from: string;
  /** Dependency resource type — the one being referenced. */
  to: string;
  /** The real AWS argument the reference is written to. */
  attribute: string;
  /** scalar = one ref; list = a tuple of refs ([a.id, b.id]). */
  cardinality: 'scalar' | 'list';
  /** The referenced attribute (id or arn). */
  refAttr: 'id' | 'arn';
}

// AWS-accurate rules for the current 9-type catalog + flat-attribute model.
const rules: ConnectionRule[] = [
  { from: 'aws_instance', to: 'aws_security_group', attribute: 'vpc_security_group_ids', cardinality: 'list', refAttr: 'id' },
  { from: 'aws_db_instance', to: 'aws_security_group', attribute: 'vpc_security_group_ids', cardinality: 'list', refAttr: 'id' },
  { from: 'aws_lb', to: 'aws_security_group', attribute: 'security_groups', cardinality: 'list', refAttr: 'id' },
  { from: 'aws_lambda_function', to: 'aws_iam_role', attribute: 'role', cardinality: 'scalar', refAttr: 'arn' },
];

/** connectionRule returns the rule for a pair in either drag order, with its
 * canonical from/to — so drag direction never decides the encoding. Returns
 * undefined when no valid reference exists between the two types. */
export function connectionRule(a: string, b: string): ConnectionRule | undefined {
  return rules.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

/** An i18n key (+ optional interpolation params) explaining why a pair without a
 * rule is refused. Communicates the AWS reason in artisan voice, never blame. */
export interface ConnectionReason {
  key: string;
  params?: Record<string, string>;
}

/** connectionReasonKey explains why two types can't be connected. Only called
 * for pairs that connectionRule rejects; ordering-independent. */
export function connectionReasonKey(a: string, b: string): ConnectionReason {
  const has = (x: string, y: string) => (a === x && b === y) || (a === y && b === x);
  const involves = (x: string) => a === x || b === x;

  if (a === b) return { key: 'connection.invalid.sameType', params: { type: a } };
  // Containment pairs are nest-only: one relationship, one gesture. Teach the
  // box gesture instead of a generic refusal (this closes A3's UX loop — the
  // scoping ref is produced only by dropping into the container, never by a
  // hand-drawn line).
  if (canNest(a, b)) return { key: 'connection.invalid.useContainment', params: { child: a, container: b } };
  if (canNest(b, a)) return { key: 'connection.invalid.useContainment', params: { child: b, container: a } };
  if (involves('aws_s3_bucket')) return { key: 'connection.invalid.s3' };
  if (has('aws_instance', 'aws_iam_role')) return { key: 'connection.invalid.instanceRole' };
  if (has('aws_lambda_function', 'aws_security_group') || has('aws_lambda_function', 'aws_subnet'))
    return { key: 'connection.invalid.lambdaVpc' };
  if (has('aws_lb', 'aws_instance')) return { key: 'connection.invalid.lbInstance' };
  if (involves('aws_security_group')) return { key: 'connection.invalid.sgSource' };
  return { key: 'connection.invalid.noRule' };
}
