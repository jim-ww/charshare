import { browser } from '$app/environment';
import type { User } from '$lib/types';
import { getCurrentUser, initAuth, isAccountRegistered, markRegistered } from './auth.svelte';
import { publishProfile, subscribeProfile } from '$lib/gun/users';

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
		if (result.ok) profile = result.doc;
	});
}

/** Loads the current user's own account state at startup. Guests — browsers
 *  that have never registered an account — never touch the network here:
 *  only a registered account's profile is fetched/subscribed, so a random
 *  visitor who never opts in doesn't announce their pubkey to the network
 *  just by opening the app. Safe to call multiple times; the underlying
 *  subscription only happens once. */
export function initProfile(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await initAuth();
			if (isAccountRegistered()) {
				const pubkey = getCurrentUser();
				if (pubkey) {
					await new Promise<void>((resolve) => {
						let settled = false;
						unsubscribe = subscribeProfile(pubkey, (result) => {
							if (result.ok) profile = result.doc;
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
	profile = await publishProfile(fields);
	await markRegistered();
	subscribeToOwnProfile();
}

export async function saveProfile(fields: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	profile = await publishProfile(fields);
}

/** Called after switching this browser to an imported account (backup
 *  restore) — treats it as registered under the new identity and (re)loads
 *  its profile from the network. */
export async function loadProfileForSwitchedAccount(): Promise<void> {
	profile = null;
	await markRegistered();
	subscribeToOwnProfile();
}
