// A curated Lucide glyph per resource type. Monochrome and currentColor, so the
// icon inherits the node's text colour and follows the light/dark theme. Any
// type not in the map falls back to a neutral box.
import type { ComponentType } from 'react';
import {
  Archive,
  BadgeCheck,
  Box,
  Boxes,
  Container,
  Database,
  Globe,
  KeyRound,
  KeySquare,
  ListChecks,
  MapPin,
  Network,
  Radio,
  Router,
  Server,
  ScrollText,
  ShieldCheck,
  Split,
  Table2,
  Target,
  Waypoints,
  Zap,
} from 'lucide-react';

type LucideIcon = ComponentType<{ className?: string }>;

const iconByType: Record<string, LucideIcon> = {
  aws_vpc: Network,
  aws_subnet: Waypoints,
  aws_internet_gateway: Globe,
  aws_lb: Split,
  aws_lb_target_group: Target,
  aws_nat_gateway: Router,
  aws_eip: MapPin,
  aws_instance: Server,
  aws_lambda_function: Zap,
  aws_lb_listener: Radio,
  aws_s3_bucket: Archive,
  aws_ecr_repository: Container,
  aws_db_instance: Database,
  aws_db_subnet_group: Boxes,
  aws_dynamodb_table: Table2,
  aws_security_group: ShieldCheck,
  aws_security_group_rule: ListChecks,
  aws_iam_role: KeyRound,
  aws_iam_policy: ScrollText,
  aws_iam_instance_profile: BadgeCheck,
  aws_kms_key: KeySquare,
};

/** Renders the icon for a resource type. */
export function ResourceIcon({ type, className }: { type: string; className?: string }) {
  const Icon = iconByType[type] ?? Box;
  return <Icon className={className} />;
}
