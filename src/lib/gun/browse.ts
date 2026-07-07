import type { Character } from '$lib/types';
import { getPreferences } from '$lib/state/preferences.svelte';
import { getCharacter } from './characters';
import { getTagIndex } from './tags';

/** Fetches published, non-deleted characters carrying `tag`, excluding any
 *  that also carry a tag the user has blocked (see spec: Browse). Invalid or
 *  unverifiable documents (see getCharacter/getDocument) are silently
 *  dropped, matching the "never partially trust untrusted peers" rule. */
export async function browseByTag(tag: string): Promise<Character[]> {
	const ids = await getTagIndex(tag);
	const results = await Promise.all(ids.map((id) => getCharacter(id)));
	const blockedTags = getPreferences().blockedTags;

	return results
		.filter((r): r is { ok: true; doc: Character } => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => !c.tags.some((t) => blockedTags.includes(t)));
}
