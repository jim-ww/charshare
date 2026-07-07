import { browser } from '$app/environment';
import type { Chat, ChatId, CharacterId, Message, MessageId, MessageRole } from '$lib/types';
import { loadChats, saveChats } from '$lib/db/chats';

let chats = $state<Record<ChatId, Chat>>({});
let ready = $state(false);
let initPromise: Promise<void> | null = null;
let persistenceEnabled = true;

export function getChats(): Chat[] {
	return Object.values(chats);
}

export function getChat(id: ChatId): Chat | undefined {
	return chats[id];
}

export function isChatsReady(): boolean {
	return ready;
}

export function initChats(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			chats = await loadChats();
			ready = true;
		})();
	}
	return initPromise;
}

async function persist(): Promise<void> {
	if (!persistenceEnabled) return;
	// idb-keyval structured-clones the value for IndexedDB, which throws on
	// the Proxy that $state wraps objects in — persist a plain snapshot instead.
	await saveChats($state.snapshot(chats));
}

export async function createChat(characterId: CharacterId, name: string): Promise<Chat> {
	const chat: Chat = {
		id: crypto.randomUUID(),
		character_id: characterId,
		name,
		messages: [],
		created_at: Date.now()
	};
	chats = { ...chats, [chat.id]: chat };
	await persist();
	return chat;
}

export async function renameChat(id: ChatId, name: string): Promise<void> {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	chats = { ...chats, [id]: { ...chat, name } };
	await persist();
}

export async function deleteChat(id: ChatId): Promise<void> {
	const { [id]: _removed, ...rest } = chats;
	chats = rest;
	await persist();
}

/** Serializes a chat for the "Export" action — plain JSON so it round-trips
 *  through importChat (see below). */
export function exportChat(id: ChatId): string {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	return JSON.stringify(chat, null, 2);
}

/** Imports a previously-exported chat JSON for a given character, assigning a
 *  fresh id/created_at rather than reusing the export's (avoids collisions
 *  and lets the same export be imported more than once). */
export async function importChat(characterId: CharacterId, json: string): Promise<Chat> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error('Not valid JSON.');
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!Array.isArray((parsed as Chat).messages) ||
		typeof (parsed as Chat).name !== 'string'
	) {
		throw new Error('Not a valid chat export.');
	}
	const source = parsed as Chat;
	const chat: Chat = {
		id: crypto.randomUUID(),
		character_id: characterId,
		name: source.name,
		messages: source.messages,
		created_at: Date.now()
	};
	chats = { ...chats, [chat.id]: chat };
	await persist();
	return chat;
}

function updateChat(id: ChatId, update: (chat: Chat) => Chat): void {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	chats = { ...chats, [id]: update(chat) };
}

/** Appends a new message with a single version — the only way messages are
 *  created; edits always operate on an existing message's version history
 *  (see addMessageVersion). */
export async function addMessage(chatId: ChatId, role: MessageRole, content: string): Promise<Message> {
	const message: Message = {
		id: crypto.randomUUID(),
		role,
		versions: [{ content, created_at: Date.now() }],
		active_version_index: 0,
		updated_at: Date.now()
	};
	updateChat(chatId, (chat) => ({ ...chat, messages: [...chat.messages, message] }));
	await persist();
	return message;
}

/** Edits a message by appending a new version and marking it active — never
 *  mutates or discards prior versions (see spec: Message versioning). */
export async function addMessageVersion(chatId: ChatId, messageId: MessageId, content: string): Promise<void> {
	updateChat(chatId, (chat) => ({
		...chat,
		messages: chat.messages.map((m) =>
			m.id === messageId
				? {
						...m,
						versions: [...m.versions, { content, created_at: Date.now() }],
						active_version_index: m.versions.length,
						updated_at: Date.now()
					}
				: m
		)
	}));
	await persist();
}

export async function setActiveVersion(chatId: ChatId, messageId: MessageId, versionIndex: number): Promise<void> {
	updateChat(chatId, (chat) => ({
		...chat,
		messages: chat.messages.map((m) =>
			m.id === messageId && versionIndex >= 0 && versionIndex < m.versions.length
				? { ...m, active_version_index: versionIndex, updated_at: Date.now() }
				: m
		)
	}));
	await persist();
}

export async function deleteMessage(chatId: ChatId, messageId: MessageId): Promise<void> {
	updateChat(chatId, (chat) => ({
		...chat,
		messages: chat.messages.filter((m) => m.id !== messageId)
	}));
	await persist();
}

/** Test-only escape hatch: bypasses IndexedDB persistence (unavailable
 *  under plain Node/vitest), mirroring __setGunForTests/__setKeyringForTests. */
export function __setChatsForTests(next: Record<ChatId, Chat>): void {
	chats = next;
	ready = true;
	persistenceEnabled = false;
}
