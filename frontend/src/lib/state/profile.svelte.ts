import { browser } from '$app/environment';
import type { User } from '$lib/types';
import { getCurrentUser, initAuth, isAccountRegistered, markRegistered } from './auth.svelte';
import { getProfile, publishProfile, subscribeProfileWithRetry } from '$lib/nostr/profile';
import { getUsernameClaim } from '$lib/nostr/usernames';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from '$lib/db/profile';
import { notify } from './notifications.svelte';
import { openSettings } from './settingsModal.svelte';

let profile = $state<User | null>(null);
let ready = $state(false);
// Whether the live network subscription has confirmed this profile at least
// once — separate from `ready`, which flips as soon as a local cache copy
// is available so the UI doesn't sit on "Loading…" for a round-trip. This
// lets Account settings show "Syncing…" vs "Synced" instead of implying a
// cached copy is already confirmed current.
let synced = $state(false);
let initPromise: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

export function getMyProfile(): User | null {
	return profile;
}

export function isProfileReady(): boolean {
	return ready;
}

export function isProfileSynced(): boolean {
	return synced;
}

function subscribeToOwnProfile(): void {
	unsubscribe?.();
	unsubscribe = null;
	const pubkey = getCurrentUser();
	if (!pubkey) return;
	unsubscribe = subscribeProfileWithRetry(
		pubkey,
		(result) => {
			if (result.ok) {
				profile = result.doc;
				synced = true;
				void saveCachedProfile(result.doc);
			}
		},
		// Not `profile !== null` — a cached copy already makes that true, which
		// would stop the retry-poke (see event.ts:subscribeEventsWithRetry) before a
		// relay ever actually answers, leaving `synced` stuck false forever.
		() => synced
	);
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
 *  don't flash blank while relays reconnect. */
export function initProfile(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			await initAuth();
			if (isAccountRegistered()) {
				const pubkey = getCurrentUser();
				if (pubkey) {
					const cached = await loadCachedProfile();
					if (cached && cached.id === pubkey) {
						profile = cached;
						// A cached profile is enough to render Account settings — don't
						// make the UI sit on "Loading…" for a network round-trip just to
						// redisplay what's already on disk. The subscription below still
						// runs and keeps `profile` current in the background.
						ready = true;
					}
					// Bounded lookup (see nostr/event.ts:queryEvents's own timeout) —
					// deliberately not subscribeProfileWithRetry here, since its
					// resolution only fires from an actually-received event and would
					// hang this await forever if the connected relay has simply never
					// seen this profile at all (new relay / relay switch between
					// sessions — same scenario characters.svelte.ts's resyncMissing
					// covers for characters).
					const result = await getProfile(pubkey);
					if (result.ok) {
						profile = result.doc;
						synced = true;
						void saveCachedProfile(result.doc);
					} else if (cached && cached.id === pubkey && !cached.deleted) {
						// The relay has no copy of our own profile, but we have our own
						// last-known fields — republish rather than silently vanishing
						// from the network under everyone else's eyes.
						try {
							const republished = await publishProfile({
								username: cached.username,
								description: cached.description,
								...(cached.image_url ? { image_url: cached.image_url } : {})
							});
							profile = republished;
							synced = true;
							void saveCachedProfile(republished);
						} catch {
							// Either the relay write itself failed (e.g. still not
							// connected), or publishProfile's own reclaim of our username
							// hit a genuine conflict (someone else already holds it) —
							// either way, swallow it here rather than throwing out of
							// init. A real conflict is still caught and resolved right
							// after, by checkUsernameConflict() (see +layout.svelte),
							// which re-reads our cached username against the network's
							// current claim independently of whether this republish
							// attempt succeeded.
						}
					}
					subscribeToOwnProfile();
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
	// A successful publish IS a network round-trip confirming this doc — no
	// need to wait on the background subscription to independently rediscover
	// what we just published ourselves. Without this, a rename triggered by
	// checkUsernameConflict() (or any other saveProfile call) leaves the
	// Account settings "Syncing…" badge waiting on that subscription forever
	// if it happens to be reading from relays that don't (yet) have the
	// republished event.
	synced = true;
	await saveCachedProfile(doc);
}

let usernameCheckDone = false;
const MAX_RENAME_CANDIDATES = 8;
const MAX_PUBLISH_ATTEMPTS = 3;

/** Picks a username derived from `base` that isn't currently claimed by
 *  anyone — used to recover from a lost username race (see
 *  checkUsernameConflict) without prompting the user mid-startup. Returns
 *  null if it can't find one within a bounded number of attempts (left for
 *  the user to resolve manually in Account settings). */
async function pickAvailableUsername(base: string): Promise<string | null> {
	for (let i = 0; i < MAX_RENAME_CANDIDATES; i++) {
		const suffix = Math.floor(1000 + Math.random() * 9000);
		const candidate = `${base}${suffix}`;
		const existing = await getUsernameClaim(candidate);
		if (!existing.ok || existing.doc.deleted) return candidate;
	}
	return null;
}

/** Detects a lost username race: Nostr has no server-side arbiter, so two
 *  clients can each briefly believe they've claimed the same username before
 *  the network converges (see spec: username claims are first-come-wins,
 *  enforced client-side only). If our own published profile's username turns
 *  out to be claimed by a different pubkey by the time we check, silently
 *  mint a fresh unique one and republish under it, then surface a sticky
 *  notification so the user knows what happened and can pick a preferred
 *  name themselves. Runs at most once per app session — call after
 *  initProfile() has resolved. */
export async function checkUsernameConflict(): Promise<void> {
	if (!browser || usernameCheckDone) return;
	usernameCheckDone = true;
	if (!isAccountRegistered()) return;

	const current = profile;
	const pubkey = getCurrentUser();
	if (!current || !pubkey || !current.username) return;

	const claim = await getUsernameClaim(current.username);
	if (!claim.ok || claim.doc.deleted) return; // unclaimed/tombstoned — no conflict
	if (claim.doc.authorPub === pubkey) return; // we hold it — no conflict

	const previousUsername = current.username;
	for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
		const candidate = await pickAvailableUsername(previousUsername);
		if (!candidate) return; // give up quietly; user can rename manually later
		try {
			await saveProfile({
				username: candidate,
				description: current.description,
				...(current.image_url ? { image_url: current.image_url } : {})
			});
			notify(
				`Your username "@${previousUsername}" is now used by another account, so it was automatically changed to "@${candidate}". Review it in Account settings.`,
				{
					kind: 'warning',
					duration: 0,
					action: { label: 'Open Account settings', onClick: () => openSettings('account') }
				}
			);
			return;
		} catch {
			// Someone claimed `candidate` between our availability check and
			// publishing (rare TOCTOU race) — try another candidate.
		}
	}
}

/** Called after switching this browser to an imported account (backup
 *  restore) — treats it as registered under the new identity and (re)loads
 *  its profile from the network. `cachedFields`, if the backup carried them,
 *  is shown immediately so the profile isn't blank while waiting on relays. */
export async function loadProfileForSwitchedAccount(cachedFields?: {
	username: string;
	description: string;
	image_url?: string;
}): Promise<void> {
	profile = null;
	synced = false;
	const pubkey = getCurrentUser();
	if (cachedFields && pubkey) {
		const placeholder: User = {
			id: pubkey,
			username: cachedFields.username,
			description: cachedFields.description,
			...(cachedFields.image_url ? { image_url: cachedFields.image_url } : {}),
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
	synced = false;
	void clearCachedProfile();
}
