import type {
	Character,
	Chat,
	ChatId,
	Message,
	MessageId,
	ProviderConfig,
} from "$lib/types";
import { getPreferences, initPreferences } from "$lib/state/preferences.svelte";
import {
	addMessage,
	deleteMessage,
	editMessage,
	getActivePath,
	updateMessageContent,
} from "$lib/state/chats.svelte";
import { getPersona } from "$lib/state/personas.svelte";
import { DEFAULT_SYSTEM_PROMPT } from "$lib/data/defaultSystemPrompt";
import { requestCompletion, type CompletionMessage } from "./index";

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
	options: CompleteOptions = {},
): Promise<string> {
	let full = "";
	let pending = messages;
	for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
		const roundStart = full;
		const { content, finishReason } = await requestCompletion(config, pending, {
			signal: options.signal,
			onChunk: (soFar) => options.onChunk?.(roundStart + soFar),
		});
		full = roundStart + content;
		if (finishReason !== "length") break;
		pending = [
			...pending,
			{ role: "assistant", content },
			{
				role: "user",
				content:
					"Continue exactly where you left off. Do not repeat anything already written.",
			},
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
		role: m.role === "user" ? "user" : "assistant",
		content: m.content,
	}));
}

const PARENTHETICAL_INSTRUCTION =
	"Any text inside parentheses ( ) in a message from {{user}} is an out-of-character " +
	"instruction to you, not dialogue or narration. Follow it exactly, then continue the scene " +
	"without the parenthesized text itself appearing in your reply, unless the instruction says otherwise. " +
	"Parentheses in your own ({{char}}'s) replies carry no special meaning and are just prose.";

/** The persona's name is never sent here — messages already use the
 *  `{{user}}` macro for that (see historyToMessages/systemPrompt callers),
 *  and the model is expected to resolve it the same as the UI does. Only the
 *  description carries information the model wouldn't otherwise have. */
function personaPrompt(chat: Chat): string {
	const persona = chat.persona_id ? getPersona(chat.persona_id) : undefined;
	return persona?.description
		? `<UserPersona>\n${persona.description}\n</UserPersona>`
		: "";
}

function systemPrompt(character: Character, chat: Chat): string {
	return [
		`<SystemPrompt>\n${character.system_prompt || DEFAULT_SYSTEM_PROMPT}\n</SystemPrompt>`,
		character.personality &&
			`<Personality>\n${character.personality}\n</Personality>`,
		character.scenario && `<Scenario>\n${character.scenario}\n</Scenario>`,
		character.example_dialogues.length &&
			`<ExampleDialogues>\n${character.example_dialogues.join("\n---\n")}\n</ExampleDialogues>`,
		personaPrompt(chat),
		PARENTHETICAL_INSTRUCTION,
	]
		.filter(Boolean)
		.join("\n\n");
}

/** Streams a completion into an already-created (empty) message, keeping
 *  whatever arrived if the stream is aborted or dropped partway through
 *  (shared by sendMessage and regenerateMessage). */
