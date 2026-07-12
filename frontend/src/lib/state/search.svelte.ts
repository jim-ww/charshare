import type { Character } from "$lib/types";
import {
	browseByAuthor,
	browseByName,
	browseByTag,
	browseForksOf,
	browseNetwork,
} from "$lib/gun/browse";

let query = $state("");
// Tags picked via the tag checkboxes — kept separate from the free-text
// `query` so selecting a tag never clutters the visible search box; they're
// folded back in (see effectiveQuery) wherever matching/searching happens.
let selectedTags = $state<Set<string>>(new Set());
let remoteResults = $state<Character[]>([]);
let networkResults = $state<Character[]>([]);
let searching = $state(false);
let searchedQuery = $state("");

export function getSearchQuery(): string {
	return query;
}

export function setSearchQuery(value: string): void {
	query = value;
}

export function getSelectedTags(): Set<string> {
	return selectedTags;
}

export function toggleTag(tag: string): void {
	const next = new Set(selectedTags);
	if (next.has(tag)) next.delete(tag);
	else next.add(tag);
	selectedTags = next;
}

/** Replaces the whole selected-tags set — used to restore it from the `tags`
 *  URL param (see routes/characters/+page.svelte). */
export function setSelectedTags(tags: Set<string>): void {
	selectedTags = tags;
}

/** The query actually used for matching/search, folding the selected tags in
 *  ahead of any free-text words — same shape `matchesQuery`/`browseByTag`
 *  already expect, just assembled without ever touching the visible input. */
export function effectiveQuery(): string {
	return [...selectedTags, ...queryWords(query)].join(" ");
}

export function getRemoteResults(): Character[] {
	return remoteResults;
}

export function getNetworkResults(): Character[] {
	return networkResults;
}

// A cold GUN client can have its WebSocket connected (see gunPeerReady) but
// still not have synced the tag index data from the relay yet — the first
// browseNetwork() of a session can come back empty even though the network
// isn't actually empty. Retrying a couple times with a growing delay picks
// up the data once it arrives, without the user having to notice and press
// search themselves to force a second fetch.
const NETWORK_RETRY_DELAYS_MS = [1500, 3000];

export async function refreshNetwork(): Promise<void> {
	networkResults = await browseNetwork();
	for (const delay of NETWORK_RETRY_DELAYS_MS) {
		if (networkResults.length > 0) return;
		await new Promise((resolve) => setTimeout(resolve, delay));
		networkResults = await browseNetwork();
	}
}

export function isSearching(): boolean {
	return searching;
}

export function getSearchedQuery(): string {
	return searchedQuery;
}

/** Splits a search query into its individual word tokens. */
export function queryWords(q: string): string[] {
	return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** A character matches a query word if it carries that word as an exact tag,
 *  or if the word appears as part of its name — never plain substring-of-tag,
 *  so "fem" doesn't accidentally match a "female" tag the way it can a name. */
function matchesWord(c: Character, word: string): boolean {
	return (
		c.tags.some((t) => t.toLowerCase() === word) ||
		c.name.toLowerCase().includes(word)
	);
}

/** A character matches a query only if it satisfies every word — tag words
 *  narrow to characters carrying ALL of them (AND, not OR), and any word that
 *  isn't one of the character's tags must instead appear in its name. */
export function matchesQuery(c: Character, q: string): boolean {
	const words = queryWords(q);
	return words.every((w) => matchesWord(c, w));
}

export async function runSearch(): Promise<void> {
	// "@name"/"@pubkey" author search is its own mode — selected tags don't
	// apply to it, so it's checked against the raw free-text query, not
	// effectiveQuery() (which would otherwise push tag words in front of the
	// "@" and break the prefix check).
	const rawQuery = query.trim();
	if (rawQuery.startsWith("@")) {
		searching = true;
		try {
			remoteResults = await browseByAuthor(rawQuery.slice(1));
			searchedQuery = rawQuery;
		} finally {
			searching = false;
		}
		return;
	}

	// "fork:<characterId>" — not something a user types by hand, this is the
	// query the "View forks" link on a character's page builds (see
	// characters/[id]/+page.svelte) since there's no room there to render a
	// whole grid of results. Same "its own mode" treatment as "@": no local
	// text-match equivalent, tags don't apply.
	if (rawQuery.startsWith("fork:")) {
		searching = true;
		try {
			remoteResults = await browseForksOf(rawQuery.slice("fork:".length));
			searchedQuery = rawQuery;
		} finally {
			searching = false;
		}
		return;
	}

	const q = effectiveQuery();
	if (!q) {
		remoteResults = [];
		searchedQuery = "";
		searching = true;
		try {
			await refreshNetwork();
		} finally {
			searching = false;
		}
		return;
	}
	searching = true;
	try {
		const words = queryWords(q);
		const perWord = await Promise.all(
			words.map((w) => Promise.all([browseByName(w), browseByTag(w)])),
		);
		const merged = new Map<string, Character>();
		for (const [byName, byTag] of perWord) {
			for (const c of [...byName, ...byTag]) merged.set(c.id, c);
		}
		remoteResults = [...merged.values()].filter((c) => matchesQuery(c, q));
		searchedQuery = q;
	} finally {
		searching = false;
	}
}
