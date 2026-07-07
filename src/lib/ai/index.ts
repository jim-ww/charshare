import type { ProviderConfig } from '$lib/types';
import { requestCompletion as requestOpenRouterCompletion } from './openrouter';
import { requestCompletion as requestOllamaCompletion } from './ollama';
import type { CompletionMessage } from './openrouter';

export type { CompletionMessage };

export function requestCompletion(config: ProviderConfig, messages: CompletionMessage[]): Promise<string> {
	switch (config.provider) {
		case 'openrouter':
			return requestOpenRouterCompletion(config, messages);
		case 'ollama':
			return requestOllamaCompletion(config, messages);
	}
}
