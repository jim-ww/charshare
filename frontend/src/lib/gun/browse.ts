import type { Character } from '$lib/types';
import { getPreferences } from '$lib/state/preferences.svelte';
import { getCharacter, listCharacterIdsByAuthor } from './characters';
import { getTagIndex, getTagIndexBucket, NETWORK_INDEX_TAG } from './tags';
import { getReadWindowSize, type IndexEntry } from './signedIndex';
import { searchByName } from './names';
import { getUsernameClaim } from './usernames';
import { getForkIndex } from './forks';

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

export type BrowseSortOrder = 'desc' | 'asc';

/** Opaque resume point for {@link browseNetworkPage}: the sort order this
 *  walk was started with, which bucket to read next (an offset into
 *  signedIndex.ts's read window — 0 is the current month, walked forward
 *  for `desc`, or the oldest month in the window (see
 *  signedIndex.ts:getReadWindowSize), walked backward — for `asc`), and any
 *  already-sorted pointer entries left over from a batch that didn't wholly
 *  fit in the previous page — not yet resolved into full `Character`
 *  documents (see {@link browseNetworkPage}). `null` means fully exhausted. */
export interface BrowseCursor {
	order: BrowseSortOrder;
	bucketIndex: number;
	leftover: IndexEntry[];
}

/** How many buckets to read per round — a middle ground between reading one
 *  bucket at a time (cheapest common case, but a stretch of N consecutive
 *  empty months costs N sequential ~1s enumeration waits — measured in
 *  practice via browse.test.ts, `asc` order especially always starts from
 *  the empty far edge of the window for a young/low-activity network) and
 *  reading the whole window at once (bounds worst case to one wait, but
 *  pays that cost on every single browse load even when page 1 only needed
 *  the first bucket). Batching bounds the worst case to
 *  `getReadWindowSize() / BUCKET_BATCH_SIZE` rounds while keeping the common
 *  case (recent activity in the first bucket) down to one round. There's no
 *  artificial cap on the window itself (see signedIndex.ts:GENESIS_MONTH) —
 *  a character never silently stops surfacing just because it's old. */
const BUCKET_BATCH_SIZE = 4;

/** Pages through the network feed sorted by `created_at`, reading index
 *  buckets (monthly — see signedIndex.ts) a batch at a time (see
 *  {@link BUCKET_BATCH_SIZE}) and stopping as soon as a page's worth of
 *  characters is filled, instead of eagerly reading every bucket in the
 *  window on every call. Sorting happens on the pointer entries themselves —
 *  `created_at` is denormalized onto each signed pointer (see
 *  signedIndex.ts:IndexEntry) specifically so a batch, even one spanning a
 *  bucket with far more entries than one page needs, can be sorted and
 *  sliced to exactly `pageSize` *before* paying the expensive part
 *  (resolveIndex: fetching + signature-verifying the actual `Character`
 *  documents via getCharacter). Without this, a single popular month's
 *  bucket would force resolving every character published that month just
 *  to show one page — this is what keeps the per-page cost bounded by
 *  `pageSize` regardless of how large any individual bucket grows.
 *
 *  `desc` walks newest-month-first, `asc` walks oldest-month-first from the
 *  edge of the read window.
 *
 *  Pass the previous call's returned cursor to continue (its own `order`
 *  takes precedence over the `order` argument, which only matters for
 *  starting a fresh walk); pass `null` to start one. Returns a `null`
 *  cursor once every bucket back to genesis (see
 *  signedIndex.ts:getReadWindowSize) is exhausted. */
export async function browseNetworkPage(
	cursor: BrowseCursor | null,
	pageSize: number,
	order: BrowseSortOrder = 'desc'
): Promise<{ characters: Character[]; cursor: BrowseCursor | null }> {
	const effectiveOrder = cursor?.order ?? order;
	const step = effectiveOrder === 'desc' ? 1 : -1;
	const windowSize = getReadWindowSize();
	let bucketIndex = cursor?.bucketIndex ?? (effectiveOrder === 'desc' ? 0 : windowSize - 1);
	let pool = cursor?.leftover ?? [];
	const characters: Character[] = [];

	while (characters.length < pageSize) {
		if (pool.length === 0) {
			if (bucketIndex < 0 || bucketIndex >= windowSize) return { characters, cursor: null };
			const batchIndexes: number[] = [];
			for (let i = 0; i < BUCKET_BATCH_SIZE && bucketIndex >= 0 && bucketIndex < windowSize; i++) {
				batchIndexes.push(bucketIndex);
				bucketIndex += step;
			}
			const batches = await Promise.all(
				batchIndexes.map((i) => getTagIndexBucket(NETWORK_INDEX_TAG, i))
			);
			const entries = batches.flatMap((b) => b ?? []);
			pool = entries.sort((a, b) =>
				effectiveOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
			);
			if (pool.length === 0) continue;
		}
		const take = pageSize - characters.length;
		const slice = pool.slice(0, take);
		const resolved = await resolveIndex(slice.map((entry) => entry.docId));
		// Preserve the pointer-sorted order — resolveIndex's own filtering
		// (blocked/deleted) can drop entries but never reorders what's left.
		const byId = new Map(resolved.map((c) => [c.id, c]));
		for (const entry of slice) {
			const character = byId.get(entry.docId);
			if (character) characters.push(character);
		}
		pool = pool.slice(take);
	}

	return { characters, cursor: { order: effectiveOrder, bucketIndex, leftover: pool } };
}

/** Fetches published characters whose name matches one of `query`'s word
 *  tokens (see names.ts) — a network-wide name search, not limited to
 *  characters already fetched into some other in-memory result set. */
export async function browseByName(query: string): Promise<Character[]> {
	const ids = await searchByName(query);
	return resolveIndex(ids);
}

/** Fetches published characters forked from `id` — the "remixes of this
 *  character" list (see gun/forks.ts). Only ever contains forks their author
 *  chose to publish; a local-only fork draft never shows up here. */
export async function browseForksOf(id: string): Promise<Character[]> {
	const ids = await getForkIndex(id);
	return resolveIndex(ids);
}

/** Fetches published characters authored by `identifier`, which may be either
 *  a claimed username (see usernames.ts) or a raw author pubkey — the "@name"
 *  / "@pubkey" search syntax. A targeted per-author lookup (see
 *  characters.ts:listCharacterIdsByAuthor) rather than filtering the whole
 *  network feed client-side. */
export async function browseByAuthor(identifier: string): Promise<Character[]> {
	const trimmed = identifier.trim();
	if (!trimmed) return [];
	const claim = await getUsernameClaim(trimmed);
	const authorPub = claim.ok && !claim.doc.deleted ? claim.doc.authorPub : trimmed;
	const ids = await listCharacterIdsByAuthor(authorPub);
	return resolveIndex(ids);
}
