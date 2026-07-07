import type { Character, Chat } from '$lib/types';
import { activeContent } from '$lib/types';
import { getPreferences } from '$lib/state/preferences.svelte';
import { addMessage } from '$lib/state/chats.svelte';
import { requestCompletion, type CompletionMessage } from './index';

function historyToMessages(chat: Chat): CompletionMessage[] {
	return chat.messages.map((m) => ({
		role: m.role === 'user' ? 'user' : 'assistant',
		content: activeContent(m)
	}));
}

function systemPrompt(character: Character): string {
	return [character.system_prompt, character.scenario && `Scenario: ${character.scenario}`]
		.filter(Boolean)
		.join('\n\n');
}

/** Sends the user's message, then asks the AI to respond in character (see
 *  spec: Chat with Characters). Builds the request from the chat snapshot
 *  passed in plus the new content, rather than re-reading state after
 *  addMessage — avoids a state-timing dependency. */
export async function sendMessage(chat: Chat, character: Character, content: string): Promise<void> {
	await addMessage(chat.id, 'user', content);

	const messages: CompletionMessage[] = [
		{ role: 'system', content: systemPrompt(character) },
		...historyToMessages(chat),
		{ role: 'user', content }
	];
	const reply = await requestCompletion(getPreferences().provider, messages);
	await addMessage(chat.id, 'character', reply);
}

/** "Generate response for me" — the same completion call as sendMessage,
 *  just framed as drafting the user's next line instead of the character's
 *  (see spec). Returns the draft for the user to review/edit before
 *  sending; doesn't append it as a message itself. */
export async function generateUserDraft(chat: Chat, character: Character): Promise<string> {
	const messages: CompletionMessage[] = [
		{
			role: 'system',
			content: `${systemPrompt(character)}\n\nWrite the next line for the human user in this conversation, in their voice — not as ${character.name}.`
		},
		...historyToMessages(chat)
	];
	return requestCompletion(getPreferences().provider, messages);
}
