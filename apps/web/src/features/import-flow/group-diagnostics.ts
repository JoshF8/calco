import type { components } from '@/lib/types.gen';

type Diagnostic = components['schemas']['Diagnostic'];

export interface DiagnosticEntry {
  address?: string;
  attribute?: string;
}

export interface DiagnosticFileGroup {
  /** Source file; '' when the server attached none. */
  file: string;
  count: number;
  entries: DiagnosticEntry[];
  /** True when any entry carries a label worth listing. */
  hasLabels: boolean;
}

export interface DiagnosticReasonGroup {
  reason: string;
  count: number;
  files: DiagnosticFileGroup[];
}

/**
 * Buckets an import's diagnostics for the "big project" view: collapsed by
 * reason first (the same cause, e.g. `"variable" block not imported yet`,
 * repeats hundreds of times in a real repo), then by source file within each
 * cause so the user can see which module/file produces the noise. Deterministic:
 * every level is sorted by count desc, ties broken lexically.
 */
export function groupDiagnostics(diags: Diagnostic[]): DiagnosticReasonGroup[] {
  const byReason = new Map<string, Map<string, DiagnosticEntry[]>>();
  for (const d of diags) {
    let byFile = byReason.get(d.reason);
    if (!byFile) {
      byFile = new Map();
      byReason.set(d.reason, byFile);
    }
    const key = d.file ?? '';
    const entries = byFile.get(key) ?? [];
    entries.push({ address: d.address, attribute: d.attribute });
    byFile.set(key, entries);
  }

  const groups: DiagnosticReasonGroup[] = [];
  for (const [reason, byFile] of byReason) {
    const files: DiagnosticFileGroup[] = [];
    let count = 0;
    for (const [file, entries] of byFile) {
      count += entries.length;
      files.push({
        file,
        count: entries.length,
        entries,
        hasLabels: entries.some((e) => e.address || e.attribute),
      });
    }
    files.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
    groups.push({ reason, count, files });
  }
  groups.sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return groups;
}