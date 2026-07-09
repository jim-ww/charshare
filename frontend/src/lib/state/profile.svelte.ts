import { browser } from '$app/environment';
import type { User } from '$lib/types';
import { getCurrentUser, initAuth, isAccountRegistered, markRegistered } from './auth.svelte';
import { publishProfile, subscribeProfile } from '$lib/gun/users';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from '$lib/db/profile';

let profile = $state<User | null>(null);
let ready = $state(false);
let initPromise: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

export function getMyProfile(): User | null {
	return profile;
}

export function isProfileReady(): boolean {
	return ready;
}

function subscribeToOwnProfile(): void {
	unsubscribe?.();
	unsubscribe = null;
	const pubkey = getCurrentUser();
	if (!pubkey) return;
	unsubscribe = subscribeProfile(pubkey, (result) => {
		if (result.ok) {
			profile = result.doc;
			void saveCachedProfile(result.doc);
		}
	});
}

/** Loads the current user's own account state at startup. Guests — browsers
 *  that have never registered an account — never touch the network here:
 *  only a registered account's profile is fetched/subscribed, so a random
 *  visitor who never opts in doesn't announce their pubkey to the network
 *  just by opening the app. Safe to call multiple times; the underlying
 *  subscription only happens once.
 *
 *  Shows the last-known profile from the local cache immediately, before the
 *  network subscription resolves, so a returning user's own username/avatar
 *  don't flash blank while GUN reconnects. */
export function initProfile(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await initAuth();
			if (isAccountRegistered()) {
				const pubkey = getCurrentUser();
				if (pubkey) {
					const cached = await loadCachedProfile();
					if (cached && cached.id === pubkey) profile = cached;
					await new Promise<void>((resolve) => {
						let settled = false;
						unsubscribe = subscribeProfile(pubkey, (result) => {
							if (result.ok) {
								profile = result.doc;
								void saveCachedProfile(result.doc);
							}
							if (!settled) {
								settled = true;
								resolve();
							}
						});
					});
				}
			}
			ready = true;
		})();
	}
	return initPromise;
}

/** Publishes an initial profile and flips this browser from guest to a
 *  registered account — from here on, publishing characters and posting
 *  comments is allowed, and the profile stays subscribed for live updates. */
export async function registerAccount(fields: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	const doc = await publishProfile(fields);
	profile = doc;
	await saveCachedProfile(doc);
	await markRegistered();
	subscribeToOwnProfile();
}

export async function saveProfile(fields: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	const doc = await publishProfile(fields);
	profile = doc;
	await saveCachedProfile(doc);
}

/** Called after switching this browser to an imported account (backup
 *  restore) — treats it as registered under the new identity and (re)loads
 *  its profile from the network. `cachedFields`, if the backup carried them,
 *  is shown immediately so the profile isn't blank while waiting on GUN. */
export async function loadProfileForSwitchedAccount(cachedFields?: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	profile = null;
	const pubkey = getCurrentUser();
	if (cachedFields && pubkey) {
		const placeholder: User = {
			id: pubkey,
			username: cachedFields.username,
			description: cachedFields.description,
			...(cachedFields.image_url ? { image_url: cachedFields.image_url } : {}),
			signature: '',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted: false,
			deleted_at: null
		};
		profile = placeholder;
		void saveCachedProfile(placeholder);
	}
	await markRegistered();
	subscribeToOwnProfile();
}

/** Called after logging out — drops the subscription to the old account's
 *  profile since the browser now holds a fresh, unregistered guest identity. */
export function clearProfileForLogout(): void {
	unsubscribe?.();
	unsubscribe = null;
	profile = null;
	void clearCachedProfile();
}
