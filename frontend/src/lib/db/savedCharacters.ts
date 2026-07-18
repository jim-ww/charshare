import { get, set } from '$lib/crypto/dataEncryption';
import type { Character, CharacterId } from '$lib/types';

/** Local cache of other authors' characters this browser has chosen to keep
 *  around — either explicitly (the "Save" button) or implicitly because a
 *  local chat uses them (see state/savedCharacters.svelte.ts) — so the
 *  character stays usable/visible even if the author later deletes it or no
 *  relay with it is reachable (see spec: Character Management, "save
 *  character locally"). Separate from db/characters.ts's index, which is
 *  only for characters this browser authored. */
const STORE_KEY = 'charshare:saved-characters';

export interface SavedCharacterEntry {
	character: Character;
	/** true if saved only because a chat referenced it, not a deliberate
	 *  press of "Save" — lets the UI badge automatic saves differently
	 *  without a second storage tier. */
	auto: boolean;
}

async function loadEntries(): Promise<Record<CharacterId, SavedCharacterEntry>> {
	return (await get<Record<CharacterId, SavedCharacterEntry>>(STORE_KEY)) ?? {};
}

function saveEntries(entries: Record<CharacterId, SavedCharacterEntry>): Promise<void> {
	return set(STORE_KEY, entries);
}

export async function loadSavedCharacterEntries(): Promise<Record<CharacterId, SavedCharacterEntry>> {
	return loadEntries();
}

/** Saves or refreshes a cached copy. A manual save (`auto: false`) always
 *  stays manual even if a later auto-save call comes in for the same id —
 *  once the user has deliberately curated something, an implicit chat-start
 *  save shouldn't demote it back to "just automatic". */
export async function saveCharacterEntry(character: Character, auto: boolean): Promise<void> {
	const entries = await loadEntries();
	const existing = entries[character.id];
	entries[character.id] = {
		character,
		auto: existing ? existing.auto && auto : auto
	};
	await saveEntries(entries);
}

export async function removeSavedCharacterEntry(id: CharacterId): Promise<void> {
	const entries = await loadEntries();
	delete entries[id];
	await saveEntries(entries);
}
