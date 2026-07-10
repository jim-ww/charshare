package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App struct
type App struct {
	app         *application.App
	proxyImport proxyImportServer
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// consoleForwardPayload mirrors the {level, message} object emitted by
// wailsConsoleForward.ts.
type consoleForwardPayload struct {
	Level   string `json:"level"`
	Message string `json:"message"`
}

// ServiceStartup is called when the app starts. The application handle is
// saved so other methods can call runtime managers (Dialog, Event, ...), and
// the frontend's console-forwarding event (wailsConsoleForward.ts — v3
// dropped v2's dedicated LogInfo/LogError runtime calls) is wired up so
// `wails dev` output still surfaces frontend console/error messages.
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.app = application.Get()
	a.app.Event.On("console:forward", func(event *application.CustomEvent) {
		data, err := json.Marshal(event.Data)
		if err != nil {
			return
		}
		var payload consoleForwardPayload
		if err := json.Unmarshal(data, &payload); err != nil {
			return
		}
		if payload.Level == "error" {
			log.Printf("[frontend error] %s", payload.Message)
		} else {
			log.Printf("[frontend] %s", payload.Message)
		}
	})
	return nil
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// OpenDevTools opens the webview's devtools window. Only meaningful in the
// Wails desktop build; the frontend gates this behind isWailsDesktop().
func (a *App) OpenDevTools() {
	a.app.Window.Current().OpenDevTools()
}
