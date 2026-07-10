package main

import (
	"encoding/base64"
	"os"
)

// SaveFile opens a native "Save As" dialog defaulting to filename, then
// writes base64Data to the chosen path. This exists because the webview's
// usual `<a download>`/blob-URL trick has no browser chrome to catch the
// download in Wails' Linux webkit backend, so it silently does nothing.
// Returns an error message on failure, or "" on success/cancel.
func (a *App) SaveFile(filename string, base64Data string) string {
	path, err := a.app.Dialog.SaveFile().SetFilename(filename).PromptForSingleSelection()
	if err != nil {
		return err.Error()
	}
	if path == "" {
		return ""
	}

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err.Error()
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err.Error()
	}
	return ""
}
