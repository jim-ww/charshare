import { isWailsDesktop } from "$lib/wails";

export type MediaType = "image" | "video";

export interface MediaItem {
	url: string;
	type: MediaType;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".ogv"];

/** Guesses a URL's media type from its extension, defaulting to "image" for
 *  anything unrecognized (data URIs, extensionless CDN links, etc.) — used
 *  by CharacterForm to preselect a type for a newly entered URL. */
export function inferMediaType(url: string): MediaType {
	const path = url.split(/[?#]/)[0].toLowerCase();
	return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? "video" : "image";
}

/** First image-type entry, skipping any leading videos — used wherever a
 *  single still image is needed (avatars, chat thumbnails) rather than the
 *  full ordered media carousel. Tolerates a missing `media` array — some
 *  locally cached characters predate the field being required. */
export function firstImageUrl(media: MediaItem[] | undefined): string | undefined {
	return media?.find((m) => m.type === "image")?.url;
}

// Matches mediaProxyPort in mediaproxy.go.
const MEDIA_PROXY_PORT = 8788;

/** Rewrites a remote media URL to go through the desktop app's local media
 *  proxy (see mediaproxy.go) instead of fetching it directly — a no-op
 *  outside the Wails desktop build.
 *
 *  This has to be a real loopback TCP server, not a route on Wails' own
 *  asset server: on Linux, Wails serves app content to WebKitGTK through a
 *  registered custom URI scheme (an in-process callback, not a real
 *  socket). A `<video src>` is fetched by WebKitGTK's separate GStreamer
 *  network stack, which only understands real network protocols and can't
 *  reach a custom URI scheme at all — unlike `<img>`, which goes through
 *  WebKit's own resource loader and calls that callback directly.
 *
 *  Layered on top of that, some CDNs gate video specifically behind
 *  anti-hotlink checks (Referer, Sec-Fetch-Site) that no client-side
 *  request from this app could ever satisfy either — those are
 *  browser-computed, forbidden headers a plain `fetch()` can't spoof. The
 *  local Go proxy makes the outbound request itself, free of both
 *  restrictions, over a real socket GStreamer can actually connect to. */
export function mediaProxyUrl(url: string): string {
	if (!isWailsDesktop()) return url;
	return `http://127.0.0.1:${MEDIA_PROXY_PORT}/media?url=${encodeURIComponent(url)}`;
}
