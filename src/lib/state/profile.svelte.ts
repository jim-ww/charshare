import { browser } from '$app/environment';
import type { User } from '$lib/types';
import { getCurrentUser, initAuth } from './auth.svelte';
import { getProfile, publishProfile } from '$lib/gun/users';

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
 *  profile yet just means a new/unpublished user, not an error. Safe to call
 *  multiple times; the underlying load only happens once. */
export function initProfile(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await initAuth();
			const pubkey = getCurrentUser();
			if (pubkey) {
				const result = await getProfile(pubkey);
				if (result.ok) profile = result.doc;
			}
			ready = true;
		})();
	}
	return initPromise;
}

export async function saveProfile(fields: { username: string; description: string }): Promise<void> {
	profile = await publishProfile(fields);
}
