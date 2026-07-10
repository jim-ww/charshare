package main

import (
	"embed"
	"flag"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	noGpu := flag.Bool("no-gpu", false, "disable webview hardware acceleration (Linux)")
	flag.Parse()

	gpuPolicy := application.WebviewGpuPolicyAlways
	if *noGpu {
		gpuPolicy = application.WebviewGpuPolicyNever
	}

	app := NewApp()

	wailsApp := application.New(application.Options{
		Name: "charshare",
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		OnShutdown: func() {
			app.proxyImport.Stop()
		},
	})

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "charshare",
		Width:            1024,
		Height:           768,
		StartState:       application.WindowStateMaximised,
		BackgroundColour: application.RGBA{Red: 27, Green: 38, Blue: 54, Alpha: 1},
		// Mic access is already gated behind charshare's own in-app consent
		// dialog (ChatComposer.svelte), so allow it here rather than
		// leaving it at PermissionDefault — there's no need for a second,
		// OS-level prompt on top of that, and on Linux PermissionDefault
		// would otherwise silently deny getUserMedia (see PR #5567).
		Permissions: map[application.PermissionType]application.Permission{
			application.PermissionMicrophone: application.PermissionAllow,
		},
		Linux: application.LinuxWindow{
			WebviewGpuPolicy: gpuPolicy,
		},
		DevToolsEnabled: os.Getenv("DEBUG") != "",
	})

	err := wailsApp.Run()
	if err != nil {
		println("Error:", err.Error())
	}
}
