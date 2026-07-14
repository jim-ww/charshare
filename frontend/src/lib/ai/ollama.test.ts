import { describe, it, expect, vi } from 'vitest';
import type { OllamaProviderConfig } from '$lib/types';
import { requestCompletion } from './ollama';

const config: OllamaProviderConfig = {
	provider: 'ollama',
	baseUrl: 'http://localhost:11434',
	model: 'llama3.1:8b',
	temperature: 1,
	max_tokens: 512,
	context_size: 4096,
	top_k: 40,
	top_p: 0.9,
	min_p: 0,
	repetition_penalty: 1,
	frequency_penalty: 0,
	forbidden_words: [],
	disable_thinking: true,
	tosAgreed: true,
	keep_alive_minutes: 15
};

/** Builds a fetch Response streaming Ollama's newline-delimited JSON chunks. */
function ndjsonResponse(deltas: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const delta of deltas) {
				controller.enqueue(encoder.encode(JSON.stringify({ message: { content: delta } }) + '\n'));
			}
			controller.enqueue(encoder.encode(JSON.stringify({ done: true, done_reason: 'stop' }) + '\n'));
			controller.close();
		}
	});
	return { ok: true, body: stream } as unknown as Response;
}

describe('requestCompletion (Ollama)', () => {
	it('sends keep_alive as "<minutes>m" in the request body', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ndjsonResponse(['hi']));
		vi.stubGlobal('fetch', fetchMock);

		await requestCompletion(config, [{ role: 'user', content: 'hello' }]);

		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.keep_alive).toBe('15m');

		vi.unstubAllGlobals();
	});

	it('sends "0m" when keep_alive_minutes is 0 (unload immediately)', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ndjsonResponse(['hi']));
		vi.stubGlobal('fetch', fetchMock);

		await requestCompletion({ ...config, keep_alive_minutes: 0 }, [{ role: 'user', content: 'hello' }]);

		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.keep_alive).toBe('0m');

		vi.unstubAllGlobals();
	});
});

describe('requestCompletion (Ollama) inside the Wails desktop build', () => {
	it('routes through the Go-backend bridge instead of fetch, since a direct fetch gets a CORS 403 there', async () => {
		vi.resetModules();
		const streamOllamaChat = vi.fn(
			async (
				_url: string,
				bodyJson: string,
				onLine: (line: string) => void,
				_signal?: AbortSignal
			): Promise<void> => {
				const body = JSON.parse(bodyJson);
				expect(body.keep_alive).toBe('15m');
				onLine(JSON.stringify({ message: { content: 'hi' } }));
				onLine(JSON.stringify({ done: true, done_reason: 'stop' }));
			}
		);
		vi.doMock('$lib/wails', () => ({
			isWailsDesktop: () => true,
			streamOllamaChat
		}));
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const { requestCompletion: requestCompletionWails } = await import('./ollama');
		const result = await requestCompletionWails(config, [{ role: 'user', content: 'hello' }]);

		expect(streamOllamaChat).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result).toEqual({ content: 'hi', finishReason: 'stop' });

		vi.unstubAllGlobals();
		vi.doUnmock('$lib/wails');
		vi.resetModules();
	});
});
