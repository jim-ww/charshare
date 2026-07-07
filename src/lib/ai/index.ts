import type { ProviderConfig } from '$lib/types';
import { requestCompletion as requestOpenRouterCompletion } from './openrouter';
import { requestCompletion as requestOllamaCompletion } from './ollama';
import type { CompletionMessage, CompletionResult } from './openrouter';

export type { CompletionMessage, CompletionResult };

export function requestCompletion(
	config: ProviderConfig,
	messages: CompletionMessage[]
): Promise<CompletionResult> {
	switch (config.provider) {
		case 'openrouter':
			return requestOpenRouterCompletion(config, messages);
		case 'ollama':
			return requestOllamaCompletion(config, messages);
	}
}
