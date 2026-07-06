// Containment rules: the visual nesting layer projected onto the flat
// resources + references domain model. Dropping a resource into its valid
// container sets the reference attribute that encodes the relationship in
// Terraform (e.g. a subnet inside a VPC gets vpc_id = aws_vpc.<name>.id).
//
// Not everything nests: S3, IAM roles, and Lambda are free (global) nodes.
// RDS and load balancers really span multiple subnets; nesting them in a
// single subnet is an MVP simplification.

/** Default on-canvas size for a container node, by type. Generous by default so
 * a freshly-added VPC/subnet has room to drop resources into before resizing. */
export const containerSize: Record<string, { width: number; height: number }> = {
  aws_vpc: { width: 1050, height: 750 },
  aws_subnet: { width: 480, height: 360 },
};

/** isContainer reports whether a type renders as a box that can hold children. */
export function isContainer(type: string): boolean {
  return type in containerSize;
}

export interface NestRule {
  /** The container type this resource nests into. */
  parentType: string;
  /** The attribute that holds the reference when nested, or undefined when the
   * nesting is visual grouping only (no real Terraform argument exists). */
  attribute?: string;
}

// What each nestable type nests into, and via which reference attribute.
//
// RDS and load balancers really span *multiple* subnets — their subnet
// membership is expressed by an aws_db_subnet_group / an aws_lb.subnets list,
// not a single subnet_id. Emitting subnet_id on them would be an invented
// argument terraform validate rejects, so they nest for visual grouping only
// (attribute omitted) until those constructs are modelled. Better no argument
// than a wrong one.
const nesting: Record<string, NestRule> = {
  aws_subnet: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_security_group: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_internet_gateway: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_lb_target_group: { parentType: 'aws_vpc', attribute: 'vpc_id' },
  aws_instance: { parentType: 'aws_subnet', attribute: 'subnet_id' },
  aws_db_instance: { parentType: 'aws_subnet' },
  aws_lb: { parentType: 'aws_subnet' },
  aws_nat_gateway: { parentType: 'aws_subnet', attribute: 'subnet_id' },
};

/** nestRule returns how a type nests, or undefined if it is a free resource. */
export function nestRule(type: string): NestRule | undefined {
  return nesting[type];
}

/** canNest reports whether childType may be placed inside parentType. */
export function canNest(childType: string, parentType: string): boolean {
  return nesting[childType]?.parentType === parentType;
}
