// Curated per-type attribute hints: the discoverability sibling of catalog.ts
// (which types exist), connection.ts (typed references) and containment.ts
// (nesting). For each resource type it lists the arguments you almost always
// set, with their literal type and — softly — which are usually required.
//
// This is deliberately NOT the full AWS provider schema. It is a small,
// opinionated set that powers the Inspector's "suggested attributes"; the free
// -form editor stays as the escape hatch for anything not here, and
// `terraform validate` (the runner) remains the authority on correctness. So
// `required` here is an advisory hint that orders and flags a field — never a
// hard gate (a value may legitimately arrive via a variable or a default).
//
// Arguments produced by a gesture — connection references (vpc_security_group_ids,
// role, kms_key_id, load_balancer_arn, allocation_id, subnet_ids,
// db_subnet_group_name, iam_instance_profile) and containment (vpc_id,
// subnet_id) — are intentionally ABSENT: they come from drawing/nesting, never
// from typing here. The schema.test.ts guard fails the build if one slips in.
import type { components } from '@/lib/types.gen';

type ApiAttrValue = components['schemas']['AttrValue'];

export type AttrType = 'string' | 'number' | 'bool';

export interface AttrSpec {
  /** The real HCL argument name. */
  name: string;
  /** Literal type; drives the editor (text / number / checkbox / enum select). */
  type: AttrType;
  /** Advisory: usually required by AWS. Ordered first and flagged — never gated. */
  required?: boolean;
  /** Known closed set of values, rendered as a select (string-typed only). */
  enum?: string[];
  /** Example value shown as the input placeholder. */
  placeholder?: string;
}

