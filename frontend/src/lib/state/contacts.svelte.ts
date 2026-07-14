import type { PubKey } from '$lib/types';
import { getCurrentUser, getKeyring, requireAccount } from '$lib/state/auth.svelte';
import {
	followAuthor as nostrFollowAuthor,
	getContactList,
	unfollowAuthor as nostrUnfollowAuthor
} from '$lib/nostr/contacts';

/** Local reactive cache of the current user's own published NIP-02 follow
 *  list, keyed by pubkey for O(1) `isAuthorFollowed` checks. Populated from
 *  the network (see loadFollowedAuthors) rather than derived locally — the
 *  list is a real published event, so another device/tab publishing a
 *  change should be reflected once reloaded. */
let followed = $state<Record<PubKey, boolean>>({});
let loadedFor: PubKey | null = null;

export function isAuthorFollowed(authorPubkey: PubKey): boolean {
	return followed[authorPubkey] ?? false;
}

/** Loads the current user's own follow list from the network into the local
 *  cache. Safe to call repeatedly (e.g. on every relevant page mount) —
 *  it's a no-op once already loaded for the current user this session. */
export async function loadFollowedAuthors(): Promise<void> {
	const me = getCurrentUser();
	if (!me || loadedFor === me) return;
	loadedFor = me;
	const list = await getContactList(me);
	followed = Object.fromEntries(list.map((pub) => [pub, true]));
}

export async function followAuthor(target: PubKey): Promise<void> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	followed = { ...followed, [target]: true };
	await nostrFollowAuthor(target, keyring);
}

export async function unfollowAuthor(target: PubKey): Promise<void> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	followed = { ...followed, [target]: false };
	await nostrUnfollowAuthor(target, keyring);
}

/** Test-only escape hatch: resets the module's local cache/load state
 *  between tests. */
export function __resetContactsForTests(): void {
	followed = {};
	loadedFor = null;
}
