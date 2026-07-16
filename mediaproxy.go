package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
)

// MediaProxyPort is where the desktop frontend routes <video src> for remote
// character media, instead of fetching it directly — see
// $lib/types/media.ts's mediaProxyUrl. Must be a real loopback TCP listener
// (not routed through Wails' own AssetOptions.Handler): on Linux, Wails
// serves app content to WebKitGTK via a registered custom URI scheme
// (webkit_web_context_register_uri_scheme), an in-process callback rather
// than a real socket. WebKit's own resource loader (img/document requests)
// calls that callback directly and works fine, but a <video src> is fetched
// by WebKitGTK's separate GStreamer network stack, which only understands
// real network protocols and has no way to reach a custom URI scheme at all.
//
// Layered on top of that: some CDNs gate video specifically behind
// anti-hotlink checks (Referer, Sec-Fetch-Site) that no client-side request
// from this app could ever satisfy either — those are browser-computed,
// forbidden headers a plain fetch() can't spoof (seen in practice:
// cdn.donmai.us 403s any request lacking a same-site Referer and
// Sec-Fetch-Site: same-site). A plain Go http.Client has none of those
// restrictions, so this proxy fetches server-side with headers spoofed to
// look like a same-site browser request, and streams the result back over
// a real socket GStreamer can actually connect to.
const MediaProxyPort = 8788

type mediaProxyServer struct {
	server *http.Server
}

func (s *mediaProxyServer) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/media", mediaProxyHandler)

	s.server = &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", MediaProxyPort), Handler: mux}
	ln, err := net.Listen("tcp", s.server.Addr)
	if err != nil {
		s.server = nil
		return err
	}
	go s.server.Serve(ln)
	return nil
}

func (s *mediaProxyServer) Stop() error {
	if s.server == nil {
		return nil
	}
	err := s.server.Close()
	s.server = nil
	return err
}

func mediaProxyHandler(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	// A generic modern-desktop-Chrome fingerprint plus a same-origin Referer
	// and Sec-Fetch-* trio is the minimal set observed to satisfy Referer/
	// Sec-Fetch-Site-gated anti-hotlink CDNs — see doc comment above.
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
	req.Header.Set("Referer", parsed.Scheme+"://"+parsed.Host+"/")
	req.Header.Set("Sec-Fetch-Site", "same-site")
	req.Header.Set("Sec-Fetch-Mode", "no-cors")
	req.Header.Set("Sec-Fetch-Dest", "video")
	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Cache-Control"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