const schemas: Record<string, AttrSpec[]> = {
  aws_vpc: [
    { name: 'cidr_block', type: 'string', required: true, placeholder: '10.0.0.0/16' },
    { name: 'enable_dns_support', type: 'bool' },
    { name: 'enable_dns_hostnames', type: 'bool' },
  ],
  aws_subnet: [
    { name: 'cidr_block', type: 'string', required: true, placeholder: '10.0.1.0/24' },
    { name: 'availability_zone', type: 'string', placeholder: 'us-east-1a' },
    { name: 'map_public_ip_on_launch', type: 'bool' },
  ],
  aws_lb: [
    { name: 'name', type: 'string', placeholder: 'web-alb' },
    { name: 'internal', type: 'bool' },
    { name: 'load_balancer_type', type: 'string', enum: ['application', 'network', 'gateway'] },
  ],
  aws_nat_gateway: [{ name: 'connectivity_type', type: 'string', enum: ['public', 'private'] }],
  aws_instance: [
    { name: 'ami', type: 'string', required: true, placeholder: 'ami-0abcd1234' },
    { name: 'instance_type', type: 'string', required: true, placeholder: 't3.micro' },
    { name: 'key_name', type: 'string' },
    { name: 'monitoring', type: 'bool' },
  ],
  aws_lambda_function: [
    { name: 'function_name', type: 'string', required: true, placeholder: 'my-fn' },
    { name: 'runtime', type: 'string', required: true, enum: ['nodejs20.x', 'python3.12', 'java21', 'ruby3.3', 'provided.al2023'] },
    { name: 'handler', type: 'string', required: true, placeholder: 'index.handler' },
    { name: 'memory_size', type: 'number', placeholder: '128' },
    { name: 'timeout', type: 'number', placeholder: '3' },
  ],
  aws_s3_bucket: [
    { name: 'bucket', type: 'string', placeholder: 'my-bucket-name' },
    { name: 'force_destroy', type: 'bool' },
  ],
  aws_ecr_repository: [
    { name: 'name', type: 'string', required: true, placeholder: 'my-app' },
    { name: 'image_tag_mutability', type: 'string', enum: ['MUTABLE', 'IMMUTABLE'] },
  ],
  aws_db_instance: [
    { name: 'engine', type: 'string', required: true, enum: ['postgres', 'mysql', 'mariadb', 'oracle-se2', 'sqlserver-ex'] },
    { name: 'engine_version', type: 'string', placeholder: '16' },
    { name: 'instance_class', type: 'string', required: true, placeholder: 'db.t3.micro' },
    { name: 'allocated_storage', type: 'number', required: true, placeholder: '20' },
    { name: 'db_name', type: 'string' },
    { name: 'username', type: 'string' },
  ],
  aws_dynamodb_table: [
    { name: 'name', type: 'string', required: true, placeholder: 'items' },
    { name: 'billing_mode', type: 'string', enum: ['PROVISIONED', 'PAY_PER_REQUEST'] },
    { name: 'hash_key', type: 'string', required: true, placeholder: 'id' },
  ],
  aws_db_subnet_group: [{ name: 'name', type: 'string', placeholder: 'db-subnets' }],
  aws_security_group: [
    { name: 'name', type: 'string', placeholder: 'web-sg' },
    { name: 'description', type: 'string' },
  ],
  aws_iam_role: [{ name: 'name', type: 'string', placeholder: 'app-role' }],
  aws_iam_instance_profile: [{ name: 'name', type: 'string', placeholder: 'app-profile' }],
  aws_lb_target_group: [
    { name: 'name', type: 'string', placeholder: 'web-tg' },
    { name: 'port', type: 'number', required: true, placeholder: '80' },
    { name: 'protocol', type: 'string', required: true, enum: ['HTTP', 'HTTPS', 'TCP', 'TLS', 'UDP'] },
    { name: 'target_type', type: 'string', enum: ['instance', 'ip', 'lambda', 'alb'] },
  ],
  aws_lb_listener: [
    { name: 'port', type: 'number', required: true, placeholder: '443' },
    { name: 'protocol', type: 'string', required: true, enum: ['HTTP', 'HTTPS', 'TCP', 'TLS'] },
  ],
  aws_eip: [{ name: 'domain', type: 'string', enum: ['vpc', 'standard'] }],
  aws_kms_key: [
    { name: 'description', type: 'string' },
    { name: 'deletion_window_in_days', type: 'number', placeholder: '30' },
    { name: 'enable_key_rotation', type: 'bool' },
  ],
  aws_security_group_rule: [
    { name: 'type', type: 'string', required: true, enum: ['ingress', 'egress'] },
    { name: 'from_port', type: 'number', required: true, placeholder: '443' },
    { name: 'to_port', type: 'number', required: true, placeholder: '443' },
    { name: 'protocol', type: 'string', required: true, enum: ['tcp', 'udp', 'icmp', '-1'] },
    { name: 'description', type: 'string' },
  ],
  aws_iam_policy: [
    { name: 'name', type: 'string', placeholder: 'app-policy' },
    { name: 'description', type: 'string' },
  ],
  aws_key_pair: [
    { name: 'key_name', type: 'string', required: true, placeholder: 'deployer' },
    { name: 'public_key', type: 'string', placeholder: 'ssh-ed25519 AAAA…' },
  ],
  aws_route53_record: [
    { name: 'name', type: 'string', required: true, placeholder: 'www.example.com' },
    { name: 'type', type: 'string', required: true, enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] },
    { name: 'ttl', type: 'number', placeholder: '300' },
  ],
  aws_cloudfront_distribution: [
    { name: 'enabled', type: 'bool', required: true },
    { name: 'comment', type: 'string' },
    { name: 'price_class', type: 'string', enum: ['PriceClass_All', 'PriceClass_200', 'PriceClass_100'] },
    { name: 'default_root_object', type: 'string', placeholder: 'index.html' },
  ],
  aws_ecs_cluster: [{ name: 'name', type: 'string', required: true, placeholder: 'app-cluster' }],
  aws_ecs_service: [
    { name: 'name', type: 'string', required: true, placeholder: 'web' },
    { name: 'desired_count', type: 'number', placeholder: '2' },
    { name: 'launch_type', type: 'string', enum: ['EC2', 'FARGATE', 'EXTERNAL'] },
  ],
  aws_ecs_task_definition: [
    { name: 'family', type: 'string', required: true, placeholder: 'web' },
    { name: 'cpu', type: 'string', placeholder: '256' },
    { name: 'memory', type: 'string', placeholder: '512' },
    { name: 'network_mode', type: 'string', enum: ['bridge', 'host', 'awsvpc', 'none'] },
  ],
  aws_api_gateway_rest_api: [
    { name: 'name', type: 'string', required: true, placeholder: 'my-api' },
    { name: 'description', type: 'string' },
  ],
  aws_apigatewayv2_api: [
    { name: 'name', type: 'string', required: true, placeholder: 'my-http-api' },
    { name: 'protocol_type', type: 'string', required: true, enum: ['HTTP', 'WEBSOCKET'] },
  ],
  aws_cloudwatch_log_group: [
    { name: 'name', type: 'string', required: true, placeholder: '/aws/lambda/my-fn' },
    { name: 'retention_in_days', type: 'number', placeholder: '14' },
  ],
  aws_cloudwatch_metric_alarm: [
    { name: 'alarm_name', type: 'string', required: true, placeholder: 'high-cpu' },
    { name: 'comparison_operator', type: 'string', required: true, enum: ['GreaterThanOrEqualToThreshold', 'GreaterThanThreshold', 'LessThanThreshold', 'LessThanOrEqualToThreshold'] },
    { name: 'evaluation_periods', type: 'number', required: true, placeholder: '2' },
    { name: 'metric_name', type: 'string', placeholder: 'CPUUtilization' },
    { name: 'namespace', type: 'string', placeholder: 'AWS/EC2' },
    { name: 'threshold', type: 'number', placeholder: '80' },
  ],
  aws_cloudwatch_event_rule: [
    { name: 'name', type: 'string', placeholder: 'daily' },
    { name: 'description', type: 'string' },
    { name: 'schedule_expression', type: 'string', placeholder: 'rate(5 minutes)' },
    { name: 'state', type: 'string', enum: ['ENABLED', 'DISABLED'] },
  ],
  aws_sns_topic: [
    { name: 'name', type: 'string', placeholder: 'events' },
    { name: 'display_name', type: 'string' },
    { name: 'fifo_topic', type: 'bool' },
  ],
  aws_sqs_queue: [
    { name: 'name', type: 'string', placeholder: 'jobs' },
    { name: 'fifo_queue', type: 'bool' },
    { name: 'visibility_timeout_seconds', type: 'number', placeholder: '30' },
    { name: 'message_retention_seconds', type: 'number', placeholder: '345600' },
  ],
  aws_sns_topic_subscription: [
    { name: 'protocol', type: 'string', required: true, enum: ['sqs', 'lambda', 'email', 'https', 'http', 'sms', 'application'] },
    { name: 'raw_message_delivery', type: 'bool' },
  ],
  aws_efs_file_system: [
    { name: 'creation_token', type: 'string' },
    { name: 'encrypted', type: 'bool' },
    { name: 'performance_mode', type: 'string', enum: ['generalPurpose', 'maxIO'] },
    { name: 'throughput_mode', type: 'string', enum: ['bursting', 'provisioned', 'elastic'] },
  ],
  aws_efs_mount_target: [{ name: 'ip_address', type: 'string' }],
};

