/** Forwards browser console output and uncaught errors to the Wails Go
 *  process' stdout. WebKitGTK's inspector doesn't reliably open in this dev
 *  setup, so this is the only way to see frontend errors while running
 *  `wails dev`. `window.runtime` only exists inside the Wails webview — a
 *  no-op everywhere else (plain `pnpm dev`, tests, browsers). */
export function installWailsConsoleForward(): void {
	const runtime = (window as unknown as { runtime?: { LogError: (msg: string) => void; LogInfo: (msg: string) => void } }).runtime;
	if (!runtime) return;

	const stringify = (args: unknown[]) =>
		args
			.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)))
			.join(' ');

	const original = { log: console.log, warn: console.warn, error: console.error };
	console.log = (...args) => {
		runtime.LogInfo(stringify(args));
		original.log(...args);
	};
	console.warn = (...args) => {
		runtime.LogInfo(`[warn] ${stringify(args)}`);
		original.warn(...args);
	};
	console.error = (...args) => {
		runtime.LogError(stringify(args));
		original.error(...args);
	};

	window.addEventListener('error', (event) => {
		runtime.LogError(`Uncaught: ${event.message}\n${event.error?.stack ?? ''}`);
	});
	window.addEventListener('unhandledrejection', (event) => {
		runtime.LogError(`Unhandled rejection: ${String(event.reason)}`);
	});
}
