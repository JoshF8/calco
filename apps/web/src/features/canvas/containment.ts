// Containment rules: the visual nesting layer projected onto the flat
// resources + references domain model. Dropping a resource into its valid
// container sets the reference attribute that encodes the relationship in
// Terraform (e.g. a subnet inside a VPC gets vpc_id = aws_vpc.<name>.id).
//
// Not everything nests: S3, IAM roles, and Lambda are free (global) nodes.
// RDS and load balancers really span multiple subnets; nesting them in a
// single subnet is an MVP simplification.

/** Default on-canvas size for a container node, by type. */
export const containerSize: Record<string, { width: number; height: number }> = {
  aws_vpc: { width: 400, height: 300 },
  aws_subnet: { width: 240, height: 170 },
};

/** isContainer reports whether a type renders as a box that can hold children. */
export function isContainer(type: string): boolean {
  return type in containerSize;
}

export interface NestRule {
  /** The container type this resource nests into. */
  parentType: string;
  /** The attribute that holds the reference when nested. */
  attribute: string;
}

// What each nestable type nests into, and via which reference attribute.
const nesting: Record<string, NestRule> = {
  aws_subnet: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_security_group: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_instance: { parentType: 'aws_subnet', attribute: 'subnet_id' },
  aws_db_instance: { parentType: 'aws_subnet', attribute: 'subnet_id' },
  aws_lb: { parentType: 'aws_subnet', attribute: 'subnet_id' },
};

/** nestRule returns how a type nests, or undefined if it is a free resource. */
export function nestRule(type: string): NestRule | undefined {
  return nesting[type];
}

/** canNest reports whether childType may be placed inside parentType. */
export function canNest(childType: string, parentType: string): boolean {
  return nesting[childType]?.parentType === parentType;
}
