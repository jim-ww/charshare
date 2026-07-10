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

let appModule: Promise<CharshareAppBindings> | null = null;
function loadApp(): Promise<CharshareAppBindings> {
	if (!appModule) appModule = import("../../bindings/charshare/app");
	return appModule;
}

// A variable (rather than a string literal) keeps TypeScript from trying to
// statically resolve this Wails-served, not-on-disk path as a module
// specifier — the /* @vite-ignore */ does the equivalent for Vite's bundler.
const RUNTIME_URL = "/wails/runtime.js";

let runtimeModule: Promise<WailsRuntimeModule> | null = null;
function loadRuntime(): Promise<WailsRuntimeModule> {
	if (!runtimeModule) {
		runtimeModule = import(/* @vite-ignore */ RUNTIME_URL) as Promise<WailsRuntimeModule>;
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
