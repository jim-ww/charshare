import type { Character, CharacterId } from '$lib/types';
import { getMyCharacters } from './characters.svelte';
import { subscribeCharacter } from '$lib/gun/characters';

/** Small lookup cache for characters referenced by id outside "my
 *  characters" (e.g. chatting with someone else's character) — chat UI
 *  needs a name/description to display, not just the raw id. */
let cache = $state<Record<CharacterId, Character>>({});
const subscribed = new Set<CharacterId>();

export function resolveCharacter(id: CharacterId): Character | undefined {
	return getMyCharacters().find((c) => c.id === id) ?? cache[id];
}

/** Subscribes (once per id) rather than doing a single one-shot read — GUN's
 *  local read can momentarily miss data that hasn't synced from a relay yet,
 *  so a plain one-shot get can silently never resolve the character. The
 *  subscription keeps listening and fills in the cache whenever real data
 *  arrives, without an arbitrary delay/retry. */
export function ensureCharacterLoaded(id: CharacterId): void {
	if (resolveCharacter(id) || subscribed.has(id)) return;
	subscribed.add(id);
	subscribeCharacter(id, (result) => {
		if (result.ok) cache = { ...cache, [id]: result.doc };
	});
}
