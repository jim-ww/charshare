import type { OpenRouterProviderConfig } from '$lib/types';

export interface CompletionMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface CompletionResult {
	content: string;
	/** 'stop' means the model ended the turn naturally. Anything else
	 *  (e.g. 'length', or a provider cutting a free-tier generation short)
	 *  means the reply was cut off mid-thought and should be continued. */
	finishReason: string | null;
}

export interface RequestCompletionOptions {
	signal?: AbortSignal;
	/** Called with the accumulated content so far as chunks arrive. */
	onChunk?: (contentSoFar: string) => void;
}

/** Calls OpenRouter's OpenAI-compatible chat completions endpoint directly
 *  from the browser (see spec: Preferences — CORS-supported, no proxy
 *  needed for this provider). The API key never leaves the client.
 *  Streams via SSE (stream: true) so the UI can render the reply as it's
 *  generated instead of waiting for the whole thing. */
export async function requestCompletion(
	config: OpenRouterProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	const response = await fetch(OPENROUTER_URL, {
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
			repetition_penalty: config.repetition_penalty,
			frequency_penalty: config.frequency_penalty,
			...(config.disable_thinking ? { reasoning: { effort: 'none' } } : {})
		}),
		signal: options.signal
	});

	if (!response.ok) {
		throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
	}
	if (!response.body) {
		throw new Error('OpenRouter response had no body to stream.');
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
				options.onChunk?.(content);
			}
			const reason = parsed.choices?.[0]?.finish_reason;
			if (reason) finishReason = reason;
		}
	}

	return { content, finishReason };
}
