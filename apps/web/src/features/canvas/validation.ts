// Client-side mirrors of the server's validation rules (graph/validate.go,
// graph/value.go), so the inspector can reject invalid input before it reaches
// the generate endpoint. The server remains the source of truth; these are a
// UX nicety that avoids round-tripping to a 422.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/;

/** isValidName reports whether s is a valid Terraform identifier. */
export function isValidName(s: string): boolean {
  return NAME_RE.test(s);
}

/** isValidNumber reports whether s is a finite decimal literal (no leading
 * zeros, no Inf/NaN), matching the server's number rule. */
export function isValidNumber(s: string): boolean {
  return NUMBER_RE.test(s) && Number.isFinite(Number(s));
}
