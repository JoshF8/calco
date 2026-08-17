//go:build js && wasm

// Command wasm exposes the calco import + generate core to the browser as a
// WebAssembly module, so the whole app can run from a static origin (GitHub
// Pages) with zero infrastructure.
//
// The wire JSON is byte-compatible with the REST endpoints:
//
//   - calcoImport(filesJSON)  ↔ POST /api/v1/import
//   - calcoGenerate(modelJSON) ↔ POST /api/v1/generate
//
// The HCL engine is pure Go and needs no I/O: files arrive as a map of
// relative path → source text, exactly the shape the browser folder picker
// produces. Build with `task wasm:build` (sets GOOS=js GOARCH=wasm); the
// server binary, the REST API and the hosted product are unaffected.
package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/JoshF8/calco/apps/server/internal/adapters/inbound/http/apimodel"
	appgenerate "github.com/JoshF8/calco/apps/server/internal/application/generate"
	appimporttf "github.com/JoshF8/calco/apps/server/internal/application/importtf"
)

// wireDiagnostic mirrors the HTTP adapter's wire Diagnostic exactly so the
// client receives byte-identical shapes from WASM and REST.
type wireDiagnostic struct {
	File      string `json:"file,omitempty"`
	Address   string `json:"address,omitempty"`
	Attribute string `json:"attribute,omitempty"`
	Reason    string `json:"reason"`
}

// importResult mirrors the /api/v1/import response body.
type importResult struct {
	Model       apimodel.Model   `json:"model"`
	Diagnostics []wireDiagnostic `json:"diagnostics"`
}

// generateResult mirrors the /api/v1/generate response body.
type generateResult struct {
	Files map[string]string `json:"files"`
}

// withError marshals an error object the client recognizes ({error: msg}).
func withError(msg string) string {
	out, _ := json.Marshal(map[string]string{"error": msg})
	return string(out)
}

func importFiles(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(withError("calcoImport(filesJSON) requires 1 argument"))
	}
	files := map[string]string{}
	if err := json.Unmarshal([]byte(args[0].String()), &files); err != nil {
		return js.ValueOf(withError("filesJSON: " + err.Error()))
	}
	model, diags, err := appimporttf.NewImportTerraform().Execute(files)
	if err != nil {
		return js.ValueOf(withError(err.Error()))
	}
	wire := make([]wireDiagnostic, 0, len(diags))
	for _, d := range diags {
		wire = append(wire, wireDiagnostic{File: d.File, Address: d.Address, Attribute: d.Attribute, Reason: d.Reason})
	}
	out, err := json.Marshal(importResult{Model: apimodel.FromDomain(model), Diagnostics: wire})
	if err != nil {
		return js.ValueOf(withError("marshal import result: " + err.Error()))
	}
	return js.ValueOf(string(out))
}

func generateHCL(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.ValueOf(withError("calcoGenerate(modelJSON) requires 1 argument"))
	}
	var wire apimodel.Model
	if err := json.Unmarshal([]byte(args[0].String()), &wire); err != nil {
		return js.ValueOf(withError("modelJSON: " + err.Error()))
	}
	files, err := appgenerate.NewGenerateHCL().Execute(wire.ToDomain())
	if err != nil {
		return js.ValueOf(withError(err.Error()))
	}
	out, err := json.Marshal(generateResult{Files: files})
	if err != nil {
		return js.ValueOf(withError("marshal generate result: " + err.Error()))
	}
	return js.ValueOf(string(out))
}

func main() {
	js.Global().Set("calcoImport", js.FuncOf(importFiles))
	js.Global().Set("calcoGenerate", js.FuncOf(generateHCL))
	select {} // block forever: the module lives as long as the page
}
