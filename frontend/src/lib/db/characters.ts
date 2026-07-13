import { get, set } from 'idb-keyval';
import type { Character, CharacterId } from '$lib/types';

/** Local index of characters this browser has created or forked. Local-only
 *  (unpublished) characters live entirely here, since they're never
 *  published to a relay. Published characters could in principle be
 *  rediscovered via an `authors`-filtered relay query alone, but this index
 *  still matters as a fallback: it's what lets "My Characters" keep showing
 *  an author's own published character even when no relay is reachable. */
const STORE_KEY = 'charshare:my-characters';

export interface LocalCharacterEntry {
	id: CharacterId;
	published: boolean;
	/** For unpublished entries, the authoritative document (never published
	 *  to a relay). For published entries, a locally-cached copy of the
	 *  last-known published document — kept as a fallback so an author's own
	 *  published character still shows up in "My Characters" even with no
	 *  relay reachable, instead of silently disappearing because the live
	 *  fetch failed (see characters.svelte.ts:refresh). The network remains
	 *  the source of truth whenever it's reachable; this cache is only
	 *  consulted when it isn't. */
	character?: Character;
	/** Opt-in per-character setting (this browser only, never published) —
	 *  when true, refresh() auto-republishes this character's exact signed
	 *  snapshot whenever it isn't found on the currently-configured relays,
	 *  on every refresh rather than only the once-per-app-start resync (see
	 *  characters.svelte.ts:refresh). Replaces having to notice it's missing
	 *  and press "Republish" by hand. */
	keepPublished?: boolean;
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

/** Records a character published to the network under this browser's
 *  identity, along with a local cache of the document itself (see
 *  LocalCharacterEntry). Preserves any existing `keepPublished` setting —
 *  a purely local preference, unrelated to the document itself. */
export async function addPublishedCharacterId(id: CharacterId, character?: Character): Promise<void> {
	const entries = await loadEntries();
	entries[id] = {
		id,
		published: true,
		character: character ?? entries[id]?.character,
		keepPublished: entries[id]?.keepPublished
	};
	await saveEntries(entries);
}

/** Saves or updates a local-only (unpublished) character's full document. */
export async function saveLocalOnlyCharacter(character: Character): Promise<void> {
	const entries = await loadEntries();
	entries[character.id] = {
		id: character.id,
		published: false,
		character,
		keepPublished: entries[character.id]?.keepPublished
	};
	await saveEntries(entries);
}

export async function removeMyCharacterEntry(id: CharacterId): Promise<void> {
	const entries = await loadEntries();
	delete entries[id];
	await saveEntries(entries);
}

/** Toggles the "keep published" opt-in for `id` — a no-op if the entry
 *  doesn't exist (e.g. someone else's character, never in this index). */
export async function setKeepPublished(id: CharacterId, keepPublished: boolean): Promise<void> {
	const entries = await loadEntries();
	if (!entries[id]) return;
	entries[id] = { ...entries[id], keepPublished };
	await saveEntries(entries);
}
