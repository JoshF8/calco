// The catalog of AWS resource types the canvas can place. Intentionally a
// small, curated set for the greenfield MVP — breadth comes later. Each entry
// is what the palette shows and what a placed node is created from.
export interface CatalogEntry {
  /** Terraform resource type, e.g. "aws_vpc". */
  type: string;
  /** Human label shown in the palette and on the node. */
  label: string;
  /** One-word group for palette organization. */
  group: 'Network' | 'Compute' | 'Storage' | 'Database' | 'Security';
}

export const catalog: CatalogEntry[] = [
  { type: 'aws_vpc', label: 'VPC', group: 'Network' },
  { type: 'aws_subnet', label: 'Subnet', group: 'Network' },
  { type: 'aws_lb', label: 'Load Balancer', group: 'Network' },
  { type: 'aws_instance', label: 'EC2 Instance', group: 'Compute' },
  { type: 'aws_lambda_function', label: 'Lambda Function', group: 'Compute' },
  { type: 'aws_s3_bucket', label: 'S3 Bucket', group: 'Storage' },
  { type: 'aws_db_instance', label: 'RDS Database', group: 'Database' },
  { type: 'aws_security_group', label: 'Security Group', group: 'Security' },
  { type: 'aws_iam_role', label: 'IAM Role', group: 'Security' },
];

const byType = new Map(catalog.map((e) => [e.type, e]));

/** labelFor returns the catalog label for a type, falling back to the type. */
export function labelFor(type: string): string {
  return byType.get(type)?.label ?? type;
}

/** shortType strips the provider prefix: "aws_vpc" -> "vpc". Used to derive
 * default resource names. */
export function shortType(type: string): string {
  const i = type.indexOf('_');
  return i >= 0 ? type.slice(i + 1) : type;
}
