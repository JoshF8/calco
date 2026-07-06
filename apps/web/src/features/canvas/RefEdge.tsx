import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useCanvasStore } from './store';

// The reference edge: a Terraform dependency drawn honestly. The arrowhead
// points from the dependent (source) to the dependency (target) — matching the
// domain model's edge direction — so the diagram shows who depends on whom. A
// paper label chip carries the real HCL argument in mono; when a list argument
// bundles several targets (e.g. two SGs on one instance), it shows the count,
// the one thing the old scalar model could never express. The line is ink at
// rest (themed via --xy-edge-stroke) and oxblood only when selected — a single
// transient registration, never a whole oxblood web.
export function RefEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const attribute = typeof data?.attribute === 'string' ? data.attribute : '';
  const isList = data?.cardinality === 'list';
  // Count sibling edges sharing this dependent + argument to show list fan-out.
  const count = useCanvasStore((s) =>
    isList ? s.edges.filter((e) => e.source === source && e.data?.attribute === attribute).length : 1,
  );
  const label = isList && count > 1 ? `${attribute} · ${count}` : attribute;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {attribute && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="pointer-events-none absolute rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
