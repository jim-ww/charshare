import type { Character } from "$lib/types";
import {
	browseByAuthor,
	browseByName,
	browseByTag,
	browseNetwork,
} from "$lib/gun/browse";

let query = $state("");
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

export function getRemoteResults(): Character[] {
	return remoteResults;
}

export function getNetworkResults(): Character[] {
	return networkResults;
}

export async function refreshNetwork(): Promise<void> {
	networkResults = await browseNetwork();
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

export function addTagToQuery(tag: string): void {
	const trimmed = query.trim();
	if (!trimmed) {
		query = tag;
		return;
	}
	const words = trimmed.split(/\s+/);
	if (words.includes(tag)) {
		return;
	}
	query = `${trimmed} ${tag}`;
}

export async function runSearch(): Promise<void> {
	const q = query.trim();
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
		if (q.startsWith("@")) {
			remoteResults = await browseByAuthor(q.slice(1));
		} else {
			const words = queryWords(q);
			const perWord = await Promise.all(
				words.map((w) => Promise.all([browseByName(w), browseByTag(w)])),
			);
			const merged = new Map<string, Character>();
			for (const [byName, byTag] of perWord) {
				for (const c of [...byName, ...byTag]) merged.set(c.id, c);
			}
			remoteResults = [...merged.values()].filter((c) => matchesQuery(c, q));
		}
		searchedQuery = q;
	} finally {
		searching = false;
	}
}
