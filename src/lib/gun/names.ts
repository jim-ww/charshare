import type { CharacterId, Keyring } from '$lib/types';
import { createSignedPointerIndex } from './signedIndex';

const nameIndex = createSignedPointerIndex('names');

/** Splits a name into lowercase word tokens for indexing/searching — the
 *  index only supports exact-token lookups (see signedIndex.ts), not
 *  substring matching, so "Aria the Brave" is indexed under "aria", "the",
 *  and "brave". Punctuation is dropped rather than treated as part of a
 *  token, so "Aria's" and "Aria" share a token. */
export function tokenizeName(name: string): string[] {
	const tokens = name
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length > 0);
	return Array.from(new Set(tokens));
}

/** Adds a signed pointer for `charId` under every word token in `name`. */
export async function addToNameIndex(name: string, charId: CharacterId, keyring: Keyring): Promise<void> {
	await Promise.all(tokenizeName(name).map((token) => nameIndex.addToIndex(token, charId, keyring)));
}

/** Searches published characters by name: tokenizes `query` and returns the
 *  union of character ids indexed under any of its tokens. Only an exact
 *  first-word match is required to surface a result — callers wanting a
 *  tighter match (e.g. all query tokens present) filter the resolved
 *  characters' actual names further, same as the existing local-search UI
 *  already does for characters it already has in memory. */
export async function searchByName(query: string): Promise<CharacterId[]> {
	const tokens = tokenizeName(query);
	if (tokens.length === 0) return [];
	const perToken = await Promise.all(tokens.map((token) => nameIndex.getIndex(token)));
	return Array.from(new Set(perToken.flat()));
}
