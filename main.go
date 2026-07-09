package main

import (
	"embed"
	"flag"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	noGpu := flag.Bool("no-gpu", false, "disable webview hardware acceleration (Linux)")
	flag.Parse()

	gpuPolicy := linux.WebviewGpuPolicyAlways
	if *noGpu {
		gpuPolicy = linux.WebviewGpuPolicyNever
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "charshare",
		Width:            1024,
		Height:           768,
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		Linux: &linux.Options{
			WebviewGpuPolicy: gpuPolicy,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Debug: options.Debug{
			OpenInspectorOnStartup: os.Getenv("DEBUG") != "",
		},
		Bind: []any{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
