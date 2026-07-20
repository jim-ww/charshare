import type { HuggingFaceProviderConfig } from '$lib/types';
import type { CompletionMessage, CompletionResult, RequestCompletionOptions } from './openrouter';
import { stripThinking } from './strip-thinking';
import { withRequestTimeout } from './requestTimeout';

const HUGGINGFACE_URL = 'https://router.huggingface.co/v1/chat/completions';

/** Calls Hugging Face's OpenAI-compatible router endpoint directly from the
 *  browser. The API key never leaves the client. Streams via SSE (stream:
 *  true) so the UI can render the reply as it's generated. */
export async function requestCompletion(
	config: HuggingFaceProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	const response = await fetch(HUGGINGFACE_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
			Authorization: `Bearer ${config.apiKey}`
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			stream: true,
			temperature: config.temperature,
			max_tokens: config.max_tokens,
			top_p: config.top_p,
			min_p: config.min_p,
			frequency_penalty: config.frequency_penalty
		}),
		signal: withRequestTimeout(options.signal, config.request_timeout_seconds)
	});

	if (!response.ok) {
		throw new Error(`Hugging Face request failed: ${response.status} ${await response.text()}`);
	}
	if (!response.body) {
		throw new Error('Hugging Face response had no body to stream.');
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
