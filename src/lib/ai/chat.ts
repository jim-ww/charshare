import type { Character, Chat, ChatId, Message, MessageId, ProviderConfig } from '$lib/types';
import { getPreferences, initPreferences } from '$lib/state/preferences.svelte';
import { addMessage, deleteMessage, getActivePath, updateMessageContent } from '$lib/state/chats.svelte';
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

function historyToMessages(messages: Message[]): CompletionMessage[] {
	return messages.map((m) => ({
		role: m.role === 'user' ? 'user' : 'assistant',
		content: m.content
	}));
}

const PARENTHETICAL_INSTRUCTION =
	'Any text inside parentheses ( ) in a message, from either party, is an out-of-character ' +
	'instruction to you, not dialogue or narration. Follow it exactly, then continue the scene ' +
	"without the parenthesized text itself appearing in your reply, unless the instruction says otherwise.";

function systemPrompt(character: Character): string {
	return [
		character.system_prompt && `<SystemPrompt>\n${character.system_prompt}\n</SystemPrompt>`,
		character.personality && `<Personality>\n${character.personality}\n</Personality>`,
		character.scenario && `<Scenario>\n${character.scenario}\n</Scenario>`,
		PARENTHETICAL_INSTRUCTION
	]
		.filter(Boolean)
		.join('\n\n');
}

/** Streams a completion into an already-created (empty) message, keeping
 *  whatever arrived if the stream is aborted or dropped partway through
 *  (shared by sendMessage and regenerateMessage). */
async function streamReply(
	chatId: ChatId,
	messageId: MessageId,
	config: ProviderConfig,
	messages: CompletionMessage[],
	options: CompleteOptions = {}
): Promise<void> {
	let latest = '';
	try {
		latest = await completeWithContinuation(config, messages, {
			signal: options.signal,
			onChunk: (soFar) => {
				latest = soFar;
				void updateMessageContent(chatId, messageId, soFar);
			}
		});
	} catch (err) {
		if (!latest) {
			await deleteMessage(chatId, messageId);
			throw err;
		}
		// stopped mid-stream (user hit "stop", or the connection dropped) —
		// keep whatever was generated instead of losing it
	} finally {
		if (latest) await updateMessageContent(chatId, messageId, latest, { persist: true });
	}
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
	const priorMessages = getActivePath(chat);
	await addMessage(chat.id, 'user', content);

	const messages: CompletionMessage[] = [
		{ role: 'system', content: systemPrompt(character) },
		...historyToMessages(priorMessages),
		{ role: 'user', content }
	];

	const message = await addMessage(chat.id, 'character', '');
	await streamReply(chat.id, message.id, getPreferences().provider, messages, options);
}

/** Regenerates a character message, adding the new reply as a sibling branch
 *  under the same parent rather than overwriting it — so any messages built
 *  on top of the old reply aren't lost, just no longer on the active path
 *  (switchBranch/getSiblings let the UI move between them, like the message
 *  version switcher but for whole branches). All still lives in the same
 *  chat; nothing is forked into a separate chat. */
export async function regenerateMessage(
	chat: Chat,
	character: Character,
	messageId: MessageId,
	options: { signal?: AbortSignal } = {}
): Promise<void> {
	await ensurePreferencesReady();
	const activePath = getActivePath(chat);
	const index = activePath.findIndex((m) => m.id === messageId);
	if (index === -1) throw new Error('Message not found.');

	const priorMessages = activePath.slice(0, index);
	const parentId = activePath[index].parent_id;

	const message = await addMessage(chat.id, 'character', '', parentId);
	const messages: CompletionMessage[] = [
		{ role: 'system', content: systemPrompt(character) },
		...historyToMessages(priorMessages)
	];
	await streamReply(chat.id, message.id, getPreferences().provider, messages, options);
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
		...historyToMessages(getActivePath(chat))
	];
	return completeWithContinuation(getPreferences().provider, messages);
}
