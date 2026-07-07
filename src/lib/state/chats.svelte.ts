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
		root_id: null,
		active_child: {},
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
		root_id: source.root_id ?? null,
		active_child: source.active_child ?? {},
		created_at: Date.now()
	};
	chats = { ...chats, [chat.id]: chat };
	await persist();
	return chat;
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
export async function editMessage(chatId: ChatId, messageId: MessageId, content: string): Promise<void> {
	const chat = chats[chatId];
	if (!chat) throw new Error('Chat not found.');
	const message = chat.messages.find((m) => m.id === messageId);
	if (!message || message.content === content) return;
	await addMessage(chatId, message.role, content, message.parent_id);
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
