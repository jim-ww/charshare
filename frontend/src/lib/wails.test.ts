import { describe, it, expect, vi, beforeEach } from 'vitest';

/** A minimal stand-in for Wails' real CancellablePromise (see
 *  @wailsio/runtime's cancellable.ts) — just enough surface for
 *  streamOllamaChat: awaitable, and cancelOn(signal) rejects with a
 *  CancelError (mirroring the real class's behavior) once the signal
 *  aborts. */
class FakeCancellablePromise<T> extends Promise<T> {
	cancelOn(signal: AbortSignal): this {
		if (signal.aborted) {
			this.forceReject(new Error('Promise cancelled.'));
		} else {
			signal.addEventListener('abort', () => this.forceReject(new Error('Promise cancelled.')));
		}
		return this;
	}

	private forceReject: (reason: unknown) => void = () => {};

	static make<T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) {
		let rejectRef!: (reason: unknown) => void;
		const p = new FakeCancellablePromise<T>((resolve, reject) => {
			rejectRef = reject;
			executor(resolve, reject);
		});
		p.forceReject = rejectRef;
		return p;
	}
}

const FetchOllamaChat = vi.fn((_requestId: string, _url: string, _bodyJSON: string) =>
	FakeCancellablePromise.make<void>(() => {})
);
vi.mock('../../bindings/charshare/app', () => ({
	FetchOllamaChat: (requestId: string, url: string, bodyJSON: string) => FetchOllamaChat(requestId, url, bodyJSON)
}));

type EventHandler = (event: { data: unknown }) => void;
const listeners = new Map<string, Set<EventHandler>>();
function emit(eventName: string, data: unknown): void {
	for (const handler of listeners.get(eventName) ?? []) handler({ data });
}
vi.mock('/wails/runtime.js', () => ({
	Events: {
		On: (eventName: string, callback: EventHandler) => {
			let set = listeners.get(eventName);
			if (!set) {
				set = new Set();
				listeners.set(eventName, set);
			}
			set.add(callback);
			return () => set!.delete(callback);
		}
	},
	Browser: {
		OpenURL: async () => {}
	}
}));

const { streamOllamaChat } = await import('./wails');

beforeEach(() => {
	listeners.clear();
	FetchOllamaChat.mockClear();
});

describe('streamOllamaChat', () => {
	it('forwards each streamed chunk event to onLine and resolves when the Go call resolves', async () => {
		const lines: string[] = [];
		let resolveCall!: () => void;
		FetchOllamaChat.mockImplementationOnce(() =>
			FakeCancellablePromise.make<void>((resolve) => {
				resolveCall = resolve;
			})
		);

		const promise = streamOllamaChat('http://localhost:11434/api/chat', '{"a":1}', (line) => lines.push(line));
		await vi.waitFor(() => expect(FetchOllamaChat).toHaveBeenCalledTimes(1));
		const [requestId] = FetchOllamaChat.mock.calls[0];

		emit('ollama-chat:chunk', { requestId, line: 'line one' });
		emit('ollama-chat:chunk', { requestId, line: 'line two' });
		resolveCall();

		await promise;
		expect(lines).toEqual(['line one', 'line two']);
	});

	it('rejects with the underlying error when the Go call rejects for a reason other than cancellation', async () => {
		let rejectCall!: (err: unknown) => void;
		FetchOllamaChat.mockImplementationOnce(() =>
			FakeCancellablePromise.make<void>((_resolve, reject) => {
				rejectCall = reject;
			})
		);

		const promise = streamOllamaChat('http://localhost:11434/api/chat', '{}', () => {});
		await vi.waitFor(() => expect(FetchOllamaChat).toHaveBeenCalledTimes(1));
		rejectCall(new Error('Ollama request failed: 500 boom'));

		await expect(promise).rejects.toThrow('Ollama request failed: 500 boom');
	});

	it('ignores chunk events tagged with a different requestId', async () => {
		const lines: string[] = [];
		let resolveCall!: () => void;
		FetchOllamaChat.mockImplementationOnce(() =>
			FakeCancellablePromise.make<void>((resolve) => {
				resolveCall = resolve;
			})
		);

		const promise = streamOllamaChat('http://localhost:11434/api/chat', '{}', (line) => lines.push(line));
		await vi.waitFor(() => expect(FetchOllamaChat).toHaveBeenCalledTimes(1));

		emit('ollama-chat:chunk', { requestId: 'someone-elses-request', line: 'not mine' });
		resolveCall();

		await promise;
		expect(lines).toEqual([]);
	});

	it('cancels the Go-side call and rejects with a DOMException AbortError when the signal is aborted mid-stream', async () => {
		const controller = new AbortController();
		const promise = streamOllamaChat('http://localhost:11434/api/chat', '{}', () => {}, controller.signal);
		await vi.waitFor(() => expect(FetchOllamaChat).toHaveBeenCalledTimes(1));

		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('still calls FetchOllamaChat even if the signal is already aborted, but immediately cancels it', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			streamOllamaChat('http://localhost:11434/api/chat', '{}', () => {}, controller.signal)
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(FetchOllamaChat).toHaveBeenCalledTimes(1);
	});
});
