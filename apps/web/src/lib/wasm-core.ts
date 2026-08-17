// In-browser engine (WASM): import + generate run entirely on the client, so
// the whole app works from a static origin (GitHub Pages) with no backend.
//
// The Go core (apps/server/cmd/wasm) is built to a static .wasm by
// `task wasm:build` and served from the same origin. Its wire JSON is
// byte-compatible with the REST endpoints, so the shapes here match
// types.gen.ts — the same components the API client used.
//
// The engine boots lazily on first use (~150 ms for a ~2 MB gzipped module);
// `ensureEngine()` is idempotent, so both Import and Export can await it.

import type { components } from '@/lib/types.gen';

type ModelDTO = components['schemas']['Model'];
type DiagnosticDTO = components['schemas']['Diagnostic'];
type AttrValueDTO = components['schemas']['AttrValue'];

/** Minimal shape of the Go WASM glue (either instance-wrapped by
 *  `asyncify` or the stock `wasm_exec.js`). */
interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

// The globals mounted by the compiled module and the glue script.
declare global {
  interface Window {
    Go: new () => GoRuntime;
    calcoImport: (filesJSON: string) => string;
    calcoGenerate: (modelJSON: string) => string;
  }
}

let loading: Promise<void> | null = null;

/** Error surfaced when the wasm assets are missing (e.g. dev without running
 *  `task wasm:build`), with a hint instead of a bare fetch 404. */
function assetError(what: string, status?: number): Error {
  const code = status !== undefined ? ` (HTTP ${status})` : '';
  return new Error(`${what} could not be loaded${code}. Run \`task wasm:build\` to build the in-browser engine.`);
}

function loadGlue(base: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const src = `${base}wasm_exec.js`;
    if (document.querySelector(`script[data-calco-glue][src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.dataset.calcoGlue = 'true';
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(assetError('wasm_exec.js'));
    document.head.appendChild(s);
  });
}

async function boot(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  await loadGlue(base);

  const go = new window.Go();
  const res = await fetch(`${base}calco.wasm`);
  if (!res.ok) throw assetError('calco.wasm', res.status);
  const mod = await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject);
  go.run(mod.instance);

  // The module mounts calcoImport/calcoGenerate synchronously during init (it
  // blocks forever in main). Poll briefly until the globals land.
  const deadline = Date.now() + 15_000;
  while (typeof window.calcoImport !== 'function') {
    if (Date.now() > deadline) throw new Error('in-browser engine did not start');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Ready the engine once; safe to call from anywhere, any number of times. A
 *  failed boot resets so a later retry (after `task wasm:build`) gets a fresh
 *  chance instead of erroring forever. */
export function ensureEngine(): Promise<void> {
  if (!loading) {
    loading = boot().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

function call<T>(fn: 'calcoImport' | 'calcoGenerate', payload: unknown): T {
  const raw = window[fn](JSON.stringify(payload));
  const out = JSON.parse(raw) as T & { error?: string };
  if (out.error) throw new Error(out.error);
  return out;
}

/** Import Terraform sources (relative path → text) into the wire model,
 *  identical to POST /api/v1/import. */
export function importRepo(files: Record<string, string>): {
  model: ModelDTO;
  diagnostics: DiagnosticDTO[];
} {
  return call('calcoImport', files);
}

// Re-export the wire model types so panels can type their state without
// reaching into types.gen.ts.
export type { ModelDTO, DiagnosticDTO, AttrValueDTO };

/** Render a wire model to generated Terraform files, identical to
 *  POST /api/v1/generate. */
export function generateHCL(model: ModelDTO): Record<string, string> {
  return call<{ files: Record<string, string> }>('calcoGenerate', model).files;
}