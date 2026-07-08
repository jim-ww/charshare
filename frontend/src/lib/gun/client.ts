import Gun from 'gun';
import './sea';
import 'gun/lib/rindexed';
import type { IGunChain, IGunInstance, ISEAPair } from 'gun';
import { browser } from '$app/environment';
import type { PubKey } from '$lib/types';
import { DEFAULT_GUN_RELAYS } from './relays';

/** Namespace root all charshare data lives under in the GUN graph, per spec
 *  ("directories under the app's own namespace, starting with APP_ID and a
 *  schema version") — lets old/new clients coexist as the model evolves. */
export const APP_ID = 'charshare';
export const SCHEMA_VERSION = 'v1';

export type GunNode = IGunChain<any, any, any, any>;

let instance: IGunInstance | null = null;
let instanceRelayKey: string | null = null;

/** Lazily creates the singleton GUN instance, configured with the given relay
 *  peers (from Preferences — see getPreferences().gunRelays). Uses radisk
 *  (GUN's own storage adapter) rather than plain localStorage, matching this
 *  project's IndexedDB-only-for-persistence convention. A storage adapter is
 *  also required for chained `.get().get()...` reads to resolve at all — see
 *  gunPath/ownNode/authorNode below. Reconnecting an already-created instance
 *  to a different relay set isn't supported yet — the first caller's relays
 *  win for the lifetime of the page. */
export function getGun(relays: string[] = DEFAULT_GUN_RELAYS): IGunInstance {
	if (!browser) {
		throw new Error('GUN client is browser-only');
	}
	const relayKey = relays.join(',');
	if (instance && instanceRelayKey === relayKey) {
		return instance;
	}
	if (instance) {
		console.warn('getGun() called with different relays after the instance already exists; ignoring the new relay list.');
		return instance;
	}
	instance = new Gun({
		peers: relays,
		localStorage: false,
		radisk: true,
		file: `${APP_ID}-${SCHEMA_VERSION}`
	});
	instanceRelayKey = relayKey;
	// Gun's WebSocket wire swallows connection errors internally and just
	// silently retries (see node_modules/gun/gun.js, wire.onerror), so this is
	// the only visibility we get into whether any relay peer ever connects.
	instance.on('hi', (peer: { url?: string }) => console.log('[gun] peer connected', peer?.url));
	instance.on('bye', (peer: { url?: string }) => console.warn('[gun] peer disconnected', peer?.url));
	return instance;
}

/** Test-only escape hatch: overrides the singleton so tests can use an
 *  in-memory-only Gun instance instead of production's radisk/peers config. */
export function __setGunForTests(gun: IGunInstance | null): void {
	instance = gun;
	instanceRelayKey = gun ? '__test__' : null;
	authedPub = null;
	authPromise = null;
}

/** Resolves a slash-separated app-relative path (e.g. "tags/x/index") to a
 *  flat, unauthenticated GUN node under the charshare namespace — used for
 *  shared indexes anyone may write a best-effort pointer to (tags, network
 *  index, username claims). Joins segments into a single `.get(key)` rather
 *  than chaining; either form resolves fine once a storage adapter like
 *  radisk is enabled (confirmed by isolated testing — an earlier version of
 *  this comment claimed chaining itself was the culprit, which turned out to
 *  be a misdiagnosis of a no-storage-adapter test harness), but a flat key
 *  keeps these shared index paths visually distinct from per-author nodes. */
export function gunPath(gun: IGunInstance, path: string): GunNode {
	const segments = [APP_ID, SCHEMA_VERSION, ...path.split('/').filter(Boolean)];
	return gun.get(segments.join('/'));
}

/** Resolves `segments` under the *currently authenticated* user's protected
 *  space (`gun.user()`). Only the authenticated pair can write here — other
 *  peers reject writes to this soul that aren't validly signed by it. Call
 *  `ensureGunUserAuth` first; writing before authenticating fails silently
 *  per GUN's own behavior. */
export function ownNode(gun: IGunInstance, segments: string[]): GunNode {
	let node: GunNode = gun.user().get(APP_ID).get(SCHEMA_VERSION);
	for (const segment of segments) node = node.get(segment);
	return node;
}

/** Resolves `segments` under `pubkey`'s protected space for reading — anyone
 *  can read a user's public graph, only that user can write to it. Use this
 *  (never `ownNode`) when the author of the data being fetched isn't
 *  necessarily the current session. */
export function authorNode(gun: IGunInstance, pubkey: PubKey, segments: string[]): GunNode {
	let node: GunNode = gun.get(`~${pubkey}`);
	for (const segment of [APP_ID, SCHEMA_VERSION, ...segments]) node = node.get(segment);
	return node;
}

let authedPub: PubKey | null = null;
let authPromise: Promise<void> | null = null;

/** Authenticates the singleton GUN instance's `user()` session as `pair`, so
 *  subsequent `ownNode` writes are accepted by other peers. Idempotent for
 *  the same pair; re-authenticates if a different pair was previously used
 *  (e.g. after switching accounts — see state/auth.svelte.ts:setKeyring). */
export function ensureGunUserAuth(pair: ISEAPair): Promise<void> {
	if (authedPub === pair.pub && authPromise) return authPromise;
	authedPub = pair.pub;
	authPromise = new Promise((resolve, reject) => {
		getGun()
			.user()
			.auth(pair, (ack: { err?: string } | { ack: number }) => {
				if ('err' in ack && ack.err) {
					authedPub = null;
					authPromise = null;
					reject(new Error(ack.err));
				} else {
					resolve();
				}
			});
	});
	return authPromise;
}

/** Test-only escape hatch: forgets which pair the singleton's `user()`
 *  session was last authenticated as. */
export function __resetGunUserAuthForTests(): void {
	authedPub = null;
	authPromise = null;
}
