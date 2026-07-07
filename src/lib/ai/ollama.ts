import type { OllamaProviderConfig } from '$lib/types';
import type { CompletionMessage, CompletionResult } from './openrouter';

/** Calls a local/self-hosted Ollama server's native chat endpoint. No API
 *  key: Ollama is expected to run on the user's machine or trusted network. */
export async function requestCompletion(
	config: OllamaProviderConfig,
	messages: CompletionMessage[]
): Promise<CompletionResult> {
	const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: config.model,
			messages,
			stream: false,
			options: {
				temperature: config.temperature,
				top_k: config.top_k,
				top_p: config.top_p,
				repeat_penalty: config.repetition_penalty,
				num_predict: config.max_tokens,
				num_ctx: config.context_size
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
	}

	const data = (await response.json()) as { message?: { content?: string }; done_reason?: string | null };
	return {
		content: data.message?.content ?? '',
		finishReason: data.done_reason ?? null
	};
}
