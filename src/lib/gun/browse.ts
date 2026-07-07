import type { Character } from '$lib/types';
import { getPreferences } from '$lib/state/preferences.svelte';
import { getCharacter } from './characters';
import { getTagIndex, NETWORK_INDEX_TAG } from './tags';

/** Resolves a tag index to published, non-deleted characters, excluding any
 *  that also carry a tag the user has blocked (see spec: Browse). Invalid or
 *  unverifiable documents (see getCharacter/getDocument) are silently
 *  dropped, matching the "never partially trust untrusted peers" rule. */
async function resolveIndex(ids: string[]): Promise<Character[]> {
	const results = await Promise.all(ids.map((id) => getCharacter(id)));
	const blockedTags = getPreferences().blockedTags;

	return results
		.filter((r): r is { ok: true; doc: Character } => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => !c.tags.some((t) => blockedTags.includes(t)));
}

/** Fetches published characters carrying `tag`. */
export async function browseByTag(tag: string): Promise<Character[]> {
	const ids = await getTagIndex(tag);
	return resolveIndex(ids);
}

/** Fetches every published character on the network, regardless of tag —
 *  used to populate a default feed instead of requiring the viewer to already
 *  know one of a character's tags (see spec: Browse). */
export async function browseNetwork(): Promise<Character[]> {
	const ids = await getTagIndex(NETWORK_INDEX_TAG);
	return resolveIndex(ids);
}
