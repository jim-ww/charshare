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

/** Calls OpenRouter's OpenAI-compatible chat completions endpoint directly
 *  from the browser (see spec: Preferences — CORS-supported, no proxy
 *  needed for this provider). The API key never leaves the client. */
export async function requestCompletion(
	config: OpenRouterProviderConfig,
	messages: CompletionMessage[]
): Promise<CompletionResult> {
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

	const data = (await response.json()) as {
		choices?: { message?: { content?: string }; finish_reason?: string | null }[];
	};
	return {
		content: data.choices?.[0]?.message?.content ?? '',
		finishReason: data.choices?.[0]?.finish_reason ?? null
	};
}
