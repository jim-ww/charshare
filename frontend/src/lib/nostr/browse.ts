import { nip19, type Event as NostrEvent } from 'nostr-tools';
import type { Character, CharacterId } from '$lib/types';
import { getActiveRelays, getPreferences } from '$lib/state/preferences.svelte';
import { eventToCharacter, listCharacterIdsByAuthor, getCharacter } from './characters';
import { queryEvents } from './event';
import { CHARACTER_KIND } from './kinds';
import { characterCoordinate } from './characterId';
import { getUsernameClaim } from './usernames';
import { tokenizeName } from './nameTokens';

/** Parses raw character events, dropping anything that fails verification/
 *  schema, is tombstoned, or carries a tag/author the user has blocked (see
 *  spec: Browse) — the same filtering `resolveIndex` used to apply after a
 *  separate index-lookup step, now applied directly to events fetched off a
 *  plain relay filter (no index step needed anymore). */
function parseAndFilter(events: NostrEvent[]): Character[] {
	const { blockedTags, blockedAuthors } = getPreferences();
	const parsed = events.map(eventToCharacter).filter((c): c is Character => c !== null);
	const notDeleted = parsed.filter((c) => !c.deleted);
	const notBlockedTag = notDeleted.filter((c) => !c.tags.some((t) => blockedTags.includes(t)));
	const notBlockedAuthor = notBlockedTag.filter((c) => !blockedAuthors.includes(c.author));
	if (events.length > 0 && notBlockedAuthor.length === 0) {
		console.warn('[nostr] parseAndFilter dropped everything', {
			events: events.length,
			parsed: parsed.length,
			notDeleted: notDeleted.length,
			notBlockedTag: notBlockedTag.length,
			notBlockedAuthor: notBlockedAuthor.length,
			blockedTags,
			blockedAuthors
		});
	}
	return notBlockedAuthor;
}

/** Fetches published characters carrying `tag`. */
export async function browseByTag(tag: string): Promise<Character[]> {
	const events = await queryEvents({ kinds: [CHARACTER_KIND], '#t': [tag] }, getActiveRelays());
	return parseAndFilter(events);
}

/** Fetches published characters whose name matches one of `query`'s word
 *  tokens — a network-wide name search via the `#n` tag (see plan: tag
 *  schema), unioning results across tokens. */
export async function browseByName(query: string): Promise<Character[]> {
	const tokens = tokenizeName(query);
	if (tokens.length === 0) return [];
	const perToken = await Promise.all(
		tokens.map((token) => queryEvents({ kinds: [CHARACTER_KIND], '#n': [token] }, getActiveRelays()))
	);
	const merged = new Map<string, NostrEvent>();
	for (const events of perToken) for (const event of events) merged.set(event.id, event);
	return parseAndFilter([...merged.values()]);
}

/** Fetches published characters forked from `id` — via the `a` tag fork
 *  provenance coordinate (see plan: fork provenance) rather than a separate
 *  fork index. Only ever contains forks their author chose to publish; a
 *  local-only fork draft never shows up here. */
export async function browseForksOf(id: CharacterId): Promise<Character[]> {
	const events = await queryEvents({ kinds: [CHARACTER_KIND], '#a': [characterCoordinate(id)] }, getActiveRelays());
	return parseAndFilter(events);
}

/** Decodes an `npub1...` (NIP-19 bech32) identifier to a hex pubkey — the
 *  format most Nostr clients actually surface for copy/paste, as opposed to
 *  raw hex. Returns the input unchanged if it isn't an npub (a raw hex
 *  pubkey, or something that'll simply fail to resolve as one). */
function decodeIfNpub(identifier: string): string {
	if (!identifier.startsWith('npub1')) return identifier;
	try {
		const decoded = nip19.decode(identifier);
		return decoded.type === 'npub' ? decoded.data : identifier;
	} catch {
		return identifier;
	}
}

/** Fetches published characters authored by `identifier`, which may be a
 *  claimed username, a raw hex author pubkey, or an `npub1...`-encoded one —
 *  the "@name" / "@pubkey" / "@npub" search syntax. A targeted per-author
 *  lookup (relay `authors` filter) rather than filtering the whole network
 *  feed client-side. */
export async function browseByAuthor(identifier: string): Promise<Character[]> {
	const trimmed = identifier.trim();
	if (!trimmed) return [];
	const claim = await getUsernameClaim(trimmed);
	const authorPub = claim.ok && !claim.doc.deleted ? claim.doc.authorPub : decodeIfNpub(trimmed);
	const ids = await listCharacterIdsByAuthor(authorPub);
	const resolved = await Promise.all(ids.map((id) => getCharacter(id)));
	const { blockedTags, blockedAuthors } = getPreferences();
	return resolved
		.filter((r): r is { ok: true; doc: Character } => r.ok)
		.map((r) => r.doc)
		.filter((c) => !c.deleted)
		.filter((c) => !c.tags.some((t) => blockedTags.includes(t)))
		.filter((c) => !blockedAuthors.includes(c.author));
}

