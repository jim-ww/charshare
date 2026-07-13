/** Splits a name into lowercase word tokens for indexing/searching.
 *  Punctuation is dropped rather than treated as part of a token, so
 *  "Aria's" and "Aria" share a token. Used both when building a character's
 *  `n` tags at publish time (one per token) and when building
 *  `browseByName`'s per-token `#n` relay filters. */
export function tokenizeName(name: string): string[] {
	const tokens = name
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length > 0);
	return Array.from(new Set(tokens));
}
