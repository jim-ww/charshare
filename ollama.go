package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// defaultOllamaResponseHeaderTimeout is used when the frontend doesn't send
// a configured value (e.g. preferences saved before request_timeout_seconds
// existed). Generous: a cold model load (first request after Ollama starts,
// or after it's been idle past keep_alive) can take a while before the first
// byte comes back.
const defaultOllamaResponseHeaderTimeout = 60 * time.Second

// ollamaHTTPClient builds a client with no overall request timeout (a chat
// reply can take much longer than any fixed deadline while it streams), but
// bounds how long connecting and waiting for the response headers can take
// — without this, an unreachable/misconfigured Ollama server hangs
// FetchOllamaChat (and the frontend's awaiting promise) forever with no
// error at all, which is exactly the "infinite Replying…" symptom this was
// added to diagnose. `responseHeaderTimeoutSeconds` <= 0 falls back to the
// default above.
func ollamaHTTPClient(responseHeaderTimeoutSeconds int) *http.Client {
	timeout := defaultOllamaResponseHeaderTimeout
	if responseHeaderTimeoutSeconds > 0 {
		timeout = time.Duration(responseHeaderTimeoutSeconds) * time.Second
	}
	return &http.Client{
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 5 * time.Second,
			}).DialContext,
			ResponseHeaderTimeout: timeout,
		},
	}
}

// OllamaChatChunkEvent is emitted once per NDJSON line of an in-flight
// Ollama chat response, tagged with the requestID the frontend generated for
// it (see frontend/src/lib/wails.ts).
const OllamaChatChunkEvent = "ollama-chat:chunk"

type ollamaChatChunkPayload struct {
	RequestID string `json:"requestId"`
	Line      string `json:"line"`
}

// FetchOllamaChat proxies a chat-completion request to a local/self-hosted
// Ollama server from the Go backend rather than the webview's own fetch().
// The webview's origin (e.g. wails://wails.localhost) isn't in Ollama's
// default CORS allowlist, so a direct browser-side fetch to it gets a flat
// 403 on the CORS preflight — a plain outgoing Go HTTP client has no
// browser-side CORS to enforce, sidestepping the problem entirely.
//
// Blocks for the whole request/response, emitting each NDJSON line as an
// OllamaChatChunkEvent as it arrives so the existing live-token rendering
// (see ai/ollama.ts) keeps working. The returned error becomes the JS-side
// promise's rejection reason directly — no separate "done"/"error" event
// needed, since the call itself only resolves once streaming is complete.
//
// `ctx` is Wails' own per-call context (first-parameter convention — see
// pkg/application/bindings.go's needsContext handling): calling `.cancel()`
// on the CancellablePromise this returns to the frontend cancels `ctx`,
// which aborts the underlying HTTP request via NewRequestWithContext. No
// hand-rolled cancellation registry needed.
func (a *App) FetchOllamaChat(ctx context.Context, requestID string, url string, bodyJSON string, responseTimeoutSeconds int) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ollamaHTTPClient(responseTimeoutSeconds).Do(req)
	if err != nil {
		log.Printf("[ollama] request %s: HTTP call failed: %s", requestID, err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[ollama] request %s: %d %s", requestID, resp.StatusCode, string(body))
		return fmt.Errorf("ollama request failed: %d %s", resp.StatusCode, string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	// Ollama's NDJSON lines can exceed bufio.Scanner's 64KiB default (a long
	// reply's running "message.content" is repeated in full on every line) —
	// raise the cap well above what any single line should realistically need.
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		a.app.Event.Emit(OllamaChatChunkEvent, ollamaChatChunkPayload{RequestID: requestID, Line: line})
	}
	if err := scanner.Err(); err != nil {
		log.Printf("[ollama] request %s: stream error: %s", requestID, err)
		return err
	}
	return nil
}
