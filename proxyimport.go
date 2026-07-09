package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ProxyImportPort is where a chat site's custom AI/API proxy setting should
// point (http://localhost:<port>/v1/chat/completions). That request is
// issued straight from the user's browser, so a plain loopback listener is
// reachable without any tunnel.
const ProxyImportPort = 8787

// ProxyImportReceived is the Wails event emitted with the raw JSON request
// body every time a chat site sends a chat completion request to the local
// import server. The frontend parses it into a CharacterDraft.
const ProxyImportReceived = "proxy-import:received"

type proxyImportServer struct {
	mu     sync.Mutex
	server *http.Server
}

func (s *proxyImportServer) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil {
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		// The chat site's page fetches this cross-origin, so the browser sends a
		// CORS preflight (OPTIONS) before the real POST, and expects these
		// headers on both responses.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		runtime.EventsEmit(ctx, ProxyImportReceived, string(body))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"id":     "chatcmpl-charshare-import",
			"object": "chat.completion",
			"choices": []map[string]any{
				{
					"index": 0,
					"message": map[string]string{
						"role":    "assistant",
						"content": "Received by Charshare. You can close this chat now.",
					},
					"finish_reason": "stop",
				},
			},
		})
	})

	s.server = &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", ProxyImportPort),
		Handler: mux,
	}

	ln, err := net.Listen("tcp", s.server.Addr)
	if err != nil {
		s.server = nil
		return err
	}

	go s.server.Serve(ln)
	return nil
}

func (s *proxyImportServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server == nil {
		return nil
	}
	err := s.server.Close()
	s.server = nil
	return err
}

func (s *proxyImportServer) Running() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.server != nil
}

// StartProxyImportServer starts a local HTTP server that a chat site's
// custom-endpoint chat requests can be pointed at, to import a character's
// persona/scenario/greeting straight from an authenticated browser chat.
func (a *App) StartProxyImportServer() string {
	if err := a.proxyImport.Start(a.ctx); err != nil {
		return err.Error()
	}
	return ""
}

// StopProxyImportServer stops the local import server, if running.
func (a *App) StopProxyImportServer() string {
	if err := a.proxyImport.Stop(); err != nil {
		return err.Error()
	}
	return ""
}

// IsProxyImportServerRunning reports whether the local import server is
// currently listening.
func (a *App) IsProxyImportServerRunning() bool {
	return a.proxyImport.Running()
}
