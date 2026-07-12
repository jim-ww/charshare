import type { OpenAiCompatibleProviderConfig } from '$lib/types';
import type { CompletionMessage, CompletionResult, RequestCompletionOptions } from './openrouter';
import { stripThinking } from './strip-thinking';

/** Calls any other OpenAI-compatible chat-completions endpoint — same
 *  request/response shape as OpenRouter/HuggingFace (SSE streaming via
 *  `stream: true`), just against a user-supplied base URL instead of a fixed
 *  one. No API key is sent unless one is configured, since some self-hosted
 *  proxies don't need one (see OpenAiCompatibleProviderConfig). */
export async function requestCompletion(
	config: OpenAiCompatibleProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
			...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			stream: true,
			temperature: config.temperature,
			max_tokens: config.max_tokens,
			top_p: config.top_p,
			frequency_penalty: config.frequency_penalty
		}),
		signal: options.signal
	});

	if (!response.ok) {
		throw new Error(`OpenAI-compatible request failed: ${response.status} ${await response.text()}`);
	}
	if (!response.body) {
		throw new Error('OpenAI-compatible response had no body to stream.');
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
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const payload = trimmed.slice('data:'.length).trim();
			if (payload === '[DONE]') continue;

			let parsed: { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] };
			try {
				parsed = JSON.parse(payload);
			} catch {
				continue;
			}
			const delta = parsed.choices?.[0]?.delta?.content;
			if (delta) {
				content += delta;
				options.onChunk?.(stripThinking(content));
			}
			const reason = parsed.choices?.[0]?.finish_reason;
			if (reason) finishReason = reason;
		}
	}

	return { content: stripThinking(content), finishReason };
}
