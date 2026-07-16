package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestMediaProxyHandler(t *testing.T) {
	var gotReferer, gotUA, gotSecFetchSite, gotRange string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotReferer = r.Header.Get("Referer")
		gotUA = r.Header.Get("User-Agent")
		gotSecFetchSite = r.Header.Get("Sec-Fetch-Site")
		gotRange = r.Header.Get("Range")
		w.Header().Set("Content-Type", "video/mp4")
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write([]byte("video-bytes"))
	}))
	defer upstream.Close()

	proxy := httptest.NewServer(http.HandlerFunc(mediaProxyHandler))
	defer proxy.Close()

	proxyURL := proxy.URL + "/media?url=" + url.QueryEscape(upstream.URL+"/video.mp4")
	req, err := http.NewRequest(http.MethodGet, proxyURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Range", "bytes=0-3")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "video-bytes" {
		t.Fatalf("body = %q, want %q", body, "video-bytes")
	}
	if resp.Header.Get("Content-Type") != "video/mp4" {
		t.Fatalf("Content-Type = %q, want video/mp4", resp.Header.Get("Content-Type"))
	}

	upstreamOrigin, _ := url.Parse(upstream.URL)
	wantReferer := upstreamOrigin.Scheme + "://" + upstreamOrigin.Host + "/"
	if gotReferer != wantReferer {
		t.Errorf("upstream Referer = %q, want %q", gotReferer, wantReferer)
	}
	if gotUA == "" {
		t.Error("upstream got empty User-Agent")
	}
	if gotSecFetchSite != "same-site" {
		t.Errorf("upstream Sec-Fetch-Site = %q, want same-site", gotSecFetchSite)
	}
	if gotRange != "bytes=0-3" {
		t.Errorf("upstream Range = %q, want bytes=0-3", gotRange)
	}
}

func TestMediaProxyHandlerRejectsInvalidURL(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(mediaProxyHandler))
	defer proxy.Close()

	for _, target := range []string{"", "not-a-url", "ftp://example.com/x"} {
		resp, err := http.Get(proxy.URL + "/media?url=" + url.QueryEscape(target))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("url=%q: status = %d, want 400", target, resp.StatusCode)
		}
	}
}
