// The catalog of AWS resource types the canvas can place. Intentionally a
// small, curated set for the greenfield MVP — breadth comes later.
//
// Display labels are NOT stored here: they are i18n keys resolved at render
// time (palette.resource.<type> and palette.group.<group>), so switching
// language updates the palette and the node badges live.
export type GroupKey = 'network' | 'compute' | 'storage' | 'database' | 'security';

export interface CatalogEntry {
  /** Terraform resource type, e.g. "aws_vpc". Also the i18n label key suffix. */
  type: string;
  /** Group key; the i18n group-header key suffix. */
  group: GroupKey;
}

export const catalog: CatalogEntry[] = [
  { type: 'aws_vpc', group: 'network' },
  { type: 'aws_subnet', group: 'network' },
  { type: 'aws_internet_gateway', group: 'network' },
  { type: 'aws_lb_listener', group: 'network' },
  { type: 'aws_lb', group: 'network' },
  { type: 'aws_lb_target_group', group: 'network' },
  { type: 'aws_nat_gateway', group: 'network' },
  { type: 'aws_eip', group: 'network' },
  { type: 'aws_instance', group: 'compute' },
  { type: 'aws_key_pair', group: 'compute' },
  { type: 'aws_lambda_function', group: 'compute' },
  { type: 'aws_s3_bucket', group: 'storage' },
  { type: 'aws_ecr_repository', group: 'storage' },
  { type: 'aws_db_instance', group: 'database' },
  { type: 'aws_dynamodb_table', group: 'database' },
  { type: 'aws_db_subnet_group', group: 'database' },
  { type: 'aws_security_group', group: 'security' },
  { type: 'aws_security_group_rule', group: 'security' },
  { type: 'aws_iam_role', group: 'security' },
  { type: 'aws_iam_policy', group: 'security' },
  { type: 'aws_iam_instance_profile', group: 'security' },
  { type: 'aws_iam_role_policy_attachment', group: 'security' },
  { type: 'aws_kms_key', group: 'security' },
];

/** The order groups are shown in the palette. */
export const groupOrder: GroupKey[] = ['network', 'compute', 'storage', 'database', 'security'];

/** shortType strips the provider prefix: "aws_vpc" -> "vpc". Used to derive
 * default resource names. */
export function shortType(type: string): string {
  const i = type.indexOf('_');
  return i >= 0 ? type.slice(i + 1) : type;
}

// Provider prefixes dropped from a fallback label — the rest reads as the
// resource. Non-provider first segments (null_resource, random_string) are kept.
const PROVIDER_PREFIXES = new Set(['aws', 'google', 'azurerm', 'azuread', 'kubernetes']);

/** humanType is a readable fallback label for a resource type that has no
 * curated i18n entry — imported types outside the catalog. It drops a known
 * provider prefix and title-cases the rest: "aws_security_group_rule" ->
 * "Security Group Rule", "null_resource" -> "Null Resource". */
export function humanType(type: string): string {
  const parts = type.split('_').filter(Boolean);
  const words = parts.length > 1 && PROVIDER_PREFIXES.has(parts[0]) ? parts.slice(1) : parts;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || type;
}
