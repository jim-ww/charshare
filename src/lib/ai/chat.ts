import type { Character, Chat, ProviderConfig } from '$lib/types';
import { activeContent } from '$lib/types';
import { getPreferences, initPreferences } from '$lib/state/preferences.svelte';
import { addMessage, deleteMessage, updateMessageContent } from '$lib/state/chats.svelte';
import { requestCompletion, type CompletionMessage } from './index';

const MAX_CONTINUATIONS = 3;

interface CompleteOptions {
	signal?: AbortSignal;
	/** Called with the accumulated reply so far, across all continuation rounds. */
	onChunk?: (contentSoFar: string) => void;
}

/** requestCompletion() can come back cut off mid-sentence — either the
 *  reply hit max_tokens, or (common with free-tier OpenRouter models) the
 *  upstream provider aborts generation early under load and still reports
 *  finish_reason: 'length'. Rather than show the user a truncated message,
 *  ask the model to keep going from where it left off and stitch the
 *  pieces together. */
async function completeWithContinuation(
	config: ProviderConfig,
	messages: CompletionMessage[],
	options: CompleteOptions = {}
): Promise<string> {
	let full = '';
	let pending = messages;
	for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
		const roundStart = full;
		const { content, finishReason } = await requestCompletion(config, pending, {
			signal: options.signal,
			onChunk: (soFar) => options.onChunk?.(roundStart + soFar)
		});
		full = roundStart + content;
		if (finishReason !== 'length') break;
		pending = [
			...pending,
			{ role: 'assistant', content },
			{ role: 'user', content: 'Continue exactly where you left off. Do not repeat anything already written.' }
		];
	}
	return full;
}

/** Preferences load from IndexedDB asynchronously on app start; if a
 *  completion request fires before that resolves (e.g. "Generate for me"
 *  as the very first click on a freshly loaded chat page), the provider
 *  config is still the empty-apiKey default. initPreferences() is
 *  idempotent, so awaiting it here just waits for the in-flight load
 *  rather than re-fetching. Ignore failures (e.g. no IndexedDB in tests) —
 *  fall back to whatever's already in memory. */
async function ensurePreferencesReady(): Promise<void> {
	try {
		await initPreferences();
	} catch {
		// no-op
	}
}

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
 *  addMessage — avoids a state-timing dependency.
 *
 *  Streams the reply into the message as it arrives. Pass `signal` to allow
 *  cancelling mid-stream (e.g. a "stop" button) — whatever was generated up
 *  to that point is kept rather than discarded. */
export async function sendMessage(
	chat: Chat,
	character: Character,
	content: string,
	options: { signal?: AbortSignal } = {}
): Promise<void> {
	await ensurePreferencesReady();
	await addMessage(chat.id, 'user', content);

	const messages: CompletionMessage[] = [
		{ role: 'system', content: systemPrompt(character) },
		...historyToMessages(chat),
		{ role: 'user', content }
	];

	const message = await addMessage(chat.id, 'character', '');
	let latest = '';
	try {
		latest = await completeWithContinuation(getPreferences().provider, messages, {
			signal: options.signal,
			onChunk: (soFar) => {
				latest = soFar;
				void updateMessageContent(chat.id, message.id, soFar);
			}
		});
	} catch (err) {
		if (!latest) {
			await deleteMessage(chat.id, message.id);
			throw err;
		}
		// stopped mid-stream (user hit "stop", or the connection dropped) —
		// keep whatever was generated instead of losing it
	} finally {
		if (latest) await updateMessageContent(chat.id, message.id, latest, { persist: true });
	}
}

/** "Generate response for me" — the same completion call as sendMessage,
 *  just framed as drafting the user's next line instead of the character's
 *  (see spec). Returns the draft for the user to review/edit before
 *  sending; doesn't append it as a message itself. */
export async function generateUserDraft(chat: Chat, character: Character): Promise<string> {
	await ensurePreferencesReady();
	const messages: CompletionMessage[] = [
		{
			role: 'system',
			content: `${systemPrompt(character)}\n\nWrite the next line for the human user in this conversation, in their voice — not as ${character.name}.`
		},
		...historyToMessages(chat)
	];
	return completeWithContinuation(getPreferences().provider, messages);
}
