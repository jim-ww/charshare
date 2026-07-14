import type { OllamaProviderConfig } from '$lib/types';
import type { CompletionMessage, CompletionResult, RequestCompletionOptions } from './openrouter';
import { stripThinking } from './strip-thinking';

/** Calls a local/self-hosted Ollama server's native chat endpoint. No API
 *  key: Ollama is expected to run on the user's machine or trusted network.
 *  Streams newline-delimited JSON (stream: true) so the UI can render the
 *  reply as it's generated instead of waiting for the whole thing. */
export async function requestCompletion(
	config: OllamaProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: config.model,
			messages,
			stream: true,
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
		}),
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
	let content = '';
	let finishReason: string | null = null;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) continue;
			let parsed: { message?: { content?: string }; done?: boolean; done_reason?: string | null };
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			const delta = parsed.message?.content;
			if (delta) {
				content += delta;
				options.onChunk?.(stripThinking(content));
			}
			if (parsed.done && parsed.done_reason) finishReason = parsed.done_reason;
		}
	}

	return { content: stripThinking(content), finishReason };
}
