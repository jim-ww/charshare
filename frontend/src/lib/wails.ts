/** Wails only exists inside the desktop webview — a no-op everywhere else
 *  (plain `pnpm dev`, tests, browsers). Detected via the "wails.io" User-Agent
 *  fragment that Wails v3 sets on every platform's webview (see
 *  pkg/application/webview_window_{darwin,windows,linux_cgo_gtk3}.go), which
 *  is synchronous and import-free — unlike v2's `window.go`/`window.runtime`
 *  globals, v3's generated service bindings and runtime are only reachable
 *  by importing "/wails/runtime.js" and `frontend/bindings/...`, which this
 *  file only does once it already knows it's running inside Wails. Trying to
 *  import them unconditionally would make Vite try to resolve those Wails-
 *  served paths in the plain website build too. */

export function isWailsDesktop(): boolean {
	return typeof navigator !== "undefined" && navigator.userAgent.includes("wails.io");
}

// Hand-written types for the two runtime module (`/wails/runtime.js`) exports
// this file needs, rather than depending on the `@wailsio/runtime` npm
// package just for types — same approach v2's wails.ts took with its
// window.go/window.runtime interfaces.
interface WailsRuntimeModule {
	Events: {
		On(eventName: string, callback: (event: { data: unknown }) => void): () => void;
	};
	Browser: {
		OpenURL(url: string): Promise<void>;
	};
}

type CharshareAppBindings = typeof import("../../bindings/charshare/app");

// A transient failure (e.g. the webview's internal asset server not yet
// ready to serve this module on a cold start) must not get cached forever —
// only cache the resolved module, so a failed first call doesn't permanently
// break every later one for the rest of the session.
let appModule: Promise<CharshareAppBindings> | null = null;
function loadApp(): Promise<CharshareAppBindings> {
	if (!appModule) {
		appModule = import("../../bindings/charshare/app").catch((err: unknown) => {
			appModule = null;
			throw err;
		});
	}
	return appModule;
}

// A variable (rather than a string literal) keeps TypeScript from trying to
// statically resolve this Wails-served, not-on-disk path as a module
// specifier — the /* @vite-ignore */ does the equivalent for Vite's bundler.
const RUNTIME_URL = "/wails/runtime.js";

let runtimeModule: Promise<WailsRuntimeModule> | null = null;
function loadRuntime(): Promise<WailsRuntimeModule> {
	if (!runtimeModule) {
		runtimeModule = (import(/* @vite-ignore */ RUNTIME_URL) as Promise<WailsRuntimeModule>).catch(
			(err: unknown) => {
				runtimeModule = null;
				throw err;
			}
		);
	}
	return runtimeModule;
}

export async function startProxyImportServer(): Promise<string> {
	const App = await loadApp();
	return App.StartProxyImportServer();
}

export async function stopProxyImportServer(): Promise<string> {
	const App = await loadApp();
	return App.StopProxyImportServer();
}

/** Saves data to disk via a native "Save As" dialog — the webview's
 *  `<a download>`/blob-URL trick has no browser chrome to catch downloads in
 *  Wails' Linux webkit backend, so it's a no-op there. Returns an error
 *  message on failure, or "" on success/cancel. */
export async function saveFile(filename: string, base64Data: string): Promise<string> {
	const App = await loadApp();
	return App.SaveFile(filename, base64Data);
}

/** Stores the local-data encryption passphrase in the OS credential store
 *  (Keychain/Credential Manager/Secret Service), so the desktop build can
 *  unlock without prompting on every launch. Throws on failure. */
export async function secretServiceSet(passphrase: string): Promise<void> {
	const App = await loadApp();
	const err = await App.SecretServiceSet(passphrase);
	if (err) throw new Error(err);
}

/** Reads back a passphrase saved via {@link secretServiceSet}. Returns
 *  `null` if nothing has been stored (not an error — e.g. first launch, or
 *  the user never opted in). Throws on any other failure. */
export async function secretServiceGet(): Promise<string | null> {
	const App = await loadApp();
	const [passphrase, err] = await App.SecretServiceGet();
	if (err) throw new Error(err);
	return passphrase || null;
}

/** Removes a stored passphrase, e.g. when the user disables encryption or
 *  turns off "remember on this device". Throws on failure. */
