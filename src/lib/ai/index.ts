import type { ProviderConfig } from '$lib/types';
import { requestCompletion as requestOpenRouterCompletion } from './openrouter';
import { requestCompletion as requestOllamaCompletion } from './ollama';
import type { CompletionMessage, CompletionResult, RequestCompletionOptions } from './openrouter';

export type { CompletionMessage, CompletionResult, RequestCompletionOptions };

export function requestCompletion(
	config: ProviderConfig,
	messages: CompletionMessage[],
	options: RequestCompletionOptions = {}
): Promise<CompletionResult> {
	switch (config.provider) {
		case 'openrouter':
			return requestOpenRouterCompletion(config, messages, options);
		case 'ollama':
			return requestOllamaCompletion(config, messages, options);
	}
}
