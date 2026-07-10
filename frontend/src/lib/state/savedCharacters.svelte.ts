import { browser } from '$app/environment';
import type { Character, CharacterId } from '$lib/types';
import {
	loadSavedCharacterEntries,
	removeSavedCharacterEntry,
	saveCharacterEntry,
	type SavedCharacterEntry
} from '$lib/db/savedCharacters';

let entries = $state<Record<CharacterId, SavedCharacterEntry>>({});
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function initSavedCharacters(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			entries = await loadSavedCharacterEntries();
			ready = true;
		})();
	}
	return initPromise;
}

export function isSavedCharactersReady(): boolean {
	return ready;
}

export function getSavedCharacters(): Character[] {
	return Object.values(entries).map((e) => e.character);
}

export function getSavedCharacter(id: CharacterId): Character | undefined {
	return entries[id]?.character;
}

export function isCharacterSaved(id: CharacterId): boolean {
	return id in entries;
}

export function isCharacterAutoSaved(id: CharacterId): boolean {
	return entries[id]?.auto === true;
}

/** Caches `character` locally so it survives the author deleting it or
 *  becoming unreachable (see spec: Character Management). `auto: true` for
 *  saves triggered by starting/continuing a chat; `auto: false` for the
 *  explicit "Save" button — see db/savedCharacters.ts for how the two
 *  interact when called repeatedly for the same id. */
export async function saveCharacterLocally(
	character: Character,
	options?: { auto?: boolean }
): Promise<void> {
	const auto = options?.auto ?? false;
	// idb-keyval structured-clones the value for IndexedDB, which throws on
	// the Proxy that $state wraps objects in (callers often pass a reactive
	// character straight from component state) — persist a plain snapshot.
	await saveCharacterEntry($state.snapshot(character), auto);
	entries = await loadSavedCharacterEntries();
}

export async function unsaveCharacter(id: CharacterId): Promise<void> {
	await removeSavedCharacterEntry(id);
	const next = { ...entries };
	delete next[id];
	entries = next;
}
