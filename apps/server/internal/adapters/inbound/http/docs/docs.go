// Package docs serves the API reference UI.
//
// Huma v2 ships with Stoplight Elements as its default docs UI. We swap
// that for Scalar — a more modern, designed-from-scratch alternative
// with better dark-mode support and a cleaner sidebar.
//
// The Stoplight default is disabled by setting huma.Config.DocsPath = ""
// before constructing the API; Handler returns the replacement.
package docs

import (
	"fmt"
	"net/http"
)

// Scalar version pinned for reproducibility and supply-chain hygiene
// (see docs/ARCHITECTURE.md §Security). Bump intentionally, not
// implicitly.
const scalarVersion = "1.57.5"

const scalarTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>%s</title>
  <style>
    body { margin: 0; }
  </style>
</head>
<body>
  <script id="api-reference" data-url="%s"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@%s"></script>
</body>
</html>`

// Handler returns an http.HandlerFunc that serves a Scalar-based API
// reference. The title is shown in the <title> tag; the specURL points
// to the OpenAPI document Scalar should render (typically /openapi.json
// or /openapi.yaml).
func Handler(title, specURL string) http.HandlerFunc {
	body := []byte(fmt.Sprintf(scalarTemplate, title, specURL, scalarVersion))
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}
