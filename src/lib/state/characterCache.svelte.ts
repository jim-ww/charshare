import type { Character, CharacterId } from '$lib/types';
import { getMyCharacters } from './characters.svelte';
import { getCharacter } from '$lib/gun/characters';

/** Small lookup cache for characters referenced by id outside "my
 *  characters" (e.g. chatting with someone else's character) — chat UI
 *  needs a name/description to display, not just the raw id. */
let cache = $state<Record<CharacterId, Character>>({});

export function resolveCharacter(id: CharacterId): Character | undefined {
	return getMyCharacters().find((c) => c.id === id) ?? cache[id];
}

export async function ensureCharacterLoaded(id: CharacterId): Promise<void> {
	if (resolveCharacter(id)) return;
	const result = await getCharacter(id);
	if (result.ok) cache = { ...cache, [id]: result.doc };
}
