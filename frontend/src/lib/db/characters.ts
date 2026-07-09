import { get, set } from 'idb-keyval';
import type { Character, CharacterId } from '$lib/types';

/** Local index of characters this browser has created or forked — GUN has
 *  no query engine (see spec: Tag indexing), so "my characters" can't be
 *  discovered from the network alone. Local-only (unpublished) characters
 *  also live entirely here, since they're never written to GUN. */
const STORE_KEY = 'charshare:my-characters';

export interface LocalCharacterEntry {
	id: CharacterId;
	published: boolean;
	/** For unpublished entries, the authoritative document (never written to
	 *  GUN). For published entries, a locally-cached copy of the last-known
	 *  published document — kept as a fallback so an author's own published
	 *  character still shows up in "My Characters" even with no relay
	 *  reachable, instead of silently disappearing because the live GUN
	 *  fetch failed (see characters.svelte.ts:refresh). GUN remains the
	 *  source of truth whenever it's reachable; this cache is only consulted
	 *  when it isn't. */
	character?: Character;
}

async function loadEntries(): Promise<Record<CharacterId, LocalCharacterEntry>> {
	return (await get<Record<CharacterId, LocalCharacterEntry>>(STORE_KEY)) ?? {};
}

function saveEntries(entries: Record<CharacterId, LocalCharacterEntry>): Promise<void> {
	return set(STORE_KEY, entries);
}

export async function loadMyCharacterEntries(): Promise<LocalCharacterEntry[]> {
	return Object.values(await loadEntries());
}

/** Records a character published to GUN under this browser's identity, along
 *  with a local cache of the document itself (see LocalCharacterEntry). */
export async function addPublishedCharacterId(id: CharacterId, character?: Character): Promise<void> {
	const entries = await loadEntries();
	entries[id] = { id, published: true, character: character ?? entries[id]?.character };
	await saveEntries(entries);
}

/** Saves or updates a local-only (unpublished) character's full document. */
export async function saveLocalOnlyCharacter(character: Character): Promise<void> {
	const entries = await loadEntries();
	entries[character.id] = { id: character.id, published: false, character };
	await saveEntries(entries);
}

export async function removeMyCharacterEntry(id: CharacterId): Promise<void> {
	const entries = await loadEntries();
	delete entries[id];
	await saveEntries(entries);
}
