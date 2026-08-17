// Folder-aware file collection for the import dialog.
//
// A "project" import means grabbing every .tf under a chosen/dropped folder.
// The browser exposes folder picks (webkitdirectory input, drag-and-drop) as a
// flat FileList whose File objects carry a relative path in `webkitRelativePath`.
// Collating on that path — falling back to the bare file name for a plain
// multi-file pick — keeps main.tf files in two different modules/ dirs distinct
// instead of silently overwriting each other client-side.

export interface TfFileInput extends Pick<File, 'name' | 'text'> {
  webkitRelativePath?: string;
}

/** The map key a .tf file should be stored under: its path relative to the
 * picked folder when one exists, otherwise its bare name. */
export function tfKey(f: TfFileInput): string {
  return (f.webkitRelativePath?.trim() || '').length > 0 ? f.webkitRelativePath! : f.name;
}

/** Collects every .tf file into a files map, skipping what was already present
 * (the first match wins, mirroring the server's duplicate handling). Rejects
 * nothing; callers read the map when done. */
export async function collectTfFiles(picked: Iterable<TfFileInput>, existing: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  const next: Record<string, string> = {};
  for (const f of picked) {
    if (!f.name.toLowerCase().endsWith('.tf')) continue;
    const key = tfKey(f);
    if (key in next || key in existing) continue;
    next[key] = await f.text();
  }
  return next;
}