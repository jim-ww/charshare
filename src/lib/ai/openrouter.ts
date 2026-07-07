import type { ProviderConfig } from '$lib/types';

export interface CompletionMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Calls OpenRouter's OpenAI-compatible chat completions endpoint directly
 *  from the browser (see spec: Preferences — CORS-supported, no proxy
 *  needed for this provider). The API key never leaves the client. */
export async function requestCompletion(config: ProviderConfig, messages: CompletionMessage[]): Promise<string> {
	const response = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`
		},
		body: JSON.stringify({
			model: config.model,
			messages,
			temperature: config.temperature,
			max_tokens: config.max_tokens,
			top_p: config.top_p,
			repetition_penalty: config.repetition_penalty,
			frequency_penalty: config.frequency_penalty
		})
	});

	if (!response.ok) {
		throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
	}

	const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
	return data.choices?.[0]?.message?.content ?? '';
}
