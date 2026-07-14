import type { OllamaProviderConfig } from '$lib/types';
import type { CompletionMessage, CompletionResult, RequestCompletionOptions } from './openrouter';
import { stripThinking } from './strip-thinking';
import { isWailsDesktop, streamOllamaChat } from '$lib/wails';

interface OllamaStreamState {
	content: string;
	finishReason: string | null;
}

/** Parses one line of Ollama's newline-delimited JSON response, updating
 *  `state` in place and reporting the accumulated content so far via
 *  `onChunk` — shared between the two transports below (direct fetch vs.
 *  the Wails Go-backend bridge) so they can't drift apart. */
function applyOllamaLine(line: string, state: OllamaStreamState, onChunk?: (contentSoFar: string) => void): void {
	if (!line.trim()) return;
	let parsed: { message?: { content?: string }; done?: boolean; done_reason?: string | null };
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}
	const delta = parsed.message?.content;
	if (delta) {
		state.content += delta;
		onChunk?.(stripThinking(state.content));
	}
	if (parsed.done && parsed.done_reason) state.finishReason = parsed.done_reason;
}

/** Calls a local/self-hosted Ollama server's native chat endpoint. No API
 *  key: Ollama is expected to run on the user's machine or trusted network.
 *  Streams newline-delimited JSON (stream: true) so the UI can render the
 *  reply as it's generated instead of waiting for the whole thing. */
export async function requestCompletion(
	config: OllamaProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	const url = `${config.baseUrl.replace(/\/$/, '')}/api/chat`;
	const body = {
		model: config.model,
		messages,
		stream: true,
		keep_alive: `${config.keep_alive_minutes}m`,
		...(config.disable_thinking ? { think: false } : {}),
		options: {
			temperature: config.temperature,
			top_k: config.top_k,
			top_p: config.top_p,
			min_p: config.min_p,
			repeat_penalty: config.repetition_penalty,
			num_predict: config.max_tokens,
			num_ctx: config.context_size
		}
	};

	const state: OllamaStreamState = { content: '', finishReason: null };

	if (isWailsDesktop()) {
		// The packaged app's webview fetch() is subject to CORS like any
		// browser, and Ollama's default CORS allowlist doesn't include the
		// webview's origin (e.g. wails://wails.localhost) — its preflight
		// OPTIONS request gets a flat 403, so every chat send fails outright.
		// Routed through the Go backend instead (see ollama.go), which is a
		// plain outgoing HTTP client with no browser-side CORS to enforce.
		await streamOllamaChat(
			url,
			JSON.stringify(body),
			(line) => applyOllamaLine(line, state, options.onChunk),
			options.signal
		);
		return { content: stripThinking(state.content), finishReason: state.finishReason };
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: options.signal
	});

	if (!response.ok) {
		throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
	}
	if (!response.body) {
		throw new Error('Ollama response had no body to stream.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) applyOllamaLine(line, state, options.onChunk);
	}

	return { content: stripThinking(state.content), finishReason: state.finishReason };
}
