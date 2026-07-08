import type { Character } from '$lib/types';
import { getPreferences } from '$lib/state/preferences.svelte';
import { getCharacter } from './characters';
import { getTagIndex, NETWORK_INDEX_TAG } from './tags';
import { searchByName } from './names';
import { getUsernameClaim } from './usernames';

/** Resolves a tag index to published, non-deleted characters, excluding any
 *  that also carry a tag the user has blocked (see spec: Browse). Invalid or
 *  unverifiable documents (see getCharacter/getDocument) are silently
 *  dropped, matching the "never partially trust untrusted peers" rule. */
async function resolveIndex(ids: string[]): Promise<Character[]> {
	const results = await Promise.all(ids.map((id) => getCharacter(id)));
	const { blockedTags, blockedAuthors } = getPreferences();

	return results
		.filter((r): r is { ok: true; doc: Character } => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => !c.tags.some((t) => blockedTags.includes(t)))
		.filter((c) => !blockedAuthors.includes(c.author));
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

/** Fetches published characters whose name matches one of `query`'s word
 *  tokens (see names.ts) — a network-wide name search, not limited to
 *  characters already fetched into some other in-memory result set. */
export async function browseByName(query: string): Promise<Character[]> {
	const ids = await searchByName(query);
	return resolveIndex(ids);
}

/** Fetches published characters authored by `identifier`, which may be either
 *  a claimed username (see usernames.ts) or a raw author pubkey — the "@name"
 *  / "@pubkey" search syntax. There's no per-author character index yet, so
 *  this filters the full network feed rather than a targeted lookup; fine at
 *  today's scale, and it stays correct (just not fast) if that ever changes. */
export async function browseByAuthor(identifier: string): Promise<Character[]> {
	const trimmed = identifier.trim();
	if (!trimmed) return [];
	const claim = await getUsernameClaim(trimmed);
	const authorPub = claim.ok && !claim.doc.deleted ? claim.doc.authorPub : trimmed;
	const all = await browseNetwork();
	return all.filter((c) => c.author === authorPub);
}
