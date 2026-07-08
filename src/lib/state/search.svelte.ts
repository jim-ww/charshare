import type { Character } from "$lib/types";
import { browseByAuthor, browseByName, browseByTag } from "$lib/gun/browse";

let query = $state("");
let remoteResults = $state<Character[]>([]);
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

export function isSearching(): boolean {
	return searching;
}

export function getSearchedQuery(): string {
	return searchedQuery;
}

export function addTagToQuery(tag: string): void {
	query = query.trim() ? `${query.trim()} ${tag}` : tag;
}

export async function runSearch(): Promise<void> {
	const q = query.trim();
	if (!q) {
		remoteResults = [];
		searchedQuery = "";
		return;
	}
	searching = true;
	try {
		if (q.startsWith("@")) {
			remoteResults = await browseByAuthor(q.slice(1));
		} else {
			const [byName, byTag] = await Promise.all([
				browseByName(q),
				browseByTag(q),
			]);
			const merged = new Map(
				[...byName, ...byTag].map((c) => [c.id, c]),
			);
			remoteResults = [...merged.values()];
		}
		searchedQuery = q;
	} finally {
		searching = false;
	}
}