/** The resource types that have a curated schema. Exported for the consistency
 * tests (every one must be a real catalog type, none may suggest a
 * gesture-owned argument). */
export const SCHEMA_TYPES = Object.keys(schemas);

/** attrSchema returns the curated argument specs for a type (empty if none),
 * required-first then alphabetical — the order the Inspector suggests them in. */
export function attrSchema(type: string): AttrSpec[] {
  const specs = schemas[type] ?? [];
  return [...specs].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)) || a.name.localeCompare(b.name));
}

/** attrSpec returns the spec for one argument of a type, or undefined if the
 * argument is not in the curated set (a custom / free-form attribute). */
export function attrSpec(type: string, name: string): AttrSpec | undefined {
  return schemas[type]?.find((s) => s.name === name);
}

/** defaultAttrValue is the value a suggested argument is seeded with when added:
 * the first enum option, an empty string, 0, or false — always valid for its
 * type so it never lands the model in a state the generator would reject. */
export function defaultAttrValue(spec: AttrSpec): ApiAttrValue {
  if (spec.type === 'bool') return { kind: 'literal', litType: 'bool', value: 'false' };
  if (spec.type === 'number') return { kind: 'literal', litType: 'number', value: '0' };
  return { kind: 'literal', litType: 'string', value: spec.enum?.[0] ?? '' };
}
