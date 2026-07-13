import { fetchRelayInformation } from 'nostr-tools/nip11';
import type { CharacterId, CommentId, Keyring, PubKey } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents } from './event';
import { getPool } from './pool';
import { DELETE_REQUEST_KIND, REACTION_KIND } from './kinds';
import { characterCoordinate, parseCharacterId } from './characterId';
import { writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

// Reactions need to be visible to anyone browsing the target, not just its
// author, so reads stay on the user's configured relay set (see
// getActiveRelays, matching the "browse everything" case, not an
// author-scoped lookup) — only the like/unlike publish itself resolves the
// current user's own NIP-65 outbox relays (see relayList.ts), same as every
// other publish path.

export type LikeTarget =
	| { type: 'character'; id: CharacterId }
	| { type: 'comment'; id: CommentId; author: PubKey };

/** NIP-25 tags/filter-value identifying `target` — an `a` (addressable
 *  coordinate) for characters since their event id changes on every edit but
 *  their coordinate never does, or an `e` (event id) for comments, which are
 *  immutable single events. */
function targetTags(target: LikeTarget): string[][] {
	if (target.type === 'character') {
		const { author } = parseCharacterId(target.id);
		return [['a', characterCoordinate(target.id)], ['p', author]];
	}
	return [['e', target.id], ['p', target.author]];
}

function targetFilter(target: LikeTarget): { kinds: number[]; '#a'?: string[]; '#e'?: string[] } {
	return target.type === 'character'
		? { kinds: [REACTION_KIND], '#a': [characterCoordinate(target.id)] }
		: { kinds: [REACTION_KIND], '#e': [target.id] };
}

/** Returns the current user's own "+" reaction event id for `target`, if any
 *  — used both to render a "liked" state and to decide whether toggling
 *  should like or unlike. */
export async function findOwnLike(target: LikeTarget, pubkey: PubKey): Promise<string | null> {
	const events = await queryEvents({ ...targetFilter(target), authors: [pubkey] }, getActiveRelays());
	return events.find((e) => e.content === '+')?.id ?? null;
}

/** Likes `target` if the current user hasn't already, or un-likes it (via a
 *  best-effort NIP-09 delete request against their own prior reaction) if
 *  they have. Returns the new liked state. */
export async function toggleLike(target: LikeTarget): Promise<boolean> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await findOwnLike(target, keyring.publicKey);
	if (existing) {
		await publishDeleteRequest(existing, keyring);
		return false;
	}

	const relays = await writeRelaysFor(keyring);
	await publishEvent(
		{ kind: REACTION_KIND, tags: targetTags(target), content: '+', created_at: Math.floor(Date.now() / 1000) },
		keyring,
		relays
	);
	return true;
}

async function publishDeleteRequest(eventId: string, keyring: Keyring): Promise<void> {
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{ kind: DELETE_REQUEST_KIND, tags: [['e', eventId]], content: '', created_at: Math.floor(Date.now() / 1000) },
			keyring,
			relays
		);
	} catch (err) {
		console.warn('[nostr] unlike delete request failed (ignored, best-effort only)', err);
	}
}

/** Per-relay NIP-45 (COUNT) support, cached — checked via the relay's NIP-11
 *  info document (`supported_nips`). Session-scoped only; a relay's declared
 *  capabilities aren't expected to change mid-session. */
const nip45SupportCache = new Map<string, boolean>();

async function relaySupportsNip45(relay: string): Promise<boolean> {
	const cached = nip45SupportCache.get(relay);
	if (cached !== undefined) return cached;
	let supported: boolean;
	try {
		const info = await fetchRelayInformation(relay);
		supported = info.supported_nips?.includes(45) ?? false;
	} catch {
		supported = false;
	}
	nip45SupportCache.set(relay, supported);
	return supported;
}

async function nip45CapableRelays(relays: string[]): Promise<string[]> {
	const flags = await Promise.all(relays.map(relaySupportsNip45));
	return relays.filter((_, i) => flags[i]);
}

/** Whether a like *count* can be shown at all for the given relay set — per
 *  the product decision, a count is only ever shown where the relay serving
 *  it declares NIP-45 support; there is no client-side aggregate-counting
 *  fallback. */
export async function likeCountAvailable(relays: string[] = getActiveRelays()): Promise<boolean> {
	return (await nip45CapableRelays(relays)).length > 0;
}

/** Returns a like count for `target`, or null if no configured relay
 *  advertises NIP-45 support (the UI should hide the count entirely in that
 *  case, not fall back to a client-computed estimate). When multiple
 *  NIP-45-capable relays disagree, the highest count is reported — a relay
 *  that's seen more of the network can only undercount, never overcount. */
export async function getLikeCount(target: LikeTarget, relays: string[] = getActiveRelays()): Promise<number | null> {
	const capable = await nip45CapableRelays(relays);
	if (capable.length === 0) return null;

	const pool = getPool();
	const filter = targetFilter(target);
	const counts = await Promise.all(
		capable.map(async (relay) => {
			try {
				const conn = await pool.ensureRelay(relay);
				return await conn.count([filter], {});
			} catch {
				return null;
			}
		})
	);
	const valid = counts.filter((c): c is number => c !== null);
	if (valid.length === 0) return null;
	return Math.max(...valid);
}