export type BrowseSortOrder = 'desc' | 'asc';

/** Opaque resume point for {@link browseNetworkPage}. `pool` holds already-
 *  fetched, already-sorted-by-`published_at` characters not yet returned to
 *  the caller; `nextUntil` is the relay-native (`created_at`-based) cursor
 *  for fetching more, or `null` once the relay side is exhausted. `null`
 *  overall means fully exhausted (nothing left in `pool`, nothing left
 *  upstream). */
export interface BrowseCursor {
	order: BrowseSortOrder;
	pool: Character[];
	nextUntil: number | null;
}

/** How many character events to fetch per relay round-trip. Relays sort by
 *  their own event `created_at` (the latest-revision timestamp for these
 *  NIP-33 addressable events), not by `published_at` (the character's true
 *  original creation time) — over-fetching a batch and re-sorting it by
 *  `published_at` client-side (see below) is what keeps "sort by newest
 *  published" correct despite that mismatch, without requiring a relay-side
 *  sort it can't actually offer. */
const FETCH_BATCH_SIZE = 40;

/** Safety cap on how many batches `asc` order will fetch to build its
 *  one-shot fully-sorted pool (see below) — bounds worst-case cost instead of
 *  scanning an unbounded history. */
const MAX_ASC_BATCHES = 50;

async function fetchBatch(until: number | undefined): Promise<{ characters: Character[]; oldestCreatedAt: number | null; count: number }> {
	const events = await queryEvents(
		{ kinds: [CHARACTER_KIND], limit: FETCH_BATCH_SIZE, ...(until !== undefined ? { until } : {}) },
		getActiveRelays()
	);
	const oldestCreatedAt = events.length > 0 ? Math.min(...events.map((e) => e.created_at)) : null;
	return { characters: parseAndFilter(events), oldestCreatedAt, count: events.length };
}

function sortByPublishedAt(characters: Character[], order: BrowseSortOrder): Character[] {
	return [...characters].sort((a, b) => (order === 'desc' ? b.created_at - a.created_at : a.created_at - b.created_at));
}

/** Pages through the network feed sorted by `published_at` (true original
 *  creation time). `desc` walks the relay-native `until` cursor forward,
 *  over-fetching and re-sorting each batch (see FETCH_BATCH_SIZE) — cheap,
 *  and the common/default case. `asc` is an accepted less-optimized path
 *  (see plan): rather than true streaming pagination, the first call fetches
 *  the whole history up to MAX_ASC_BATCHES rounds, sorts it once, and later
 *  calls just slice through the resulting in-memory pool.
 *
 *  Pass the previous call's returned cursor to continue; pass `null` to
 *  start fresh. Returns a `null` cursor once fully exhausted. */
export async function browseNetworkPage(
	cursor: BrowseCursor | null,
	pageSize: number,
	order: BrowseSortOrder = 'desc'
): Promise<{ characters: Character[]; cursor: BrowseCursor | null }> {
	const effectiveOrder = cursor?.order ?? order;
	let pool = cursor?.pool ?? [];
	let nextUntil = cursor ? cursor.nextUntil : (undefined as number | null | undefined);

	if (effectiveOrder === 'asc' && cursor === null) {
		let until: number | undefined;
		let all: Character[] = [];
		for (let round = 0; round < MAX_ASC_BATCHES; round++) {
			const batch = await fetchBatch(until);
			all = all.concat(batch.characters);
			if (batch.count < FETCH_BATCH_SIZE || batch.oldestCreatedAt === null) break;
			until = batch.oldestCreatedAt - 1;
		}
		pool = sortByPublishedAt(all, 'asc');
		nextUntil = null;
	} else if (effectiveOrder === 'desc') {
		while (pool.length < pageSize && nextUntil !== null) {
			const batch = await fetchBatch(nextUntil === undefined ? undefined : nextUntil);
			pool = sortByPublishedAt(pool.concat(batch.characters), 'desc');
			if (batch.count < FETCH_BATCH_SIZE || batch.oldestCreatedAt === null) {
				nextUntil = null;
			} else {
				nextUntil = batch.oldestCreatedAt - 1;
			}
		}
	}

	const characters = pool.slice(0, pageSize);
	const remaining = pool.slice(pageSize);
	const exhausted = remaining.length === 0 && (nextUntil === null || nextUntil === undefined);
	return {
		characters,
		cursor: exhausted ? null : { order: effectiveOrder, pool: remaining, nextUntil: nextUntil ?? null }
	};
}