async function streamReply(
	chatId: ChatId,
	messageId: MessageId,
	config: ProviderConfig,
	messages: CompletionMessage[],
	options: CompleteOptions = {},
): Promise<void> {
	let latest = "";
	try {
		latest = await completeWithContinuation(config, messages, {
			signal: options.signal,
			onChunk: (soFar) => {
				latest = soFar;
				void updateMessageContent(chatId, messageId, soFar);
			},
		});
	} catch (err) {
		if (!latest) {
			await deleteMessage(chatId, messageId);
			throw err;
		}
		// stopped mid-stream (user hit "stop", or the connection dropped) —
		// keep whatever was generated instead of losing it
	} finally {
		if (latest)
			await updateMessageContent(chatId, messageId, latest, { persist: true });
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
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	await ensurePreferencesReady();
	const priorMessages = getActivePath(chat);
	await addMessage(chat.id, "user", content);

	const messages: CompletionMessage[] = [
		{ role: "system", content: systemPrompt(character, chat) },
		...historyToMessages(priorMessages),
		{ role: "user", content },
	];

	const message = await addMessage(chat.id, "character", "");
	await streamReply(
		chat.id,
		message.id,
		getPreferences().provider,
		messages,
		options,
	);
}

/** Like sendMessage, but for when the user submits with nothing typed:
 *  no new user message is added, the existing active path is sent as-is
 *  so the AI just continues from whoever spoke last. */
export async function continueChat(
	chat: Chat,
	character: Character,
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	await ensurePreferencesReady();
	const priorMessages = getActivePath(chat);

	const messages: CompletionMessage[] = [
		{ role: "system", content: systemPrompt(character, chat) },
		...historyToMessages(priorMessages),
	];

	const message = await addMessage(chat.id, "character", "");
	await streamReply(
		chat.id,
		message.id,
		getPreferences().provider,
		messages,
		options,
	);
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
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	await ensurePreferencesReady();
	const activePath = getActivePath(chat);
	const index = activePath.findIndex((m) => m.id === messageId);
	if (index === -1) throw new Error("Message not found.");

	const priorMessages = activePath.slice(0, index);
	const parentId = activePath[index].parent_id;

	const message = await addMessage(chat.id, "character", "", parentId);
	const messages: CompletionMessage[] = [
		{ role: "system", content: systemPrompt(character, chat) },
		...historyToMessages(priorMessages),
	];
	await streamReply(
		chat.id,
		message.id,
		getPreferences().provider,
		messages,
		options,
	);
}

/** Continues an existing character message instead of generating a new one —
 *  asks the model to keep writing from exactly where the message left off
 *  (same trick completeWithContinuation uses for a cut-off reply) and
 *  appends the result onto the existing content. For when a reply was good
 *  but stopped short, rather than fully regenerating it as a new branch. */
export async function continueMessage(
	chat: Chat,
	character: Character,
	messageId: MessageId,
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	await ensurePreferencesReady();
	const activePath = getActivePath(chat);
	const index = activePath.findIndex((m) => m.id === messageId);
	if (index === -1) throw new Error("Message not found.");

	const original = activePath[index].content;
	const priorMessages = activePath.slice(0, index);

	const messages: CompletionMessage[] = [
		{ role: "system", content: systemPrompt(character, chat) },
		...historyToMessages(priorMessages),
		{ role: "assistant", content: original },
		{
			role: "user",
			content:
				"Continue exactly where you left off. Do not repeat anything already written.",
		},
	];

	let latest = original;
	try {
		const appended = await completeWithContinuation(getPreferences().provider, messages, {
			signal: options.signal,
			onChunk: (soFar) => {
				latest = original + soFar;
				void updateMessageContent(chat.id, messageId, latest);
			},
		});
		latest = original + appended;
	} catch (err) {
		if (latest === original) throw err;
		// stopped mid-stream — keep whatever was appended so far
	} finally {
		await updateMessageContent(chat.id, messageId, latest, { persist: true });
	}
}

/** Edits a user message and resends the conversation up to (and including)
 *  the edited content, so the character actually reacts to the new wording
 *  instead of the edit silently sitting there until the user separately
 *  triggers a reply. Branches like editMessage/regenerateMessage — the old
 *  message and whatever was built on it stay reachable via switchBranch.
 *
 *  If the content didn't actually change, editMessage no-ops (nothing to
 *  branch) — but "Send" was still pressed, so this still generates a fresh
 *  reply under the existing message rather than silently doing nothing. */
export async function editUserMessage(
	chat: Chat,
	character: Character,
	messageId: MessageId,
	content: string,
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	await ensurePreferencesReady();
	const edited = await editMessage(chat.id, messageId, content);
	const parentId = edited?.id ?? messageId;

	const activePath = getActivePath(chat);
	const index = activePath.findIndex((m) => m.id === messageId);
	const priorMessages = index === -1 ? activePath : activePath.slice(0, index);

	const messages: CompletionMessage[] = [
		{ role: "system", content: systemPrompt(character, chat) },
		...historyToMessages(priorMessages),
		{ role: "user", content },
	];

	const reply = await addMessage(chat.id, "character", "", parentId);
	await streamReply(
		chat.id,
		reply.id,
		getPreferences().provider,
		messages,
		options,
	);
}

/** Unlike systemPrompt(), does not include character.system_prompt — that
 *  field (default or custom) typically instructs the model to stay in
 *  character as {{char}} and explicitly *not* speak for {{user}} (see
 *  DEFAULT_SYSTEM_PROMPT), which would fight the instruction below rather
 *  than just being redundant with it. personality/example_dialogues shape
 *  how {{char}} behaves, which doesn't matter for writing {{user}}'s line —
 *  the chat history already carries {{char}}'s established voice in context.
 *  scenario stays: it's setting/continuity info that may not be restated in
 *  every message. Only the {{char}}/{{user}} macros are used here, never
 *  resolved real names — same as everywhere else the model sees these
 *  prompts. */
function userDraftSystemPrompt(character: Character, chat: Chat): string {
	return [
		`<Instructions>\nWrite the next message from {{user}}'s perspective in this fictional chat ` +
			`with {{char}}, considering the conversation so far. Write only {{user}}'s dialogue/actions — ` +
			`never speak, act, or narrate for {{char}}.\n</Instructions>`,
		character.scenario && `<Scenario>\n${character.scenario}\n</Scenario>`,
		personaPrompt(chat),
		PARENTHETICAL_INSTRUCTION,
	]
		.filter(Boolean)
		.join("\n\n");
}

/** "Generate response for me" — the same completion call as sendMessage,
 *  just framed as drafting the user's next line instead of the character's
 *  (see spec). Returns the draft for the user to review/edit before
 *  sending; doesn't append it as a message itself. */
export async function generateUserDraft(
	chat: Chat,
	character: Character,
): Promise<string> {
	await ensurePreferencesReady();
	const messages: CompletionMessage[] = [
		{ role: "system", content: userDraftSystemPrompt(character, chat) },
		...historyToMessages(getActivePath(chat)),
	];
	return completeWithContinuation(getPreferences().provider, messages);
}
