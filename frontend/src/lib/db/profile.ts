import { get, set, del } from 'idb-keyval';
import type { User } from '$lib/types';

/** Local cache of the current browser's own published profile, so the
 *  username/avatar are available instantly on load instead of waiting on
 *  the relay subscription to resolve. The network copy (see nostr/profile.ts)
 *  remains authoritative — this is only ever overwritten by it. */
const STORE_KEY = 'charshare:own-profile';

export async function loadCachedProfile(): Promise<User | null> {
	return (await get<User>(STORE_KEY)) ?? null;
}

export function saveCachedProfile(profile: User): Promise<void> {
	return set(STORE_KEY, profile);
}

export function clearCachedProfile(): Promise<void> {
	return del(STORE_KEY);
}
