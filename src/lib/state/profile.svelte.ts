import { browser } from '$app/environment';
import type { User } from '$lib/types';
import { getCurrentUser, initAuth } from './auth.svelte';
import { publishProfile, subscribeProfile } from '$lib/gun/users';

let profile = $state<User | null>(null);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getMyProfile(): User | null {
	return profile;
}

export function isProfileReady(): boolean {
	return ready;
}

/** Loads the current user's own published profile, if any — no published
 *  profile yet just means a new/unpublished user, not an error. Subscribes
 *  rather than doing a one-shot read: GUN's `.once` can resolve before the
 *  profile has synced in from storage/peers, which would otherwise leave
 *  `profile` stuck null even though a profile exists. Safe to call multiple
 *  times; the underlying subscription only happens once. */
export function initProfile(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await initAuth();
			const pubkey = getCurrentUser();
			if (pubkey) {
				await new Promise<void>((resolve) => {
					let settled = false;
					subscribeProfile(pubkey, (result) => {
						if (result.ok) profile = result.doc;
						if (!settled) {
							settled = true;
							resolve();
						}
					});
				});
			}
			ready = true;
		})();
	}
	return initPromise;
}

export async function saveProfile(fields: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	profile = await publishProfile(fields);
}
