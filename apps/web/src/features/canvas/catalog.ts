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
  { type: 'aws_lb', group: 'network' },
  { type: 'aws_nat_gateway', group: 'network' },
  { type: 'aws_eip', group: 'network' },
  { type: 'aws_instance', group: 'compute' },
  { type: 'aws_lambda_function', group: 'compute' },
  { type: 'aws_s3_bucket', group: 'storage' },
  { type: 'aws_ecr_repository', group: 'storage' },
  { type: 'aws_db_instance', group: 'database' },
  { type: 'aws_dynamodb_table', group: 'database' },
  { type: 'aws_security_group', group: 'security' },
  { type: 'aws_iam_role', group: 'security' },
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
