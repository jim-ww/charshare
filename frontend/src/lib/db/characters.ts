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
	/** Only present while `published` is false — the document itself, since
	 *  it has never been written to GUN. */
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

/** Records a character published to GUN under this browser's identity. */
export async function addPublishedCharacterId(id: CharacterId): Promise<void> {
	const entries = await loadEntries();
	entries[id] = { id, published: true };
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