export async function secretServiceDelete(): Promise<void> {
	const App = await loadApp();
	const err = await App.SecretServiceDelete();
	if (err) throw new Error(err);
}

/** Opens the webview's devtools window, for the preferences "Developer" toggle. */
export async function openDevTools(): Promise<void> {
	const App = await loadApp();
	await App.OpenDevTools();
}

/** Opens a URL in the user's default system browser. Plain `<a
 *  target="_blank">` clicks don't reliably escape Wails' webview (notably
 *  webkitgtk on Linux), so external links must go through this instead. */
export async function openURL(url: string): Promise<void> {
	const { Browser } = await loadRuntime();
	await Browser.OpenURL(url);
}

/** Svelte action for `<a target="_blank">` links to external sites: routes
 *  the click through {@link openURL} inside the Wails desktop build, and is
 *  a no-op everywhere else (the browser's normal navigation handles it). */
export function externalLink(node: HTMLAnchorElement) {
	if (!isWailsDesktop()) return;
	function onClick(e: MouseEvent) {
		e.preventDefault();
		void openURL(node.href);
	}
	node.addEventListener("click", onClick);
	return {
		destroy() {
			node.removeEventListener("click", onClick);
		},
	};
}

/** Subscribes to raw chat-completion request bodies forwarded by the local
 *  import server (see proxyimport.go). Returns an unsubscribe function; since
 *  the subscription itself is async (the runtime module has to load first),
 *  this returns immediately and unsubscribes once that resolves. */
export function onProxyImportReceived(handler: (raw: string) => void): () => void {
	let unsubscribe: (() => void) | null = null;
	let cancelled = false;
	void loadRuntime().then(({ Events }) => {
		if (cancelled) return;
		unsubscribe = Events.On("proxy-import:received", (event) => handler(event.data as string));
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Runs a chat-completion request against a local Ollama server through the
 *  Go backend (see ollama.go) instead of the webview's own fetch() — Ollama's
 *  default CORS allowlist doesn't include the packaged app's webview origin
 *  (e.g. wails://wails.localhost), so a direct fetch from here gets a flat
 *  403 on the CORS preflight and every chat send fails. A plain outgoing Go
 *  HTTP client has no browser-side CORS to enforce.
 *
 *  Streams each NDJSON line of the response to `onLine` as it arrives (same
 *  shape ai/ollama.ts's fetch-based reader loop already parses). Cancellation
 *  rides on Wails' own per-call mechanism (`CancellablePromise.cancelOn`,
 *  see pkg/application/bindings.go's `needsContext` handling) rather than a
 *  hand-rolled registry: FetchOllamaChat's first Go parameter is a
 *  `context.Context` that Wails supplies and cancels automatically when the
 *  call is cancelled, which is what actually aborts the underlying HTTP
 *  request — no separate "cancel" RPC call needed. */
export async function streamOllamaChat(
	url: string,
	bodyJson: string,
	onLine: (line: string) => void,
	signal?: AbortSignal,
	// How long to wait for the response headers (a cold model load can take a
	// while) before giving up — 0/undefined falls back to the Go side's own
	// default. See ollama.go's ollamaHTTPClient.
	responseTimeoutSeconds?: number
): Promise<void> {
	const requestId = crypto.randomUUID();
	const [App, { Events }] = await Promise.all([loadApp(), loadRuntime()]);
	const unsubscribe = Events.On("ollama-chat:chunk", (event) => {
		const payload = event.data as { requestId: string; line: string };
		if (payload.requestId === requestId) onLine(payload.line);
	});

	const call = App.FetchOllamaChat(requestId, url, bodyJson, responseTimeoutSeconds ?? 0);
	if (signal) call.cancelOn(signal);

	try {
		await call;
	} catch (err) {
		// Wails' CancellablePromise rejects with its own CancelError on
		// cancelOn(signal) — translate that back into the DOMException
		// AbortError shape callers already check for (ChatComposer/ChatBubble's
		// "was this just the user hitting Stop" checks), so cancelling via this
		// Go bridge looks the same to them as the plain-fetch path's
		// AbortController-driven abort.
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		throw err;
	} finally {
		unsubscribe();
	}
}
