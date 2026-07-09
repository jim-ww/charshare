import { browser } from '$app/environment';
import type { Chat, ChatId, CharacterId, Message, MessageId, MessageRole, PersonaId } from '$lib/types';
import { loadChats, saveChats } from '$lib/db/chats';
import { getPreferences } from '$lib/state/preferences.svelte';

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
			const loaded = await loadChats();
			// migrate chats saved before `draft`/`image_index`/backgrounds existed
			for (const chat of Object.values(loaded)) {
				if (chat.draft === undefined) chat.draft = '';
				if (chat.image_index === undefined) chat.image_index = 0;
				if (chat.persona_id === undefined) chat.persona_id = null;
				if (chat.backgrounds === undefined) chat.backgrounds = [];
				if (chat.active_background === undefined) chat.active_background = null;
			}
			chats = loaded;
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

export async function createChat(
	characterId: CharacterId,
	name: string,
	personaId: PersonaId | null = null
): Promise<Chat> {
	const defaultBackground = getPreferences().defaultBackground.trim();
	const chat: Chat = {
		id: crypto.randomUUID(),
		character_id: characterId,
		persona_id: personaId,
		name,
		messages: [],
		root_id: null,
		active_child: {},
		created_at: Date.now(),
		draft: '',
		image_index: 0,
		backgrounds: defaultBackground ? [defaultBackground] : [],
		active_background: defaultBackground || null
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

/** Re-points a chat at a different character — recovery path for when the
 *  original character can no longer be loaded (deleted upstream, relay
 *  unreachable, etc.), letting the chat history survive by attaching it to a
 *  replacement instead of being stuck unusable forever. */
export async function setChatCharacter(id: ChatId, characterId: CharacterId): Promise<void> {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	chats = { ...chats, [id]: { ...chat, character_id: characterId } };
	await persist();
}

// Shared by setChatDraft and setChatImageIndex — both debounce into the same
// full-snapshot persist(), so one pending timer covers whichever fired last.
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** Persists the composer's unsent text so it survives a page reload/close.
 *  Called on every keystroke — updates in-memory state immediately but
 *  debounces the IndexedDB write so typing doesn't hit disk on every
 *  character. */
export function setChatDraft(id: ChatId, draft: string): void {
	const chat = chats[id];
	if (!chat || chat.draft === draft) return;
	chats = { ...chats, [id]: { ...chat, draft } };
	if (draftPersistTimer) clearTimeout(draftPersistTimer);
	draftPersistTimer = setTimeout(() => {
		draftPersistTimer = null;
		void persist();
	}, 400);
}

/** Persists the character image viewer's selected index, debounced like
 *  setChatDraft (arrow-key navigation can fire rapidly). The caller is
 *  responsible for clamping against the current image count — this just
 *  stores whatever index it's given. */
export function setChatImageIndex(id: ChatId, imageIndex: number): void {
	const chat = chats[id];
	if (!chat || chat.image_index === imageIndex) return;
	chats = { ...chats, [id]: { ...chat, image_index: imageIndex } };
	if (draftPersistTimer) clearTimeout(draftPersistTimer);
	draftPersistTimer = setTimeout(() => {
		draftPersistTimer = null;
		void persist();
	}, 400);
}

export async function addChatBackground(id: ChatId, url: string): Promise<void> {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	const trimmed = url.trim();
	if (!trimmed || chat.backgrounds.includes(trimmed)) return;
	chats = { ...chats, [id]: { ...chat, backgrounds: [...chat.backgrounds, trimmed] } };
	await persist();
}

/** Removes a background from the list; if it was the active one, clears the
 *  active selection too so the chat doesn't reference a deleted url. */
export async function removeChatBackground(id: ChatId, url: string): Promise<void> {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	chats = {
		...chats,
		[id]: {
			...chat,
			backgrounds: chat.backgrounds.filter((b) => b !== url),
			active_background: chat.active_background === url ? null : chat.active_background
		}
	};
	await persist();
}

export async function setChatActiveBackground(id: ChatId, url: string | null): Promise<void> {
	const chat = chats[id];
	if (!chat || chat.active_background === url) return;
	chats = { ...chats, [id]: { ...chat, active_background: url } };
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
export async function importChat(
	characterId: CharacterId,
	json: string,
	personaId: PersonaId | null = null
): Promise<Chat> {
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
		persona_id: personaId,
		name: source.name,
		messages: source.messages,
		root_id: source.root_id ?? null,
		active_child: source.active_child ?? {},
		created_at: Date.now(),
		draft: '',
		image_index: 0,
		backgrounds: [],
		active_background: null
	};
	chats = { ...chats, [chat.id]: chat };
	await persist();
	return chat;
}

/** Restores a chat from a full data backup, preserving its original id
 *  (unlike importChat, which is for importing a single shared chat and
 *  deliberately mints a new id). Used by dataExport.ts's bulk "chats"
 *  category import, so re-restoring the same backup merges instead of
 *  piling up duplicate copies every time.
 *
 *  Chats have no version field, so an id collision with different content is
 *  resolved by asking the user which to keep. */
export async function restoreChat(chat: Chat): Promise<'added' | 'updated' | 'skipped'> {
	const existing = chats[chat.id];
	if (!existing) {
		chats = { ...chats, [chat.id]: chat };
		await persist();
		return 'added';
	}
	if (JSON.stringify(existing) === JSON.stringify(chat)) return 'skipped';

	const preferImported = confirm(
		`A chat named "${existing.name}" already exists with different content. Replace it with the imported version?`
	);
	if (!preferImported) return 'skipped';

	chats = { ...chats, [chat.id]: chat };
	await persist();
	return 'updated';
}

/** Walks the chat's active_child pointers from root_id to the leaf,
 *  returning the currently-selected linear conversation — what's rendered
 *  and what's sent to the model. All other messages in chat.messages belong
 *  to branches regenerated away from (see getSiblings/switchBranch). */
export function getActivePath(chat: Chat): Message[] {
	if (chat.root_id === null) return [];
	const byId = new Map(chat.messages.map((m) => [m.id, m]));
	const path: Message[] = [];
	let current: MessageId | undefined = chat.root_id;
	while (current !== undefined) {
		const message = byId.get(current);
		if (!message) break;
		path.push(message);
		current = chat.active_child[current];
	}
	return path;
}

/** Id of the last message on the active path — where a newly-appended
 *  message attaches by default (see addMessage). */
function activeLeafId(chat: Chat): MessageId | null {
	const path = getActivePath(chat);
	return path.length > 0 ? path[path.length - 1].id : null;
}

/** All messages sharing the same parent as the given one, oldest first —
 *  the alternate "routes" at that point in the tree, including the message
 *  itself. A message regenerated only once returns just itself. */
export function getSiblings(chat: Chat, messageId: MessageId): Message[] {
	const message = chat.messages.find((m) => m.id === messageId);
	if (!message) return [];
	return chat.messages
		.filter((m) => m.parent_id === message.parent_id)
		.sort((a, b) => a.created_at - b.created_at);
}

/** Makes `messageId` the active branch at its position in the tree — either
 *  a new root, or the active_child of its parent. */
export async function switchBranch(chatId: ChatId, messageId: MessageId): Promise<void> {
	updateChat(chatId, (chat) => {
		const message = chat.messages.find((m) => m.id === messageId);
		if (!message) return chat;
		if (message.parent_id === null) {
			return { ...chat, root_id: messageId };
		}
		return { ...chat, active_child: { ...chat.active_child, [message.parent_id]: messageId } };
	});
	await persist();
}

function updateChat(id: ChatId, update: (chat: Chat) => Chat): void {
	const chat = chats[id];
	if (!chat) throw new Error('Chat not found.');
	chats = { ...chats, [id]: update(chat) };
}

/** Appends a new message, attached under `parentId` — or, if omitted, under
 *  the current active leaf (the normal case: continuing the visible
 *  conversation). Passing an earlier message's id as `parentId` instead adds
 *  a sibling branch there and switches the active path to it (see
 *  regenerateMessage and editMessage) without touching the old branch, which
 *  stays in `messages` and can be switched back to. */
export async function addMessage(
	chatId: ChatId,
	role: MessageRole,
	content: string,
	parentId?: MessageId | null
): Promise<Message> {
	const chat = chats[chatId];
	if (!chat) throw new Error('Chat not found.');
	const parent = parentId !== undefined ? parentId : activeLeafId(chat);
	const now = Date.now();
	const message: Message = {
		id: crypto.randomUUID(),
		parent_id: parent,
		role,
		content,
		created_at: now,
		updated_at: now
	};
	updateChat(chatId, (chat) => ({
		...chat,
		messages: [...chat.messages, message],
		root_id: parent === null ? message.id : chat.root_id,
		active_child: parent === null ? chat.active_child : { ...chat.active_child, [parent]: message.id }
	}));
	await persist();
	return message;
}

/** Rewrites a message's content in place, without creating a new node —
 *  used while a streamed reply is still arriving. Persistence is skipped by
 *  default since this fires on every chunk; pass persist: true for the final
 *  write once the stream ends. */
export async function updateMessageContent(
	chatId: ChatId,
	messageId: MessageId,
	content: string,
	opts: { persist?: boolean } = {}
): Promise<void> {
	updateChat(chatId, (chat) => ({
		...chat,
		messages: chat.messages.map((m) => (m.id === messageId ? { ...m, content, updated_at: Date.now() } : m))
	}));
	if (opts.persist) await persist();
}

/** Edits a message by adding a sibling branch under the same parent and
 *  switching to it — the same tree-branching mechanism regenerateMessage
 *  uses, so edits and regenerations show up as one unified set of branches
 *  rather than two separate mechanisms. No-ops if the content didn't
 *  actually change. */
export async function editMessage(chatId: ChatId, messageId: MessageId, content: string): Promise<Message | undefined> {
	const chat = chats[chatId];
	if (!chat) throw new Error('Chat not found.');
	const message = chat.messages.find((m) => m.id === messageId);
	if (!message || message.content === content) return undefined;
	return addMessage(chatId, message.role, content, message.parent_id);
}

/** Deletes a message and everything built on top of it (its whole subtree),
 *  since a message with descendants elsewhere in the tree can't be removed
 *  without orphaning them. Fixes up root_id/active_child so the tree stays
 *  consistent — falling back to another root, or leaving the parent as a
 *  leaf, if the removed branch was the active one. */
export async function deleteMessage(chatId: ChatId, messageId: MessageId): Promise<void> {
	updateChat(chatId, (chat) => {
		const toDelete = new Set<MessageId>();
		const collect = (id: MessageId) => {
			toDelete.add(id);
			for (const m of chat.messages) if (m.parent_id === id) collect(m.id);
		};
		collect(messageId);

		const messages = chat.messages.filter((m) => !toDelete.has(m.id));
		const active_child = Object.fromEntries(
			Object.entries(chat.active_child).filter(([parent, child]) => !toDelete.has(parent) && !toDelete.has(child))
		);
		let root_id = chat.root_id;
		if (root_id !== null && toDelete.has(root_id)) {
			root_id = messages.find((m) => m.parent_id === null)?.id ?? null;
		}
		return { ...chat, messages, active_child, root_id };
	});
	await persist();
}

/** Test-only escape hatch: bypasses IndexedDB persistence (unavailable
 *  under plain Node/vitest), mirroring __setGunForTests/__setKeyringForTests. */
export function __setChatsForTests(next: Record<ChatId, Chat>): void {
	chats = next;
	ready = true;
	persistenceEnabled = false;
}
