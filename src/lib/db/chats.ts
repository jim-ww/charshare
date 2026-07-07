import { get, set } from 'idb-keyval';
import type { Chat, ChatId } from '$lib/types';

/** Chats are local-only (see spec: Chat Management) — IndexedDB, never
 *  localStorage, never published to GUN. Stored as a single map rather than
 *  per-chat keys since the whole list is small and always loaded together. */
const STORE_KEY = 'charshare:chats';

export async function loadChats(): Promise<Record<ChatId, Chat>> {
	return (await get<Record<ChatId, Chat>>(STORE_KEY)) ?? {};
}

export async function saveChats(chats: Record<ChatId, Chat>): Promise<void> {
	await set(STORE_KEY, chats);
}
