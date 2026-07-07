import { get, set } from 'idb-keyval';
import type { CharacterId } from '$lib/types';

/** Local index of character ids this browser has created or forked — GUN has
 *  no query engine (see spec: Tag indexing), so "my characters" can't be
 *  discovered from the network alone. Just ids; the documents themselves
 *  live in GUN and are fetched by id. */
const STORE_KEY = 'charshare:my-character-ids';

export async function loadMyCharacterIds(): Promise<CharacterId[]> {
	return (await get<CharacterId[]>(STORE_KEY)) ?? [];
}

export async function addMyCharacterId(id: CharacterId): Promise<void> {
	const ids = await loadMyCharacterIds();
	if (!ids.includes(id)) await set(STORE_KEY, [...ids, id]);
}
