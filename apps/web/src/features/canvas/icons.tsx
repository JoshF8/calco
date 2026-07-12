// A curated Lucide glyph per resource type. Monochrome and currentColor, so the
// icon inherits the node's text colour and follows the light/dark theme. Any
// type not in the map falls back to a neutral box.
import type { ComponentType } from 'react';
import {
  Anchor,
  Archive,
  BadgeCheck,
  Bell,
  Box,
  Boxes,
  ClipboardList,
  Cloud,
  Container,
  Database,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  Inbox,
  Key,
  KeyRound,
  KeySquare,
  Layers,
  Link2,
  ListChecks,
  MapPin,
  Megaphone,
  Network,
  Radio,
  Route,
  Router,
  Rss,
  ScrollText,
  Server,
  ShieldCheck,
  Ship,
  Signpost,
  Split,
  Table2,
  Target,
  Waypoints,
  Webhook,
  Zap,
} from 'lucide-react';

type LucideIcon = ComponentType<{ className?: string }>;

const iconByType: Record<string, LucideIcon> = {
  aws_vpc: Network,
  aws_subnet: Waypoints,
  aws_internet_gateway: Globe,
  aws_lb: Split,
  aws_cloudfront_distribution: Cloud,
  aws_lb_target_group: Target,
  aws_nat_gateway: Router,
  aws_route53_record: Signpost,
  aws_eip: MapPin,
  aws_instance: Server,
  aws_key_pair: Key,
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
  aws_iam_role_policy_attachment: Link2,
  aws_kms_key: KeySquare,
  // ECS
  aws_ecs_cluster: Ship,
  aws_ecs_service: Layers,
  aws_ecs_task_definition: ClipboardList,
  // API Gateway
  aws_api_gateway_rest_api: Webhook,
  aws_apigatewayv2_api: Route,
  // EFS
  aws_efs_file_system: HardDrive,
  aws_efs_mount_target: Anchor,
  // Messaging
  aws_sns_topic: Megaphone,
  aws_sqs_queue: Inbox,
  aws_sns_topic_subscription: Rss,
  // Observability
  aws_cloudwatch_log_group: FileText,
  aws_cloudwatch_metric_alarm: Gauge,
  aws_cloudwatch_event_rule: Bell,
};

/** Renders the icon for a resource type. */
export function ResourceIcon({ type, className }: { type: string; className?: string }) {
  const Icon = iconByType[type] ?? Box;
  return <Icon className={className} />;
}
